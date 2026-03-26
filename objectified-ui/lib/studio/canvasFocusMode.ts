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
  /**
   * When non-null, focus is anchored on a single node by its id.
   * @deprecated Prefer `focusNodeIds` for all new features.
   */
  focusNodeId: string | null;
  /** When non-empty, focus is anchored on these node ids (union). GitHub #244. */
  focusNodeIds: string[];
  /** When non-empty, focus is anchored on all members of these groups (and nested). GitHub #240. */
  focusGroupIds: string[];
  /** Focus expansion direction along edges (GitHub #244). */
  focusDirection: FocusDirection;
  /** How to display non-focused nodes while focus mode is active (GitHub #244). */
  focusDisplayMode: FocusDisplayMode;
}

export const defaultFocusModeState: FocusModeState = {
  focusModeEnabled: false,
  focusModeDegree: 1,
  focusNodeId: null,
  focusNodeIds: [],
  focusGroupIds: [],
  focusDirection: 'both',
  focusDisplayMode: 'hide',
};

/** Returns true when focus mode is active (enabled and has an anchor). */
export function isFocusModeActive(state: FocusModeState): boolean {
  return (
    state.focusModeEnabled &&
    (state.focusNodeId !== null ||
      state.focusNodeIds.length > 0 ||
      state.focusGroupIds.length > 0)
  );
}

/** Minimal edge shape needed for BFS; avoids coupling to React Flow's full Edge type. */
export interface FocusEdge {
  source: string;
  target: string;
}

export type FocusDirection = 'upstream' | 'downstream' | 'both';

export type FocusDisplayMode = 'hide' | 'fade';

function addAdj(adj: Map<string, Set<string>>, from: string, to: string) {
  if (!adj.has(from)) adj.set(from, new Set());
  adj.get(from)!.add(to);
}

function buildAdjacency(edges: FocusEdge[], direction: FocusDirection) {
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    // Ensure both ends exist, so isolated start nodes stay in the visited set.
    if (!adj.has(edge.source)) adj.set(edge.source, new Set());
    if (!adj.has(edge.target)) adj.set(edge.target, new Set());
    if (direction === 'downstream' || direction === 'both') {
      addAdj(adj, edge.source, edge.target);
    }
    if (direction === 'upstream' || direction === 'both') {
      addAdj(adj, edge.target, edge.source);
    }
  }
  return adj;
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
  return getFocusedNodeIdsWithDirection(edges, startNodeIds, degree, 'both');
}

/**
 * BFS from a set of start node ids, following edges in the given direction.
 * - downstream: `source -> target`
 * - upstream: `target -> source`
 * - both: treat as undirected
 * Returns the set of all reachable node ids (including the start nodes themselves).
 */
export function getFocusedNodeIdsWithDirection(
  edges: FocusEdge[],
  startNodeIds: Set<string>,
  degree: number,
  direction: FocusDirection
): Set<string> {
  if (startNodeIds.size === 0) return new Set<string>();

  const adj = buildAdjacency(edges, direction);

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
 * Return nodes on the shortest path from `fromId` to `toId`.
 * Direction controls which edge direction is allowed.
 * Returns `null` when no path exists.
 */
export function getNodesOnShortestPath(
  edges: FocusEdge[],
  fromId: string,
  toId: string,
  direction: FocusDirection
): string[] | null {
  if (!fromId || !toId) return null;
  if (fromId === toId) return [fromId];
  const adj = buildAdjacency(edges, direction);
  const q: string[] = [fromId];
  const prev = new Map<string, string | null>();
  prev.set(fromId, null);
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const nbrs = adj.get(cur);
    if (!nbrs) continue;
    for (const n of nbrs) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === toId) {
        const path: string[] = [];
        let step: string | null = toId;
        while (step) {
          path.push(step);
          step = prev.get(step) ?? null;
        }
        path.reverse();
        return path;
      }
      q.push(n);
    }
  }
  return null;
}

/**
 * Return node ids that appear on (up to) `maxPaths` simple paths between `fromId` and `toId`.
 * This is intentionally capped to avoid runaway path explosion on dense graphs.
 */
export function getNodesOnAllPathsCapped(
  edges: FocusEdge[],
  fromId: string,
  toId: string,
  direction: FocusDirection,
  opts?: { maxDepth?: number; maxPaths?: number }
): Set<string> {
  const maxDepth = Math.max(1, Math.min(opts?.maxDepth ?? 20, 200));
  const maxPaths = Math.max(1, Math.min(opts?.maxPaths ?? 50, 500));
  const adj = buildAdjacency(edges, direction);
  const result = new Set<string>();
  if (!fromId || !toId) return result;
  if (fromId === toId) return new Set([fromId]);

  let found = 0;
  const stack: string[] = [fromId];
  const inPath = new Set<string>([fromId]);

  const dfs = (cur: string, depth: number) => {
    if (found >= maxPaths) return;
    if (depth > maxDepth) return;
    if (cur === toId) {
      for (const id of stack) result.add(id);
      found++;
      return;
    }
    const nbrs = adj.get(cur);
    if (!nbrs) return;
    for (const n of nbrs) {
      if (found >= maxPaths) return;
      if (inPath.has(n)) continue;
      inPath.add(n);
      stack.push(n);
      dfs(n, depth + 1);
      stack.pop();
      inPath.delete(n);
    }
  };

  dfs(fromId, 0);
  return result;
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

