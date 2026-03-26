/**
 * Auto-layout for canvas using dagre (DAG layout).
 * Reference: GitHub #88 — Layout functions: auto-layout, layout preview then apply.
 * Reference: GitHub #240 — layout by group (groups arranged, then members per group).
 */

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

export type LayoutDirection = 'TB' | 'LR';

/**
 * Get width and height for a node for layout. Uses measured dimensions,
 * style dimensions, or defaults.
 */
export function getFlowNodeDimensions(node: Node): { width: number; height: number } {
  const m = node.measured;
  if (m && typeof m.width === 'number' && typeof m.height === 'number') {
    return { width: m.width, height: m.height };
  }
  const style = node.style as { width?: number; height?: number } | undefined;
  if (style) {
    const w = typeof style.width === 'number' ? style.width : DEFAULT_NODE_WIDTH;
    const h = typeof style.height === 'number' ? style.height : DEFAULT_NODE_HEIGHT;
    return { width: w, height: h };
  }
  return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
}

/**
 * Run dagre layout on the given nodes and edges. Only class nodes are repositioned;
 * group nodes are returned unchanged. Edges are filtered to those between class nodes.
 * Returns new nodes array with updated positions for class nodes.
 */
export function getLayoutedNodes(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'TB'
): Node[] {
  // Only layout top-level (ungrouped) class nodes; grouped nodes use parent-relative positions
  const classNodes = nodes.filter((n) => n.type === 'class' && !n.parentId);
  const groupedClassNodes = nodes.filter((n) => n.type === 'class' && !!n.parentId);
  const groupNodes = nodes.filter((n) => n.type === 'group');
  const classIds = new Set(classNodes.map((n) => n.id));
  const classEdges = edges.filter(
    (e) => classIds.has(e.source) && classIds.has(e.target)
  );

  if (classNodes.length === 0) {
    return nodes;
  }

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60 });

  for (const node of classNodes) {
    const { width, height } = getFlowNodeDimensions(node);
    g.setNode(node.id, { width, height });
  }
  for (const edge of classEdges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedClassNodes: Node[] = classNodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    if (!nodeWithPosition) return node;
    const { width, height } = getFlowNodeDimensions(node);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return [...layoutedClassNodes, ...groupedClassNodes, ...groupNodes];
}

/**
 * Compute layouted positions for preview or apply. Returns a map of node id to
 * position for class nodes only (for applying to studio state and default layout).
 */
export function layoutPreviewNodes(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'TB'
): Map<string, { x: number; y: number }> {
  const layouted = getLayoutedNodes(nodes, edges, direction);
  const map = new Map<string, { x: number; y: number }>();
  for (const node of layouted) {
    if (node.type === 'class' && !node.parentId && node.position) {
      map.set(node.id, { x: node.position.x, y: node.position.y });
    }
  }
  return map;
}

function cloneNodeForLayout(n: Node): Node {
  return {
    ...n,
    position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
    style: n.style ? { ...(n.style as Record<string, unknown>) } : undefined,
    data: n.data ? { ...(n.data as Record<string, unknown>) } : {},
  };
}

function getRootContainerId(nodeId: string, byId: Map<string, Node>): string {
  let cur: string | undefined = nodeId;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const n = byId.get(cur);
    if (!n?.parentId) return cur;
    cur = n.parentId;
  }
  return cur;
}

function runDagreLayout(
  subsetNodes: Node[],
  subsetEdges: Edge[],
  direction: LayoutDirection
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (subsetNodes.length === 0) return out;

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60 });

  for (const node of subsetNodes) {
    const { width, height } = getFlowNodeDimensions(node);
    g.setNode(node.id, { width, height });
  }
  for (const edge of subsetEdges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  for (const node of subsetNodes) {
    const nodeWithPosition = g.node(node.id);
    if (!nodeWithPosition) continue;
    const { width, height } = getFlowNodeDimensions(node);
    out.set(node.id, {
      x: nodeWithPosition.x - width / 2,
      y: nodeWithPosition.y - height / 2,
    });
  }
  return out;
}

