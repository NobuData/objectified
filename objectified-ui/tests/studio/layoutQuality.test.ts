/**
 * Unit tests for layout quality metrics (edge crossings, spacing, suggestions).
 * Reference: GitHub #89 — Add layout hinting to the canvas.
 */

import type { Node, Edge } from '@xyflow/react';
import {
  getNodeBounds,
  countEdgeCrossings,
  getMinSpacing,
  getLayoutQuality,
} from '@lib/studio/layoutQuality';

function node(
  id: string,
  position: { x: number; y: number },
  type: 'class' | 'group' = 'class',
  parentId?: string,
  dimensions?: { width: number; height: number }
): Node {
  return {
    id,
    type,
    position: { x: position.x, y: position.y },
    data: { name: id },
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    ...(dimensions ? { style: dimensions } : {}),
  };
}

function edge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

describe('getNodeBounds', () => {
  it('returns bounds from position and default dimensions', () => {
    const n = node('a', { x: 100, y: 50 });
    const b = getNodeBounds(n);
    expect(b).not.toBeNull();
    expect(b!.left).toBe(100);
    expect(b!.top).toBe(50);
    expect(b!.right).toBeGreaterThan(100);
    expect(b!.bottom).toBeGreaterThan(50);
    expect(b!.centerX).toBe(b!.left + (b!.right - b!.left) / 2);
    expect(b!.centerY).toBe(b!.top + (b!.bottom - b!.top) / 2);
  });

  it('returns bounds using style dimensions', () => {
    const n = node('a', { x: 0, y: 0 }, 'class', undefined, { width: 300, height: 80 });
    const b = getNodeBounds(n);
    expect(b).not.toBeNull();
    expect(b!.right - b!.left).toBe(300);
    expect(b!.bottom - b!.top).toBe(80);
  });

  it('returns null when node has no position', () => {
    const n = node('a', { x: 0, y: 0 });
    delete (n as Partial<Node>).position;
    expect(getNodeBounds(n)).toBeNull();
  });
});

describe('countEdgeCrossings', () => {
  it('returns 0 when no edges', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('b', { x: 100, y: 100 }),
    ];
    expect(countEdgeCrossings(nodes, [])).toBe(0);
  });

  it('returns 0 when two edges do not cross', () => {
    // a above b, c left of d — edges a-b and c-d don't cross
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('b', { x: 0, y: 150 }),
      node('c', { x: 0, y: 75 }),
      node('d', { x: 200, y: 75 }),
    ];
    const edges: Edge[] = [edge('a', 'b'), edge('c', 'd')];
    expect(countEdgeCrossings(nodes, edges)).toBe(0);
  });

  it('returns 1 when two edges cross', () => {
    // a-b vertical, c-d horizontal crossing in the middle
    const nodes: Node[] = [
      node('a', { x: 50, y: 0 }),
      node('b', { x: 50, y: 100 }),
      node('c', { x: 0, y: 50 }),
      node('d', { x: 100, y: 50 }),
    ];
    const edges: Edge[] = [edge('a', 'b'), edge('c', 'd')];
    expect(countEdgeCrossings(nodes, edges)).toBe(1);
  });

  it('ignores edges that share a node', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('b', { x: 100, y: 0 }),
      node('c', { x: 50, y: 100 }),
    ];
    const edges: Edge[] = [edge('a', 'b'), edge('a', 'c')];
    expect(countEdgeCrossings(nodes, edges)).toBe(0);
  });

  it('ignores group nodes', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('b', { x: 100, y: 100 }),
      node('g', { x: 50, y: 50 }, 'group'),
    ];
    const edges: Edge[] = [edge('a', 'b')];
    expect(countEdgeCrossings(nodes, edges)).toBe(0);
  });
});

describe('getMinSpacing', () => {
  it('returns Infinity when fewer than two class nodes', () => {
    expect(getMinSpacing([])).toBe(Infinity);
    expect(getMinSpacing([node('a', { x: 0, y: 0 })])).toBe(Infinity);
  });

  it('returns gap between two nodes', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }, 'class', undefined, { width: 100, height: 50 }),
      node('b', { x: 150, y: 0 }, 'class', undefined, { width: 100, height: 50 }),
    ];
    const min = getMinSpacing(nodes);
    expect(min).toBe(50); // 150 - 100 = 50 horizontal gap
  });

  it('excludes grouped class nodes', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('b', { x: 10, y: 10 }, 'class', 'g1'),
      node('g1', { x: 0, y: 0 }, 'group'),
    ];
    const min = getMinSpacing(nodes);
    expect(min).toBe(Infinity); // only one top-level class node
  });
});

describe('getLayoutQuality', () => {
  it('returns edge crossings and min spacing', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }),
      node('b', { x: 300, y: 0 }),
    ];
    const edges: Edge[] = [edge('a', 'b')];
    const result = getLayoutQuality(nodes, edges);
    expect(result.edgeCrossings).toBe(0);
    expect(result.minSpacing).not.toBe(Infinity);
    expect(result.suggestions).toEqual([]);
  });

  it('adds suggestion when edge crossings >= 3', () => {
    // Vertical segment a-b and three horizontal segments that cross it -> 3 crossings
    const nodes: Node[] = [
      node('a', { x: 50, y: 0 }),
      node('b', { x: 50, y: 100 }),
      node('c', { x: 0, y: 25 }),
      node('d', { x: 100, y: 25 }),
      node('e', { x: 0, y: 50 }),
      node('f', { x: 100, y: 50 }),
      node('g', { x: 0, y: 75 }),
      node('h', { x: 100, y: 75 }),
    ];
    const edges: Edge[] = [
      edge('a', 'b'),
      edge('c', 'd'),
      edge('e', 'f'),
      edge('g', 'h'),
    ];
    const result = getLayoutQuality(nodes, edges);
    expect(result.edgeCrossings).toBeGreaterThanOrEqual(3);
    const crossingSuggestion = result.suggestions.find((s) =>
      s.includes('edge crossings')
    );
    expect(crossingSuggestion).toBeDefined();
  });

  it('adds suggestion when min spacing is tight', () => {
    const nodes: Node[] = [
      node('a', { x: 0, y: 0 }, 'class', undefined, { width: 100, height: 50 }),
      node('b', { x: 115, y: 0 }, 'class', undefined, { width: 100, height: 50 }),
    ];
    const edges: Edge[] = [];
    const result = getLayoutQuality(nodes, edges);
    expect(result.minSpacing).toBeLessThan(40);
    const spacingSuggestion = result.suggestions.find((s) =>
      s.includes('Tight spacing')
    );
    expect(spacingSuggestion).toBeDefined();
  });
});
