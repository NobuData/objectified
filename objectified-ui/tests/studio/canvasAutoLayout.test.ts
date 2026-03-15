/**
 * Unit tests for canvas auto-layout (dagre).
 * Reference: GitHub #88 — Layout functions: auto-layout, layoutPreviewNodes.
 */

import type { Node, Edge } from '@xyflow/react';
import {
  getLayoutedNodes,
  layoutPreviewNodes,
  type LayoutDirection,
} from '@lib/studio/canvasAutoLayout';

function node(id: string, position: { x: number; y: number }, type: 'class' | 'group' = 'class', parentId?: string): Node {
  return {
    id,
    type,
    position: { x: position.x, y: position.y },
    data: { name: id, label: id },
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
  };
}

function edge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

describe('getLayoutedNodes', () => {
  it('returns same nodes when no class nodes', () => {
    const nodes: Node[] = [
      node('g1', { x: 0, y: 0 }, 'group'),
    ];
    const edges: Edge[] = [];
    const result = getLayoutedNodes(nodes, edges);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('g1');
    expect(result[0].position).toEqual({ x: 0, y: 0 });
  });

  it('returns empty array when nodes is empty', () => {
    const result = getLayoutedNodes([], []);
    expect(result).toEqual([]);
  });

  it('layouts single class node', () => {
    const nodes: Node[] = [node('a', { x: 100, y: 100 })];
    const edges: Edge[] = [];
    const result = getLayoutedNodes(nodes, edges);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
    expect(typeof result[0].position?.x).toBe('number');
    expect(typeof result[0].position?.y).toBe('number');
  });

  it('layouts two connected class nodes (TB)', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('b', { x: 50, y: 50 }),
    ];
    const edges: Edge[] = [edge('a', 'b')];
    const result = getLayoutedNodes(nodes, edges, 'TB');
    expect(result).toHaveLength(2);
    const a = result.find((n) => n.id === 'a');
    const b = result.find((n) => n.id === 'b');
    expect(a?.position).toBeDefined();
    expect(b?.position).toBeDefined();
    expect(a?.position?.y).toBeLessThanOrEqual(b?.position?.y ?? 0);
  });

  it('leaves group nodes unchanged', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('g1', { x: 200, y: 200 }, 'group'),
    ];
    const edges: Edge[] = [];
    const result = getLayoutedNodes(nodes, edges);
    expect(result).toHaveLength(2);
    const g = result.find((n) => n.id === 'g1');
    expect(g?.type).toBe('group');
    expect(g?.position).toEqual({ x: 200, y: 200 });
  });

  it('excludes grouped class nodes from dagre layout but still returns them unchanged', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('b', { x: 50, y: 50 }),
      node('c', { x: 10, y: 10 }, 'class', 'g1'), // grouped — should not be repositioned
      node('g1', { x: 200, y: 200 }, 'group'),
    ];
    const edges: Edge[] = [edge('a', 'b')];
    const result = getLayoutedNodes(nodes, edges);
    expect(result).toHaveLength(4);
    const grouped = result.find((n) => n.id === 'c');
    expect(grouped?.position).toEqual({ x: 10, y: 10 }); // unchanged
  });

  it('uses LR direction when specified', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('b', { x: 100, y: 100 }),
    ];
    const edges: Edge[] = [edge('a', 'b')];
    const result = getLayoutedNodes(nodes, edges, 'LR');
    expect(result).toHaveLength(2);
    const a = result.find((n) => n.id === 'a');
    const b = result.find((n) => n.id === 'b');
    expect(a?.position?.x).toBeLessThanOrEqual(b?.position?.x ?? 0);
  });
});

describe('layoutPreviewNodes', () => {
  it('returns map of class node id to position', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('b', { x: 100, y: 100 }),
    ];
    const edges: Edge[] = [edge('a', 'b')];
    const map = layoutPreviewNodes(nodes, edges);
    expect(map.size).toBe(2);
    expect(map.get('a')).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    );
    expect(map.get('b')).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    );
  });

  it('excludes group nodes from map', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('g1', { x: 200, y: 200 }, 'group'),
    ];
    const edges: Edge[] = [];
    const map = layoutPreviewNodes(nodes, edges);
    expect(map.size).toBe(1);
    expect(map.has('a')).toBe(true);
    expect(map.has('g1')).toBe(false);
  });

  it('excludes grouped class nodes from map', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('c', { x: 10, y: 10 }, 'class', 'g1'), // inside a group
      node('g1', { x: 200, y: 200 }, 'group'),
    ];
    const edges: Edge[] = [];
    const map = layoutPreviewNodes(nodes, edges);
    expect(map.size).toBe(1);
    expect(map.has('a')).toBe(true);
    expect(map.has('c')).toBe(false); // grouped class excluded
    expect(map.has('g1')).toBe(false);
  });
});
