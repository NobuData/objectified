/**
 * Snap dragged nodes to alignment with siblings / top-level peers (Figma-style guides).
 * Reference: GitHub #235.
 */

import type { Node, NodeChange } from '@xyflow/react';
import { getFlowNodeDimensions } from './canvasAutoLayout';

export interface AlignmentGuideState {
  verticalX: number[];
  horizontalY: number[];
}

const EMPTY_GUIDES: AlignmentGuideState = { verticalX: [], horizontalY: [] };

function anchorX(rectX: number, w: number): { left: number; center: number; right: number } {
  return {
    left: rectX,
    center: rectX + w / 2,
    right: rectX + w,
  };
}

function anchorY(rectY: number, h: number): { top: number; center: number; bottom: number } {
  return {
    top: rectY,
    center: rectY + h / 2,
    bottom: rectY + h,
  };
}

function snapAxis1D(
  selfAnchors: Record<string, number>,
  otherAnchorsList: Array<Record<string, number>>,
  threshold: number
): { delta: number; guide: number | null } {
  let bestDelta = 0;
  let bestAbs = Infinity;
  let guide: number | null = null;

  for (const otherAnchors of otherAnchorsList) {
    for (const sv of Object.values(selfAnchors)) {
      for (const ov of Object.values(otherAnchors)) {
        const delta = ov - sv;
        const ad = Math.abs(delta);
        if (ad <= threshold && ad < bestAbs - 1e-6) {
          bestAbs = ad;
          bestDelta = delta;
          guide = ov;
        }
      }
    }
  }

  if (bestAbs === Infinity) {
    return { delta: 0, guide: null };
  }
  return { delta: bestDelta, guide };
}

function collectPeerAnchors(
  moving: Node,
  nodes: Node[]
): { xPeers: Array<Record<string, number>>; yPeers: Array<Record<string, number>> } {
  const xPeers: Array<Record<string, number>> = [];
  const yPeers: Array<Record<string, number>> = [];

  for (const n of nodes) {
    if (n.id === moving.id) continue;
    if (n.type !== 'class' && n.type !== 'group') continue;

    const sameParent = (n.parentId ?? undefined) === (moving.parentId ?? undefined);
    if (!sameParent) continue;

    const { width: ow, height: oh } = getFlowNodeDimensions(n);
    const op = n.position;
    xPeers.push(anchorX(op.x, ow));
    yPeers.push(anchorY(op.y, oh));
  }

  return { xPeers, yPeers };
}

function snapPositionToPeers(
  moving: Node,
  proposed: { x: number; y: number },
  nodes: Node[],
  threshold: number
): { position: { x: number; y: number }; guides: AlignmentGuideState } {
  const { xPeers, yPeers } = collectPeerAnchors(moving, nodes);
  if (xPeers.length === 0 && yPeers.length === 0) {
    return { position: { ...proposed }, guides: EMPTY_GUIDES };
  }

  const { width: mw, height: mh } = getFlowNodeDimensions({ ...moving, position: proposed });
  const selfX = anchorX(proposed.x, mw);
  const sx = snapAxis1D(selfX, xPeers, threshold);
  const afterX = { x: proposed.x + sx.delta, y: proposed.y };
  const selfY = anchorY(afterX.y, mh);
  const sy = snapAxis1D(selfY, yPeers, threshold);

  const next = {
    x: afterX.x,
    y: afterX.y + sy.delta,
  };

  const guides: AlignmentGuideState = {
    verticalX: sx.guide != null ? [sx.guide] : [],
    horizontalY: sy.guide != null ? [sy.guide] : [],
  };

  return { position: next, guides };
}

function applyGridCorner(
  pos: { x: number; y: number },
  snapToGrid: boolean,
  gridSize: number
): { x: number; y: number } {
  if (!snapToGrid || gridSize <= 0) return pos;
  return {
    x: Math.round(pos.x / gridSize) * gridSize,
    y: Math.round(pos.y / gridSize) * gridSize,
  };
}

/**
 * Adjust node position changes to snap to peer alignment; optionally re-apply grid snap.
 * Returns updated changes and guide lines (flow coordinates) for the current drag frame.
 */
export function applyAlignmentToNodeChanges(
  changes: NodeChange[],
  nodes: Node[],
  options: {
    snapToAlignment: boolean;
    alignmentThresholdPx: number;
    snapToGrid: boolean;
    gridSize: number;
  }
): { changes: NodeChange[]; guides: AlignmentGuideState } {
  if (!options.snapToAlignment || options.alignmentThresholdPx <= 0) {
    return { changes, guides: EMPTY_GUIDES };
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const mergedGuides: AlignmentGuideState = { verticalX: [], horizontalY: [] };
  let anyDragging = false;

  const nextChanges = changes.map((change) => {
    if (change.type !== 'position' || change.position == null) {
      return change;
    }
    const moving = nodeById.get(change.id);
    if (!moving || (moving.type !== 'class' && moving.type !== 'group')) {
      return change;
    }
    if (change.dragging === true) {
      anyDragging = true;
    }

    const { position: aligned, guides } = snapPositionToPeers(
      moving,
      change.position,
      nodes,
      options.alignmentThresholdPx
    );
    const gridded = applyGridCorner(aligned, options.snapToGrid, options.gridSize);

    for (const x of guides.verticalX) {
      if (!mergedGuides.verticalX.includes(x)) mergedGuides.verticalX.push(x);
    }
    for (const y of guides.horizontalY) {
      if (!mergedGuides.horizontalY.includes(y)) mergedGuides.horizontalY.push(y);
    }

    return {
      ...change,
      position: gridded,
    };
  });

  if (!anyDragging) {
    return { changes: nextChanges, guides: EMPTY_GUIDES };
  }

  return { changes: nextChanges, guides: mergedGuides };
}
