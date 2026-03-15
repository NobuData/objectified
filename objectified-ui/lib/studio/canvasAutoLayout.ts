/**
 * Auto-layout for canvas using dagre (DAG layout).
 * Reference: GitHub #88 — Layout functions: auto-layout, layout preview then apply.
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
function getNodeDimensions(node: Node): { width: number; height: number } {
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
    const { width, height } = getNodeDimensions(node);
    g.setNode(node.id, { width, height });
  }
  for (const edge of classEdges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedClassNodes: Node[] = classNodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    if (!nodeWithPosition) return node;
    const { width, height } = getNodeDimensions(node);
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
