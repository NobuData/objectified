/**
 * Layout quality metrics and suggestions for the canvas.
 * Optional hints: edge crossings, spacing. Reference: GitHub #89.
 */

import type { Node, Edge } from '@xyflow/react';

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

/** Minimum gap (px) between nodes to consider spacing "comfortable". */
const COMFORTABLE_SPACING = 40;
/** Edge crossing count above which we suggest improving layout. */
const CROSSING_HINT_THRESHOLD = 3;

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

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export function getNodeBounds(node: Node): Bounds | null {
  const pos = node.position;
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return null;
  const { width, height } = getNodeDimensions(node);
  const left = pos.x;
  const top = pos.y;
  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

/** Line segment from (x1,y1) to (x2,y2). */
function segmentIntersect(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number }
): boolean {
  const dxa = a2.x - a1.x;
  const dya = a2.y - a1.y;
  const dxb = b2.x - b1.x;
  const dyb = b2.y - b1.y;
  const denom = dxa * dyb - dya * dxb;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((b1.x - a1.x) * dyb - (b1.y - a1.y) * dxb) / denom;
  const u = ((b1.x - a1.x) * dya - (b1.y - a1.y) * dxa) / denom;
  return t > 1e-10 && t < 1 - 1e-10 && u > 1e-10 && u < 1 - 1e-10;
}

/**
 * Count pairs of edges that cross (using straight line between node centers).
 * Only considers class nodes; edges must have both source and target in the node map.
 */
export function countEdgeCrossings(
  nodes: Node[],
  edges: Edge[]
): number {
  const nodeMap = new Map<string, Node>();
  for (const n of nodes) {
    if (n.type === 'class') nodeMap.set(n.id, n);
  }
  const classEdges = edges.filter(
    (e) => nodeMap.has(e.source) && nodeMap.has(e.target)
  );
  let crossings = 0;
  for (let i = 0; i < classEdges.length; i++) {
    const ea = classEdges[i];
    const sa = nodeMap.get(ea.source);
    const ta = nodeMap.get(ea.target);
    if (!sa || !ta) continue;
    const ba = getNodeBounds(sa);
    const bb = getNodeBounds(ta);
    if (!ba || !bb) continue;
    const a1 = { x: ba.centerX, y: ba.centerY };
    const a2 = { x: bb.centerX, y: bb.centerY };
    for (let j = i + 1; j < classEdges.length; j++) {
      const eb = classEdges[j];
      if (ea.source === eb.source || ea.source === eb.target || ea.target === eb.source || ea.target === eb.target) continue;
      const sb = nodeMap.get(eb.source);
      const tb = nodeMap.get(eb.target);
      if (!sb || !tb) continue;
      const bc = getNodeBounds(sb);
      const bd = getNodeBounds(tb);
      if (!bc || !bd) continue;
      const b1 = { x: bc.centerX, y: bc.centerY };
      const b2 = { x: bd.centerX, y: bd.centerY };
      if (segmentIntersect(a1, a2, b1, b2)) crossings++;
    }
  }
  return crossings;
}

/**
 * Minimum distance between any two class node bounding boxes (only top-level).
 * Returns Infinity if fewer than two nodes.
 */
export function getMinSpacing(nodes: Node[]): number {
  const classNodes = nodes.filter((n) => n.type === 'class' && !n.parentId);
  if (classNodes.length < 2) return Infinity;
  let minDist = Infinity;
  for (let i = 0; i < classNodes.length; i++) {
    const bi = getNodeBounds(classNodes[i]);
    if (!bi) continue;
    for (let j = i + 1; j < classNodes.length; j++) {
      const bj = getNodeBounds(classNodes[j]);
      if (!bj) continue;
      const dx = Math.max(0, Math.max(bi.left - bj.right, bj.left - bi.right));
      const dy = Math.max(0, Math.max(bi.top - bj.bottom, bj.top - bi.bottom));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) minDist = dist;
    }
  }
  return minDist;
}

export interface LayoutQualityResult {
  edgeCrossings: number;
  minSpacing: number;
  suggestions: string[];
}

/**
 * Compute layout quality metrics and optional suggestions for the current canvas.
 */
export function getLayoutQuality(nodes: Node[], edges: Edge[]): LayoutQualityResult {
  const edgeCrossings = countEdgeCrossings(nodes, edges);
  const minSpacing = getMinSpacing(nodes);
  const suggestions: string[] = [];
  if (edgeCrossings >= CROSSING_HINT_THRESHOLD) {
    suggestions.push(`High edge crossings (${edgeCrossings}). Consider auto-layout or rearranging.`);
  }
  if (minSpacing !== Infinity && minSpacing < COMFORTABLE_SPACING) {
    suggestions.push(`Tight spacing (${Math.round(minSpacing)}px). Consider increasing gap between nodes.`);
  }
  return { edgeCrossings, minSpacing, suggestions };
}
