/**
 * Canvas focus mode: filter the canvas to show only a selected node (or group)
 * plus its N-degree neighbors via edges, with Escape to exit.
 * Reference: GitHub #87 — focusModeEnabled, focusModeDegree, focusOnGroup.
 */

import type { StudioGroup } from './types';
import { expandGroupIdsWithAncestors } from './canvasGroupLayout';

/** Focus mode state. */
export interface FocusModeState {
  /** Whether focus mode is currently active. */
  focusModeEnabled: boolean;
  /** Number of edge-hops to include around the focus anchor(s). Default 1. */
  focusModeDegree: number;
  /** When non-null, focus is anchored on a single node by its id. */
  focusNodeId: string | null;
  /** When non-empty, focus is anchored on all members of these groups (and nested). GitHub #240. */
  focusGroupIds: string[];
}

export const defaultFocusModeState: FocusModeState = {
  focusModeEnabled: false,
  focusModeDegree: 1,
  focusNodeId: null,
  focusGroupIds: [],
};

/** Returns true when focus mode is active (enabled and has an anchor). */
export function isFocusModeActive(state: FocusModeState): boolean {
  return (
    state.focusModeEnabled &&
    (state.focusNodeId !== null || state.focusGroupIds.length > 0)
  );
}

/** Minimal edge shape needed for BFS; avoids coupling to React Flow's full Edge type. */
export interface FocusEdge {
  source: string;
  target: string;
}

/**
 * BFS from a set of start node ids, following edges in both directions, up to `degree` hops.
 * Returns the set of all reachable node ids (including the start nodes themselves).
 */
export function getFocusedNodeIds(
  edges: FocusEdge[],
  startNodeIds: Set<string>,
  degree: number
): Set<string> {
  if (startNodeIds.size === 0) return new Set<string>();

  // Build adjacency list (undirected).
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, new Set());
    if (!adj.has(edge.target)) adj.set(edge.target, new Set());
    adj.get(edge.source)!.add(edge.target);
    adj.get(edge.target)!.add(edge.source);
  }

  const visited = new Set<string>(startNodeIds);
  let frontier = new Set<string>(startNodeIds);

  for (let d = 0; d < degree; d++) {
    const nextFrontier = new Set<string>();
    for (const nodeId of frontier) {
      const neighbors = adj.get(nodeId);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextFrontier.add(neighbor);
        }
      }
    }
    if (nextFrontier.size === 0) break;
    frontier = nextFrontier;
  }

  return visited;
}

/**
 * Returns the set of group ids that should remain visible when focus mode is active.
 * A group is visible if any of its member nodes are in the focused set.
 * Only group ids that exist in the provided `groups` array are returned, preventing
 * stale classToGroup mappings from producing non-existent group ids.
 */
export function getFocusedGroupIds(
  groups: StudioGroup[],
  focusedNodeIds: Set<string>,
  classToGroup: Map<string, string>
): Set<string> {
  const knownGroupIds = new Set(groups.map((g) => g.id));
  const visibleGroupIds = new Set<string>();
  for (const nodeId of focusedNodeIds) {
    const gid = classToGroup.get(nodeId);
    if (gid && knownGroupIds.has(gid)) visibleGroupIds.add(gid);
  }
  return expandGroupIdsWithAncestors(groups, visibleGroupIds);
}

