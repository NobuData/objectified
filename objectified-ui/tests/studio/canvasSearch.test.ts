/**
 * Unit tests for canvas search state and filter logic. GitHub #85, #241.
 */

import type { StudioClass, StudioGroup } from '@lib/studio/types';
import {
  defaultCanvasSearchState,
  isSearchActive,
  normalizeCanvasSearchState,
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
      expect(defaultCanvasSearchState.caseSensitive).toBe(false);
      expect(defaultCanvasSearchState.searchInName).toBe(true);
      expect(defaultCanvasSearchState.searchInDescription).toBe(false);
      expect(defaultCanvasSearchState.searchFilterType).toBe('all');
      expect(defaultCanvasSearchState.searchFilterGroup).toBeNull();
      expect(defaultCanvasSearchState.searchFilterTag).toBeNull();
      expect(defaultCanvasSearchState.hasProperties).toBeNull();
      expect(defaultCanvasSearchState.propertyNameFilter).toBe('');
      expect(defaultCanvasSearchState.requireValidationErrors).toBeNull();
      expect(defaultCanvasSearchState.requireDeprecated).toBeNull();
      expect(defaultCanvasSearchState.structuralFilterMode).toBe('and');
    });
  });

  describe('normalizeCanvasSearchState', () => {
    it('fills missing #241 fields from persisted partial state', () => {
      const legacy = {
        canvasSearchQuery: 'x',
        useRegex: false,
        searchFilterType: 'all',
        searchFilterGroup: null,
        hasProperties: null,
        propertyNameFilter: '',
      } as Record<string, unknown>;
      const n = normalizeCanvasSearchState(legacy);
      expect(n.searchFilterTag).toBeNull();
      expect(n.requireValidationErrors).toBeNull();
      expect(n.caseSensitive).toBe(false);
      expect(n.searchInName).toBe(true);
    });
  });

  describe('isSearchActive', () => {
    it('returns false for default state', () => {
      expect(isSearchActive(defaultCanvasSearchState)).toBe(false);
    });

    it('returns true when canvasSearchQuery is set', () => {
      expect(isSearchActive({ ...defaultCanvasSearchState, canvasSearchQuery: 'foo' })).toBe(true);
    });

    it('returns false for text-only options when query is empty', () => {
      expect(
        isSearchActive({
          ...defaultCanvasSearchState,
          searchInDescription: true,
          useRegex: true,
          caseSensitive: true,
        })
      ).toBe(false);
    });

    it('returns true when searchFilterType is not all', () => {
      expect(isSearchActive({ ...defaultCanvasSearchState, searchFilterType: 'class' })).toBe(true);
    });

    it('returns true when searchFilterGroup is set', () => {
      expect(isSearchActive({ ...defaultCanvasSearchState, searchFilterGroup: 'g1' })).toBe(true);
    });

    it('returns true when searchFilterTag is set', () => {
      expect(isSearchActive({ ...defaultCanvasSearchState, searchFilterTag: 'urgent' })).toBe(true);
    });

    it('returns true when hasProperties is set', () => {
      expect(isSearchActive({ ...defaultCanvasSearchState, hasProperties: true })).toBe(true);
      expect(isSearchActive({ ...defaultCanvasSearchState, hasProperties: false })).toBe(true);
    });

    it('returns true when propertyNameFilter is set', () => {
      expect(isSearchActive({ ...defaultCanvasSearchState, propertyNameFilter: 'id' })).toBe(true);
    });

    it('returns true when validation or deprecated filters are set', () => {
      expect(
        isSearchActive({ ...defaultCanvasSearchState, requireValidationErrors: true })
      ).toBe(true);
      expect(isSearchActive({ ...defaultCanvasSearchState, requireDeprecated: true })).toBe(true);
    });

    it('returns false when canvasSearchQuery is only whitespace', () => {
      expect(isSearchActive({ ...defaultCanvasSearchState, canvasSearchQuery: '   ' })).toBe(false);
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

    it('respects caseSensitive for substring', () => {
      const cls = makeClass({ name: 'Apple' });
      const state: CanvasSearchState = {
        ...defaultCanvasSearchState,
        canvasSearchQuery: 'app',
        caseSensitive: true,
      };
      expect(classMatchesSearch(cls, state)).toBe(false);
      expect(classMatchesSearch(cls, { ...state, canvasSearchQuery: 'App' })).toBe(true);
    });

    it('searches description when enabled', () => {
      const cls = makeClass({ name: 'X', description: 'North wind' });
      const state: CanvasSearchState = {
        ...defaultCanvasSearchState,
        canvasSearchQuery: 'wind',
        searchInName: false,
        searchInDescription: true,
      };
      expect(classMatchesSearch(cls, state)).toBe(true);
      expect(classMatchesSearch({ ...cls, description: '' }, state)).toBe(false);
    });

    it('requires all selected fields when matchAll', () => {
      const cls = makeClass({ name: 'Alpha', description: 'Alpha' });
      const state: CanvasSearchState = {
        ...defaultCanvasSearchState,
        canvasSearchQuery: 'Alpha',
        searchInName: true,
        searchInDescription: true,
        queryFieldCombineMode: 'matchAll',
      };
      expect(classMatchesSearch(cls, state)).toBe(true);
      expect(
        classMatchesSearch({ ...cls, description: 'Other' }, state)
      ).toBe(false);
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

    it('matches property types blob', () => {
      const cls = makeClass({
        name: 'P',
        properties: [
          {
            name: 'id',
            data: { type: 'string', format: 'uuid' },
          },
        ],
      });
      const state: CanvasSearchState = {
        ...defaultCanvasSearchState,
        canvasSearchQuery: 'uuid',
        searchInName: false,
        searchInPropertyTypes: true,
      };
      expect(classMatchesSearch(cls, state)).toBe(true);
    });

    it('filters by tag on class', () => {
      const tagged = makeClass({ name: 'T', tags: ['v1', 'core'] });
      const state: CanvasSearchState = {
        ...defaultCanvasSearchState,
        canvasSearchQuery: '',
        searchFilterTag: 'v1',
      };
      expect(classMatchesSearch(tagged, state)).toBe(true);
      expect(classMatchesSearch(makeClass({ name: 'U', tags: [] }), state)).toBe(false);
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
      expect(classMatchesSearch(allOfCls, { ...defaultCanvasSearchState, searchFilterType: 'allOf' })).toBe(
        true
      );
      expect(classMatchesSearch(oneOfCls, { ...defaultCanvasSearchState, searchFilterType: 'oneOf' })).toBe(
        true
      );
      expect(classMatchesSearch(anyOfCls, { ...defaultCanvasSearchState, searchFilterType: 'anyOf' })).toBe(
        true
      );
      expect(classMatchesSearch(allOfCls, { ...defaultCanvasSearchState, searchFilterType: 'oneOf' })).toBe(
        false
      );
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
      expect(classMatchesSearch(withProps, { ...defaultCanvasSearchState, hasProperties: false })).toBe(
        false
      );
    });

    it('filters by propertyNameFilter', () => {
      const withEmail = makeClass({
        name: 'G',
        properties: [{ name: 'email' }, { name: 'age' }],
      });
      const state: CanvasSearchState = { ...defaultCanvasSearchState, propertyNameFilter: 'email' };
      expect(classMatchesSearch(withEmail, state)).toBe(true);
      expect(classMatchesSearch(makeClass({ name: 'H', properties: [{ name: 'phone' }] }), state)).toBe(
        false
      );
    });

    it('filters by validation errors', () => {
      const bad = makeClass({ name: '' });
      const good = makeClass({ name: 'Ok' });
      expect(
        classMatchesSearch(bad, { ...defaultCanvasSearchState, requireValidationErrors: true })
      ).toBe(true);
      expect(
        classMatchesSearch(good, { ...defaultCanvasSearchState, requireValidationErrors: true })
      ).toBe(false);
      expect(
        classMatchesSearch(good, { ...defaultCanvasSearchState, requireValidationErrors: false })
      ).toBe(true);
      expect(
        classMatchesSearch(bad, { ...defaultCanvasSearchState, requireValidationErrors: false })
      ).toBe(false);
    });

    it('filters by deprecated flag', () => {
      const dep = makeClass({ name: 'D', schema: { deprecated: true } });
      const live = makeClass({ name: 'L', schema: {} });
      expect(classMatchesSearch(dep, { ...defaultCanvasSearchState, requireDeprecated: true })).toBe(true);
      expect(classMatchesSearch(live, { ...defaultCanvasSearchState, requireDeprecated: true })).toBe(false);
      expect(classMatchesSearch(live, { ...defaultCanvasSearchState, requireDeprecated: false })).toBe(true);
      expect(classMatchesSearch(dep, { ...defaultCanvasSearchState, requireDeprecated: false })).toBe(false);
    });

    it('combines structural filters with OR', () => {
      const inG = makeClass({
        name: 'InG',
        canvas_metadata: { group: 'g1' },
        schema: {},
      });
      const depOnly = makeClass({
        name: 'Dep',
        schema: { deprecated: true },
      });
      const state: CanvasSearchState = {
        ...defaultCanvasSearchState,
        searchFilterGroup: 'g1',
        requireDeprecated: true,
        structuralFilterMode: 'or',
      };
      expect(classMatchesSearch(inG, state)).toBe(true);
      expect(classMatchesSearch(depOnly, state)).toBe(true);
      state.structuralFilterMode = 'and';
      expect(classMatchesSearch(inG, state)).toBe(false);
      expect(classMatchesSearch(depOnly, state)).toBe(false);
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

    it('returns all group ids (including empty groups) when search state is default', () => {
      const groupsWithEmpty: StudioGroup[] = [
        ...groups,
        { id: 'g3', name: 'EmptyGroup' },
      ];
      const visibleClassIds = new Set(['c1', 'c3']);
      const visible = getVisibleGroupIds(
        groupsWithEmpty,
        defaultCanvasSearchState,
        visibleClassIds,
        classToGroup
      );
      expect(visible.has('g1')).toBe(true);
      expect(visible.has('g2')).toBe(true);
      expect(visible.has('g3')).toBe(true);
    });

    it('returns only groups with at least one visible class when search is active', () => {
      const visibleClassIds = new Set(['c1', 'c3']);
      const state: CanvasSearchState = { ...defaultCanvasSearchState, canvasSearchQuery: 'Order' };
      const visible = getVisibleGroupIds(groups, state, visibleClassIds, classToGroup);
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

    it('includes ancestor groups for nested group filter (GitHub #237)', () => {
      const nested: StudioGroup[] = [
        { id: 'g1', name: 'Outer', metadata: {} },
        { id: 'g2', name: 'Inner', metadata: { parentGroupId: 'g1' } },
      ];
      const cg = new Map<string, string>([['c1', 'g2']]);
      const visibleClassIds = new Set(['c1']);
      const state: CanvasSearchState = {
        ...defaultCanvasSearchState,
        searchFilterGroup: 'g2',
      };
      const visible = getVisibleGroupIds(nested, state, visibleClassIds, cg);
      expect(visible.has('g1')).toBe(true);
      expect(visible.has('g2')).toBe(true);
    });

    it('returns empty when searchFilterGroup is set but group has no visible child', () => {
      const visibleClassIds = new Set(['c3']);
      const state: CanvasSearchState = { ...defaultCanvasSearchState, searchFilterGroup: 'g1' };
      const visible = getVisibleGroupIds(groups, state, visibleClassIds, classToGroup);
      expect(visible.size).toBe(0);
    });
  });
});
