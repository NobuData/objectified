/**
 * Unit tests for canvas focus mode logic. GitHub #87.
 */

import {
  defaultFocusModeState,
  isFocusModeActive,
  getFocusedNodeIds,
  getFocusedGroupIds,
  type FocusModeState,
  type FocusEdge,
} from '@lib/studio/canvasFocusMode';
import type { StudioGroup } from '@lib/studio/types';

describe('canvasFocusMode', () => {
  describe('defaultFocusModeState', () => {
    it('has focus mode disabled by default', () => {
      expect(defaultFocusModeState.focusModeEnabled).toBe(false);
      expect(defaultFocusModeState.focusModeDegree).toBe(1);
      expect(defaultFocusModeState.focusNodeId).toBeNull();
      expect(defaultFocusModeState.focusGroupId).toBeNull();
    });
  });

  describe('isFocusModeActive', () => {
    it('returns false when disabled', () => {
      expect(isFocusModeActive(defaultFocusModeState)).toBe(false);
    });

    it('returns false when enabled but no anchor', () => {
      const state: FocusModeState = {
        ...defaultFocusModeState,
        focusModeEnabled: true,
      };
      expect(isFocusModeActive(state)).toBe(false);
    });

    it('returns true when enabled with a node anchor', () => {
      const state: FocusModeState = {
        ...defaultFocusModeState,
        focusModeEnabled: true,
        focusNodeId: 'node-1',
      };
      expect(isFocusModeActive(state)).toBe(true);
    });

    it('returns true when enabled with a group anchor', () => {
      const state: FocusModeState = {
        ...defaultFocusModeState,
        focusModeEnabled: true,
        focusGroupId: 'group-1',
      };
      expect(isFocusModeActive(state)).toBe(true);
    });

    it('returns false when disabled even with an anchor', () => {
      const state: FocusModeState = {
        ...defaultFocusModeState,
        focusModeEnabled: false,
        focusNodeId: 'node-1',
      };
      expect(isFocusModeActive(state)).toBe(false);
    });
  });

  describe('getFocusedNodeIds', () => {
    // Graph: A -> B -> C -> D, A -> E (branching)
    const edges: FocusEdge[] = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'D' },
      { source: 'A', target: 'E' },
    ];

    it('returns empty set for empty start nodes', () => {
      const result = getFocusedNodeIds(edges, new Set(), 1);
      expect(result.size).toBe(0);
    });

    it('degree 0: returns only the start node', () => {
      const result = getFocusedNodeIds(edges, new Set(['A']), 0);
      expect(result).toEqual(new Set(['A']));
    });

    it('degree 1: returns start node + direct neighbors', () => {
      const result = getFocusedNodeIds(edges, new Set(['A']), 1);
      expect(result).toEqual(new Set(['A', 'B', 'E']));
    });

    it('degree 2: returns start node + 2-hop neighbors', () => {
      const result = getFocusedNodeIds(edges, new Set(['A']), 2);
      expect(result).toEqual(new Set(['A', 'B', 'C', 'E']));
    });

    it('degree 3: reaches all connected nodes', () => {
      const result = getFocusedNodeIds(edges, new Set(['A']), 3);
      expect(result).toEqual(new Set(['A', 'B', 'C', 'D', 'E']));
    });

    it('high degree does not exceed graph limits', () => {
      const result = getFocusedNodeIds(edges, new Set(['A']), 100);
      expect(result).toEqual(new Set(['A', 'B', 'C', 'D', 'E']));
    });

    it('handles edges in reverse direction (undirected traversal)', () => {
      const result = getFocusedNodeIds(edges, new Set(['D']), 1);
      expect(result).toEqual(new Set(['D', 'C']));
    });

    it('handles disconnected nodes (not in any edge)', () => {
      const result = getFocusedNodeIds(edges, new Set(['X']), 1);
      expect(result).toEqual(new Set(['X']));
    });

    it('handles cycles in the graph', () => {
      const cycleEdges: FocusEdge[] = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'A' },
      ];
      const result = getFocusedNodeIds(cycleEdges, new Set(['A']), 1);
      expect(result).toEqual(new Set(['A', 'B', 'C']));
    });

    it('multiple start nodes (group focus)', () => {
      const result = getFocusedNodeIds(edges, new Set(['B', 'E']), 1);
      // B neighbors: A, C; E neighbors: A
      expect(result).toEqual(new Set(['A', 'B', 'C', 'E']));
    });

    it('works with no edges', () => {
      const result = getFocusedNodeIds([], new Set(['A']), 1);
      expect(result).toEqual(new Set(['A']));
    });

    it('starting from middle node with degree 1', () => {
      const result = getFocusedNodeIds(edges, new Set(['B']), 1);
      expect(result).toEqual(new Set(['A', 'B', 'C']));
    });
  });

  describe('getFocusedGroupIds', () => {
    const groups: StudioGroup[] = [
      { id: 'g1', name: 'Group 1' },
      { id: 'g2', name: 'Group 2' },
      { id: 'g3', name: 'Group 3' },
    ];

    const classToGroup = new Map<string, string>([
      ['A', 'g1'],
      ['B', 'g1'],
      ['C', 'g2'],
      ['D', 'g3'],
    ]);

    it('returns groups whose members are in focused set', () => {
      const focusedNodeIds = new Set(['A', 'B', 'C']);
      const result = getFocusedGroupIds(groups, focusedNodeIds, classToGroup);
      expect(result).toEqual(new Set(['g1', 'g2']));
    });

    it('returns empty set when no focused nodes belong to groups', () => {
      const focusedNodeIds = new Set(['X', 'Y']);
      const result = getFocusedGroupIds(groups, focusedNodeIds, classToGroup);
      expect(result.size).toBe(0);
    });

    it('returns all groups when all members are focused', () => {
      const focusedNodeIds = new Set(['A', 'B', 'C', 'D']);
      const result = getFocusedGroupIds(groups, focusedNodeIds, classToGroup);
      expect(result).toEqual(new Set(['g1', 'g2', 'g3']));
    });

    it('handles empty focused set', () => {
      const result = getFocusedGroupIds(groups, new Set(), classToGroup);
      expect(result.size).toBe(0);
    });

    it('handles empty classToGroup mapping', () => {
      const focusedNodeIds = new Set(['A', 'B']);
      const result = getFocusedGroupIds(groups, focusedNodeIds, new Map());
      expect(result.size).toBe(0);
    });

    it('filters out stale group ids not present in groups array', () => {
      // classToGroup references 'stale-group' which is not in the groups array.
      const staleClassToGroup = new Map<string, string>([
        ['A', 'g1'],
        ['B', 'stale-group'],
      ]);
      const focusedNodeIds = new Set(['A', 'B']);
      const result = getFocusedGroupIds(groups, focusedNodeIds, staleClassToGroup);
      // Only 'g1' is valid; 'stale-group' is not in groups and must be excluded.
      expect(result).toEqual(new Set(['g1']));
    });

    it('returns empty set when groups array is empty', () => {
      const focusedNodeIds = new Set(['A', 'B', 'C']);
      const result = getFocusedGroupIds([], focusedNodeIds, classToGroup);
      expect(result.size).toBe(0);
    });
  });
});

