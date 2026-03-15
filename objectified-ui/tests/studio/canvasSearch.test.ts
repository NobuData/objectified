/**
 * Unit tests for canvas search state and filter logic. GitHub #85.
 */

import type { StudioClass, StudioGroup } from '@lib/studio/types';
import {
  defaultCanvasSearchState,
  classMatchesSearch,
  getVisibleClassIds,
  getVisibleGroupIds,
  type CanvasSearchState,
} from '@lib/studio/canvasSearch';

function makeClass(overrides: Partial<StudioClass> & { name: string }): StudioClass {
  return {
    name: overrides.name,
    properties: overrides.properties ?? [],
    schema: overrides.schema,
    canvas_metadata: overrides.canvas_metadata,
    ...overrides,
  };
}

describe('canvasSearch', () => {
  describe('defaultCanvasSearchState', () => {
    it('has empty query and neutral filters', () => {
      expect(defaultCanvasSearchState.canvasSearchQuery).toBe('');
      expect(defaultCanvasSearchState.useRegex).toBe(false);
      expect(defaultCanvasSearchState.searchFilterType).toBe('all');
      expect(defaultCanvasSearchState.searchFilterGroup).toBeNull();
      expect(defaultCanvasSearchState.hasProperties).toBeNull();
      expect(defaultCanvasSearchState.propertyNameFilter).toBe('');
    });
  });

  describe('classMatchesSearch', () => {
    it('matches all when state is default', () => {
      const cls = makeClass({ name: 'Foo' });
      expect(classMatchesSearch(cls, defaultCanvasSearchState)).toBe(true);
    });

    it('filters by query (case-insensitive substring)', () => {
      const cls = makeClass({ name: 'OrderItem' });
      const state: CanvasSearchState = { ...defaultCanvasSearchState, canvasSearchQuery: 'order' };
      expect(classMatchesSearch(cls, state)).toBe(true);
      expect(classMatchesSearch(cls, { ...state, canvasSearchQuery: 'item' })).toBe(true);
      expect(classMatchesSearch(cls, { ...state, canvasSearchQuery: 'xyz' })).toBe(false);
    });

    it('filters by regex when useRegex is true', () => {
      const cls = makeClass({ name: 'UserProfile' });
      const state: CanvasSearchState = {
        ...defaultCanvasSearchState,
        canvasSearchQuery: '^User',
        useRegex: true,
      };
      expect(classMatchesSearch(cls, state)).toBe(true);
      expect(classMatchesSearch(makeClass({ name: 'AdminUser' }), state)).toBe(false);
    });

    it('filters by searchFilterType class (no composition)', () => {
      const plain = makeClass({ name: 'A', schema: {} });
      const withAllOf = makeClass({ name: 'B', schema: { allOf: [{}] } });
      const state: CanvasSearchState = { ...defaultCanvasSearchState, searchFilterType: 'class' };
      expect(classMatchesSearch(plain, state)).toBe(true);
      expect(classMatchesSearch(withAllOf, state)).toBe(false);
    });

    it('filters by searchFilterType allOf/oneOf/anyOf', () => {
      const allOfCls = makeClass({ name: 'X', schema: { allOf: [{}] } });
      const oneOfCls = makeClass({ name: 'Y', schema: { oneOf: [{}] } });
      const anyOfCls = makeClass({ name: 'Z', schema: { anyOf: [{}] } });
      expect(classMatchesSearch(allOfCls, { ...defaultCanvasSearchState, searchFilterType: 'allOf' })).toBe(true);
      expect(classMatchesSearch(oneOfCls, { ...defaultCanvasSearchState, searchFilterType: 'oneOf' })).toBe(true);
      expect(classMatchesSearch(anyOfCls, { ...defaultCanvasSearchState, searchFilterType: 'anyOf' })).toBe(true);
      expect(classMatchesSearch(allOfCls, { ...defaultCanvasSearchState, searchFilterType: 'oneOf' })).toBe(false);
    });

    it('filters by searchFilterGroup', () => {
      const inGroup = makeClass({
        name: 'C',
        canvas_metadata: { group: 'g1' },
      });
      const ungrouped = makeClass({ name: 'D' });
      const state: CanvasSearchState = { ...defaultCanvasSearchState, searchFilterGroup: 'g1' };
      expect(classMatchesSearch(inGroup, state)).toBe(true);
      expect(classMatchesSearch(ungrouped, state)).toBe(false);
    });

    it('filters by hasProperties', () => {
      const withProps = makeClass({ name: 'E', properties: [{ name: 'p1' }] });
      const noProps = makeClass({ name: 'F', properties: [] });
      expect(classMatchesSearch(withProps, { ...defaultCanvasSearchState, hasProperties: true })).toBe(true);
      expect(classMatchesSearch(noProps, { ...defaultCanvasSearchState, hasProperties: true })).toBe(false);
      expect(classMatchesSearch(noProps, { ...defaultCanvasSearchState, hasProperties: false })).toBe(true);
      expect(classMatchesSearch(withProps, { ...defaultCanvasSearchState, hasProperties: false })).toBe(false);
    });

    it('filters by propertyNameFilter', () => {
      const withEmail = makeClass({
        name: 'G',
        properties: [{ name: 'email' }, { name: 'age' }],
      });
      const state: CanvasSearchState = { ...defaultCanvasSearchState, propertyNameFilter: 'email' };
      expect(classMatchesSearch(withEmail, state)).toBe(true);
      expect(classMatchesSearch(makeClass({ name: 'H', properties: [{ name: 'phone' }] }), state)).toBe(false);
    });
  });

  describe('getVisibleClassIds', () => {
    it('returns all class ids when state is default', () => {
      const classes = [
        makeClass({ id: '1', name: 'A' }),
        makeClass({ id: '2', name: 'B' }),
      ];
      const visible = getVisibleClassIds(classes, defaultCanvasSearchState);
      expect(visible.size).toBe(2);
      expect(visible.has('1')).toBe(true);
      expect(visible.has('2')).toBe(true);
    });

    it('returns only matching class ids when query is set', () => {
      const classes = [
        makeClass({ id: '1', name: 'Order' }),
        makeClass({ id: '2', name: 'Product' }),
      ];
      const state: CanvasSearchState = { ...defaultCanvasSearchState, canvasSearchQuery: 'Order' };
      const visible = getVisibleClassIds(classes, state);
      expect(visible.size).toBe(1);
      expect(visible.has('1')).toBe(true);
    });
  });

  describe('getVisibleGroupIds', () => {
    const groups: StudioGroup[] = [
      { id: 'g1', name: 'Group1' },
      { id: 'g2', name: 'Group2' },
    ];
    const classToGroup = new Map<string, string>([
      ['c1', 'g1'],
      ['c2', 'g1'],
      ['c3', 'g2'],
    ]);

    it('returns groups that contain at least one visible class when no group filter', () => {
      const visibleClassIds = new Set(['c1', 'c3']);
      const visible = getVisibleGroupIds(
        groups,
        defaultCanvasSearchState,
        visibleClassIds,
        classToGroup
      );
      expect(visible.has('g1')).toBe(true);
      expect(visible.has('g2')).toBe(true);
    });

    it('returns only the selected group when searchFilterGroup is set and has visible child', () => {
      const visibleClassIds = new Set(['c1']);
      const state: CanvasSearchState = { ...defaultCanvasSearchState, searchFilterGroup: 'g1' };
      const visible = getVisibleGroupIds(groups, state, visibleClassIds, classToGroup);
      expect(visible.size).toBe(1);
      expect(visible.has('g1')).toBe(true);
    });

    it('returns empty when searchFilterGroup is set but group has no visible child', () => {
      const visibleClassIds = new Set(['c3']);
      const state: CanvasSearchState = { ...defaultCanvasSearchState, searchFilterGroup: 'g1' };
      const visible = getVisibleGroupIds(groups, state, visibleClassIds, classToGroup);
      expect(visible.size).toBe(0);
    });
  });
});
