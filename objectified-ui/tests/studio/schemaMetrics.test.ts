/**
 * Unit tests for schema dependency graph metrics.
 * Reference: GitHub #90 — Add dependency overlay to the Canvas.
 */

import {
  getCircularDependencyEdgeIds,
  getUpstreamNodeIds,
  getDownstreamNodeIds,
  getPathNodeIds,
  getMaxDepthFromNode,
  getSchemaMaxDepth,
  getNodesInCircularDependency,
  type DependencyEdge,
} from '@lib/studio/schemaMetrics';

function e(id: string, source: string, target: string): DependencyEdge {
  return { id, source, target };
}

describe('getCircularDependencyEdgeIds', () => {
  it('returns empty set when no edges', () => {
    expect(getCircularDependencyEdgeIds([])).toEqual(new Set());
  });

  it('returns empty set when no cycle', () => {
    const edges = [e('1', 'a', 'b'), e('2', 'b', 'c')];
    expect(getCircularDependencyEdgeIds(edges)).toEqual(new Set());
  });

  it('returns edge ids in a single-node self-loop', () => {
    const edges = [e('self', 'x', 'x')];
    expect(getCircularDependencyEdgeIds(edges)).toEqual(new Set(['self']));
  });

  it('returns all edge ids in a simple cycle', () => {
    const edges = [e('1', 'a', 'b'), e('2', 'b', 'c'), e('3', 'c', 'a')];
    expect(getCircularDependencyEdgeIds(edges)).toEqual(new Set(['1', '2', '3']));
  });

  it('returns edge ids in cycle when graph has other edges', () => {
    const edges = [
      e('1', 'a', 'b'),
      e('2', 'b', 'a'),
      e('3', 'b', 'c'),
      e('4', 'c', 'd'),
    ];
    expect(getCircularDependencyEdgeIds(edges)).toEqual(new Set(['1', '2']));
  });

  it('does not mark tail edge as circular when tail leads into a cycle (a→b, b→c, c→b)', () => {
    // a→b is a tail edge; b→c→b is the cycle
    const edges = [e('1', 'a', 'b'), e('2', 'b', 'c'), e('3', 'c', 'b')];
    expect(getCircularDependencyEdgeIds(edges)).toEqual(new Set(['2', '3']));
  });
});

describe('getUpstreamNodeIds', () => {
  it('returns empty set when no edges', () => {
    expect(getUpstreamNodeIds([], 'a')).toEqual(new Set());
  });

  it('returns nodes that can reach the given node', () => {
    const edges = [e('1', 'x', 'a'), e('2', 'y', 'x'), e('3', 'a', 'b')];
    expect(getUpstreamNodeIds(edges, 'a')).toEqual(new Set(['x', 'y']));
  });

  it('excludes the node itself', () => {
    const edges = [e('1', 'a', 'b')];
    expect(getUpstreamNodeIds(edges, 'a')).toEqual(new Set());
  });
});

describe('getDownstreamNodeIds', () => {
  it('returns empty set when no edges', () => {
    expect(getDownstreamNodeIds([], 'a')).toEqual(new Set());
  });

  it('returns nodes reachable from the given node', () => {
    const edges = [e('1', 'a', 'x'), e('2', 'x', 'y'), e('3', 'b', 'z')];
    expect(getDownstreamNodeIds(edges, 'a')).toEqual(new Set(['x', 'y']));
  });

  it('excludes the node itself', () => {
    const edges = [e('1', 'a', 'b')];
    expect(getDownstreamNodeIds(edges, 'a')).toEqual(new Set(['b']));
  });
});

describe('getPathNodeIds', () => {
  it('returns null when no path', () => {
    const edges = [e('1', 'a', 'b'), e('2', 'c', 'd')];
    expect(getPathNodeIds(edges, 'a', 'd')).toBeNull();
  });

  it('returns single-node path when fromId equals toId', () => {
    const edges = [e('1', 'a', 'b')];
    expect(getPathNodeIds(edges, 'a', 'a')).toEqual(['a']);
  });

  it('returns shortest path', () => {
    const edges = [
      e('1', 'a', 'b'),
      e('2', 'b', 'c'),
      e('3', 'c', 'd'),
      e('4', 'a', 'c'),
    ];
    expect(getPathNodeIds(edges, 'a', 'd')).toEqual(['a', 'c', 'd']);
  });
});

describe('getMaxDepthFromNode', () => {
  it('returns 0 when no edges', () => {
    expect(getMaxDepthFromNode([], 'a')).toBe(0);
  });

  it('returns 0 when node has no outgoing edges', () => {
    const edges = [e('1', 'a', 'b')];
    expect(getMaxDepthFromNode(edges, 'b')).toBe(0);
  });

  it('returns 1 for single edge from node', () => {
    const edges = [e('1', 'a', 'b')];
    expect(getMaxDepthFromNode(edges, 'a')).toBe(1);
  });

  it('returns max path length downstream', () => {
    const edges = [
      e('1', 'a', 'b'),
      e('2', 'b', 'c'),
      e('3', 'c', 'd'),
      e('4', 'a', 'x'),
    ];
    expect(getMaxDepthFromNode(edges, 'a')).toBe(3);
  });

  it('does not infinite loop on cycle; uses simple path', () => {
    const edges = [e('1', 'a', 'b'), e('2', 'b', 'c'), e('3', 'c', 'a')];
    expect(getMaxDepthFromNode(edges, 'a')).toBe(2);
  });
});

describe('getSchemaMaxDepth', () => {
  it('returns 0 when no edges', () => {
    expect(getSchemaMaxDepth([])).toBe(0);
  });

  it('returns max depth over all nodes', () => {
    const edges = [
      e('1', 'a', 'b'),
      e('2', 'b', 'c'),
      e('3', 'c', 'd'),
      e('4', 'x', 'y'),
    ];
    expect(getSchemaMaxDepth(edges)).toBe(3);
  });
});

describe('getNodesInCircularDependency', () => {
  it('returns empty set when no edges', () => {
    expect(getNodesInCircularDependency([])).toEqual(new Set());
  });

  it('returns empty set when no cycle', () => {
    const edges = [e('1', 'a', 'b'), e('2', 'b', 'c')];
    expect(getNodesInCircularDependency(edges)).toEqual(new Set());
  });

  it('returns nodes incident to circular edges', () => {
    const edges = [e('1', 'a', 'b'), e('2', 'b', 'a')];
    expect(getNodesInCircularDependency(edges)).toEqual(new Set(['a', 'b']));
  });

  it('returns only nodes in cycle when graph has other edges', () => {
    const edges = [
      e('1', 'a', 'b'),
      e('2', 'b', 'a'),
      e('3', 'b', 'c'),
      e('4', 'c', 'd'),
    ];
    expect(getNodesInCircularDependency(edges)).toEqual(new Set(['a', 'b']));
  });
});
