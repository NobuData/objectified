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
  /** Current DFS path as a stack of node ids (index 0 = root, last = current). */
  const nodeStack: string[] = [];
  /** Index of each node in the current nodeStack. */
  const nodeStackIdx = new Map<string, number>();
  /** Edge id used to first enter each node currently in the DFS stack. */
  const parentEdge = new Map<string, string>();

  function visit(nodeId: string, incomingEdgeId: string | null): void {
    if (inStack.has(nodeId)) {
      // Back-edge found: mark the back-edge and all edges on the cycle path.
      // The cycle runs from nodeId (in the stack) up to the current top, plus this back-edge.
      if (incomingEdgeId) circularIds.add(incomingEdgeId);
      const cycleStartIdx = nodeStackIdx.get(nodeId) ?? 0;
      for (let i = cycleStartIdx + 1; i < nodeStack.length; i++) {
        const edgeId = parentEdge.get(nodeStack[i]);
        if (edgeId) circularIds.add(edgeId);
      }
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    inStack.add(nodeId);
    nodeStackIdx.set(nodeId, nodeStack.length);
    nodeStack.push(nodeId);
    if (incomingEdgeId) parentEdge.set(nodeId, incomingEdgeId);

    const nexts = outEdges.get(nodeId) ?? [];
    for (const e of nexts) {
      visit(e.target, e.id);
    }

    nodeStack.pop();
    nodeStackIdx.delete(nodeId);
    parentEdge.delete(nodeId);
    inStack.delete(nodeId);
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
  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++];
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
  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++];
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
  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++];
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
