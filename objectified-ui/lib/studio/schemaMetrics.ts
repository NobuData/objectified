/**
 * Schema dependency graph metrics: circular dependencies, upstream/downstream from a node.
 * Reference: GitHub #90 — Add dependency overlay to the Canvas.
 */

export interface DependencyEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * Returns the set of edge ids that participate in at least one directed cycle.
 * Uses DFS to find back-edges and marks the back edge plus all edges on the cycle path.
 */
export function getCircularDependencyEdgeIds(
  edges: DependencyEdge[]
): Set<string> {
  const circularIds = new Set<string>();
  const outEdges = new Map<string, DependencyEdge[]>();
  for (const e of edges) {
    if (!outEdges.has(e.source)) outEdges.set(e.source, []);
    outEdges.get(e.source)!.push(e);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  /** Current DFS path: index 0 = root, last = current. Each entry is the edge we used to get there. */
  const pathEdges: string[] = [];
  /** Map from node id to its index in the current path (for cycle recovery). */
  const pathIndex = new Map<string, number>();

  function visit(nodeId: string, incomingEdgeId: string | null): void {
    if (inStack.has(nodeId)) {
      if (incomingEdgeId) circularIds.add(incomingEdgeId);
      const idx = pathIndex.get(nodeId);
      const startIdx = idx !== undefined && idx >= 0 ? idx : 0;
      for (let i = startIdx; i < pathEdges.length; i++) {
        circularIds.add(pathEdges[i]);
      }
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    inStack.add(nodeId);
    const pathLen = pathEdges.length;
    if (incomingEdgeId) {
      pathEdges.push(incomingEdgeId);
      pathIndex.set(nodeId, pathEdges.length - 1);
    }

    const nexts = outEdges.get(nodeId) ?? [];
    for (const e of nexts) {
      pathEdges.push(e.id);
      visit(e.target, e.id);
      pathEdges.pop();
    }

    inStack.delete(nodeId);
    if (incomingEdgeId && pathEdges.length > pathLen) {
      pathEdges.pop();
      pathIndex.delete(nodeId);
    }
  }

  const allNodes = new Set<string>();
  for (const e of edges) {
    allNodes.add(e.source);
    allNodes.add(e.target);
  }
  for (const n of allNodes) {
    if (!visited.has(n)) visit(n, null);
  }

  return circularIds;
}

/**
 * Returns the set of node ids that can reach the given node (following edges backward: source -> target).
 * Excludes the node itself.
 */
export function getUpstreamNodeIds(
  edges: DependencyEdge[],
  nodeId: string
): Set<string> {
  const revAdj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!revAdj.has(e.target)) revAdj.set(e.target, new Set());
    revAdj.get(e.target)!.add(e.source);
  }
  const result = new Set<string>();
  const queue: string[] = [nodeId];
  const seen = new Set<string>([nodeId]);
  while (queue.length > 0) {
    const u = queue.shift()!;
    const inNeighbors = revAdj.get(u);
    if (!inNeighbors) continue;
    for (const v of inNeighbors) {
      if (seen.has(v)) continue;
      seen.add(v);
      result.add(v);
      queue.push(v);
    }
  }
  return result;
}

/**
 * Returns the set of node ids reachable from the given node (following edges forward).
 * Excludes the node itself.
 */
export function getDownstreamNodeIds(
  edges: DependencyEdge[],
  nodeId: string
): Set<string> {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    adj.get(e.source)!.add(e.target);
  }
  const result = new Set<string>();
  const queue: string[] = [nodeId];
  const seen = new Set<string>([nodeId]);
  while (queue.length > 0) {
    const u = queue.shift()!;
    const outNeighbors = adj.get(u);
    if (!outNeighbors) continue;
    for (const v of outNeighbors) {
      if (seen.has(v)) continue;
      seen.add(v);
      result.add(v);
      queue.push(v);
    }
  }
  return result;
}

/**
 * Returns a shortest path of node ids from fromId to toId, or null if no path exists.
 */
export function getPathNodeIds(
  edges: DependencyEdge[],
  fromId: string,
  toId: string
): string[] | null {
  const adj = new Map<string, DependencyEdge[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e);
  }
  const prev = new Map<string, { nodeId: string; edgeId: string }>();
  const queue: string[] = [fromId];
  const seen = new Set<string>([fromId]);
  while (queue.length > 0) {
    const u = queue.shift()!;
    if (u === toId) {
      const path: string[] = [];
      let cur: string | undefined = toId;
      while (cur) {
        path.unshift(cur);
        cur = prev.get(cur)?.nodeId;
      }
      return path;
    }
    const out = adj.get(u) ?? [];
    for (const e of out) {
      if (seen.has(e.target)) continue;
      seen.add(e.target);
      prev.set(e.target, { nodeId: u, edgeId: e.id });
      queue.push(e.target);
    }
  }
  return null;
}
