import type { StudioClass, StudioGroup } from '@lib/studio/types';
import {
  sortGroupsParentsFirst,
  getGroupAbsolutePosition,
  getClassAbsoluteFlowPosition,
  wouldCreateGroupParentCycle,
  expandGroupIdsWithAncestors,
  getStrictDescendantGroupIds,
  getClassIdsWithTag,
  newGroupLayoutFromSelectionBounds,
} from '@lib/studio/canvasGroupLayout';

describe('canvasGroupLayout', () => {
  describe('sortGroupsParentsFirst', () => {
    it('orders parent before child', () => {
      const groups: StudioGroup[] = [
        { id: 'child', name: 'C', metadata: { parentGroupId: 'root' } },
        { id: 'root', name: 'R', metadata: {} },
      ];
      const sorted = sortGroupsParentsFirst(groups);
      expect(sorted.map((g) => g.id)).toEqual(['root', 'child']);
    });
  });

  describe('getGroupAbsolutePosition', () => {
    it('sums nested relative origins', () => {
      const groups: StudioGroup[] = [
        { id: 'outer', name: 'O', metadata: { position: { x: 10, y: 20 } } },
        {
          id: 'inner',
          name: 'I',
          metadata: { parentGroupId: 'outer', position: { x: 5, y: -3 } },
        },
      ];
      expect(getGroupAbsolutePosition(groups, 'inner')).toEqual({ x: 15, y: 17 });
      expect(getGroupAbsolutePosition(groups, 'outer')).toEqual({ x: 10, y: 20 });
    });
  });

  describe('getClassAbsoluteFlowPosition', () => {
    it('adds group origin to relative class position', () => {
      const groups: StudioGroup[] = [
        { id: 'g1', name: 'G', metadata: { position: { x: 100, y: 50 } } },
      ];
      const cls: StudioClass = {
        name: 'X',
        properties: [],
        canvas_metadata: { group: 'g1', position: { x: 12, y: 8 } },
      };
      expect(getClassAbsoluteFlowPosition(cls, groups)).toEqual({ x: 112, y: 58 });
    });
  });

  describe('wouldCreateGroupParentCycle', () => {
    it('rejects parent pointing at self', () => {
      const groups: StudioGroup[] = [{ id: 'a', name: 'A' }];
      expect(wouldCreateGroupParentCycle(groups, 'a', 'a')).toBe(true);
    });

    it('rejects parent that is a descendant', () => {
      const groups: StudioGroup[] = [
        { id: 'p', name: 'P', metadata: {} },
        { id: 'c', name: 'C', metadata: { parentGroupId: 'p' } },
      ];
      expect(wouldCreateGroupParentCycle(groups, 'p', 'c')).toBe(true);
    });

    it('allows sibling parent', () => {
      const groups: StudioGroup[] = [
        { id: 'a', name: 'A', metadata: {} },
        { id: 'b', name: 'B', metadata: {} },
        { id: 'c', name: 'C', metadata: { parentGroupId: 'a' } },
      ];
      expect(wouldCreateGroupParentCycle(groups, 'c', 'b')).toBe(false);
    });
  });

  describe('expandGroupIdsWithAncestors', () => {
    it('includes parent chain', () => {
      const groups: StudioGroup[] = [
        { id: 'root', name: 'R', metadata: {} },
        { id: 'mid', name: 'M', metadata: { parentGroupId: 'root' } },
        { id: 'leaf', name: 'L', metadata: { parentGroupId: 'mid' } },
      ];
      const expanded = expandGroupIdsWithAncestors(groups, new Set(['leaf']));
      expect(expanded.has('root')).toBe(true);
      expect(expanded.has('mid')).toBe(true);
      expect(expanded.has('leaf')).toBe(true);
    });
  });

  describe('getStrictDescendantGroupIds', () => {
    it('returns nested children only', () => {
      const groups: StudioGroup[] = [
        { id: 'r', name: 'R', metadata: {} },
        { id: 'c1', name: 'C1', metadata: { parentGroupId: 'r' } },
        { id: 'c2', name: 'C2', metadata: { parentGroupId: 'c1' } },
      ];
      const d = getStrictDescendantGroupIds(groups, 'r');
      expect(d.has('c1')).toBe(true);
      expect(d.has('c2')).toBe(true);
      expect(d.has('r')).toBe(false);
    });
  });

  describe('getClassIdsWithTag', () => {
    it('matches exact tag on classes', () => {
      const classes: StudioClass[] = [
        { id: 'a1', name: 'A', properties: [], tags: ['api', 'core'] },
        { id: 'b1', name: 'B', properties: [], tags: ['ui'] },
      ];
      expect(getClassIdsWithTag(classes, 'api')).toEqual(['a1']);
    });
  });

  describe('newGroupLayoutFromSelectionBounds', () => {
    it('pads selection bounds', () => {
      const layout = newGroupLayoutFromSelectionBounds({
        minX: 0,
        minY: 0,
        maxX: 100,
        maxY: 40,
      });
      expect(layout.position.x).toBeLessThanOrEqual(0);
      expect(layout.dimensions.width).toBeGreaterThan(100);
    });
  });
});