const GROUP_INTERIOR_PADDING = 24;

/**
 * Hierarchical auto-layout: dagre inside each group (deepest first), then dagre on
 * top-level groups and ungrouped classes. Updates group frame sizes to fit content.
 * GitHub #240.
 */
export function getLayoutedNodesByGroup(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'TB'
): Node[] {
  const byId = new Map<string, Node>();
  for (const n of nodes) {
    byId.set(n.id, cloneNodeForLayout(n));
  }

  function depthOf(groupId: string): number {
    let d = 0;
    let cur: string | undefined = groupId;
    const seen = new Set<string>();
    while (cur) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const n = byId.get(cur);
      if (!n?.parentId) break;
      d++;
      cur = n.parentId;
    }
    return d;
  }

  const groupNodes = nodes.filter((n) => n.type === 'group');
  const sortedGroups = [...groupNodes].sort((a, b) => depthOf(b.id) - depthOf(a.id));

  for (const gNode of sortedGroups) {
    const gid = gNode.id;
    const memberClasses = nodes.filter((n) => n.type === 'class' && n.parentId === gid);
    if (memberClasses.length === 0) continue;

    const memberIds = new Set(memberClasses.map((m) => m.id));
    const internalEdges = edges.filter(
      (e) => memberIds.has(e.source) && memberIds.has(e.target)
    );
    const posMap = runDagreLayout(
      memberClasses.map((m) => byId.get(m.id)!),
      internalEdges,
      direction
    );
    for (const [id, pos] of posMap) {
      const n = byId.get(id);
      if (n) n.position = pos;
    }

    const children = nodes.filter(
      (n) => n.parentId === gid && (n.type === 'class' || n.type === 'group')
    );
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const bump = (x: number, y: number, w: number, h: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    };
    for (const ch of children) {
      const nm = byId.get(ch.id);
      if (!nm) continue;
      const { width, height } = getFlowNodeDimensions(nm);
      const x = nm.position?.x ?? 0;
      const y = nm.position?.y ?? 0;
      bump(x, y, width, height);
    }
    if (!Number.isFinite(minX)) continue;

    const gn = byId.get(gid);
    if (!gn) continue;
    const style = (gn.style ?? {}) as { width?: number; height?: number };
    const newW = Math.max(style.width ?? 280, maxX - minX + GROUP_INTERIOR_PADDING * 2);
    const newH = Math.max(style.height ?? 160, maxY - minY + GROUP_INTERIOR_PADDING * 2);
    gn.style = { ...style, width: newW, height: newH };

    const shiftX = GROUP_INTERIOR_PADDING - minX;
    const shiftY = GROUP_INTERIOR_PADDING - minY;
    for (const ch of children) {
      const nm = byId.get(ch.id);
      if (nm?.position) {
        nm.position = {
          x: (nm.position.x ?? 0) + shiftX,
          y: (nm.position.y ?? 0) + shiftY,
        };
      }
    }
  }

  const roots = nodes.filter(
    (n) => !n.parentId && (n.type === 'class' || n.type === 'group')
  );
  const rootIds = new Set(roots.map((r) => r.id));
  const superEdgeKeys = new Set<string>();
  const superEdges: Edge[] = [];

  for (const e of edges) {
    if (e.source === e.target) continue;
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const rs = getRootContainerId(e.source, byId);
    const rt = getRootContainerId(e.target, byId);
    if (rs === rt) continue;
    if (!rootIds.has(rs) || !rootIds.has(rt)) continue;
    const k = rs < rt ? `${rs}|${rt}` : `${rt}|${rs}`;
    if (superEdgeKeys.has(k)) continue;
    superEdgeKeys.add(k);
    superEdges.push({ id: `super-${rs}-${rt}`, source: rs, target: rt });
  }

  const rootFlowNodes = roots.map((r) => byId.get(r.id)!);
  const rootPos = runDagreLayout(rootFlowNodes, superEdges, direction);
  for (const [id, pos] of rootPos) {
    const n = byId.get(id);
    if (n) n.position = pos;
  }

  return Array.from(byId.values());
}
