/**
 * Unit tests for schema dependency graph metrics.
 * Reference: GitHub #90 — Add dependency overlay to the Canvas.
 */

import {
  getCircularDependencyEdgeIds,
  getUpstreamNodeIds,
  getDownstreamNodeIds,
  getPathNodeIds,
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
