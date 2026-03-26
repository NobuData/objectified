/**
 * Canvas search state and filter logic. GitHub #85 — Add search functionality to the canvas.
 * Reference: canvasSearchQuery, searchFilterType, searchFilterGroups (GitHub #240).
 */

import type { StudioClass, StudioGroup } from './types';
import { getStableClassId } from './types';
import { expandGroupIdsWithAncestors } from './canvasGroupLayout';

/** Filter by schema composition type (class = no composition, allOf/oneOf/anyOf = has that key). */
export type SearchFilterType = 'all' | 'class' | 'allOf' | 'oneOf' | 'anyOf';

export interface CanvasSearchState {
  /** Text query; matched against class name. */
  canvasSearchQuery: string;
  /** When true, canvasSearchQuery is interpreted as a regex. */
  useRegex: boolean;
  /** Filter by type: all, class (no composition), or schema key (allOf/oneOf/anyOf). */
  searchFilterType: SearchFilterType;
  /** When non-empty, show only classes in any of these groups (and those group nodes). GitHub #240. */
  searchFilterGroups: string[];
  /** When true: only classes with at least one property. When false: only classes with no properties. When null: any. */
  hasProperties: boolean | null;
  /** When non-empty, only classes that have a property whose name matches (case-insensitive substring or regex). */
  propertyNameFilter: string;
}

export const defaultCanvasSearchState: CanvasSearchState = {
  canvasSearchQuery: '',
  useRegex: false,
  searchFilterType: 'all',
  searchFilterGroups: [],
  hasProperties: null,
  propertyNameFilter: '',
};

/**
 * Returns true when at least one filter or query is active (i.e., the state differs from the
 * default). When false, no filtering should be applied to the canvas.
 */
export function isSearchActive(state: CanvasSearchState): boolean {
  return (
    state.canvasSearchQuery.trim().length > 0 ||
    state.searchFilterType !== 'all' ||
    state.searchFilterGroups.length > 0 ||
    state.hasProperties !== null ||
    state.propertyNameFilter.trim().length > 0
  );
}

/**
 * Compile a search query into a RegExp (when useRegex=true and query is non-empty),
 * falling back to null (substring matching used instead). Compile once and reuse across matches.
 */
function buildCompiledRegex(query: string, useRegex: boolean): RegExp | null {
  const q = query.trim();
  if (!q || !useRegex) return null;
  try {
    return new RegExp(q);
  } catch (err) {
    console.warn(`[canvasSearch] Invalid regex pattern "${q}":`, err);
    return null;
  }
}

/** Apply a pre-compiled query to text; falls back to case-insensitive substring when re is null. */
function matchesCompiledQuery(text: string, q: string, re: RegExp | null): boolean {
  if (!q) return true;
  if (re) return re.test(text);
  return text.toLowerCase().includes(q.toLowerCase());
}

function matchesSchemaType(cls: StudioClass, filterType: SearchFilterType): boolean {
  if (filterType === 'all') return true;
  const schema = cls.schema as Record<string, unknown> | undefined;
  if (filterType === 'class') {
    const hasAllOf = Array.isArray(schema?.allOf) && schema.allOf.length > 0;
    const hasOneOf = Array.isArray(schema?.oneOf) && schema.oneOf.length > 0;
    const hasAnyOf = Array.isArray(schema?.anyOf) && schema.anyOf.length > 0;
    return !hasAllOf && !hasOneOf && !hasAnyOf;
  }
  if (filterType === 'allOf') return Array.isArray(schema?.allOf) && schema.allOf.length > 0;
  if (filterType === 'oneOf') return Array.isArray(schema?.oneOf) && schema.oneOf.length > 0;
  if (filterType === 'anyOf') return Array.isArray(schema?.anyOf) && schema.anyOf.length > 0;
  return true;
}

function matchesHasProperties(cls: StudioClass, hasProperties: boolean | null): boolean {
  if (hasProperties === null) return true;
  const count = (cls.properties ?? []).length;
  return hasProperties ? count > 0 : count === 0;
}

function matchesPropertyNameFilter(cls: StudioClass, propertyNameQ: string, re: RegExp | null): boolean {
  if (!propertyNameQ) return true;
  const props = cls.properties ?? [];
  return props.some((p) => matchesCompiledQuery((p.name ?? '').trim(), propertyNameQ, re));
}

/**
 * Returns true if the class passes all search filters.
 */
export function classMatchesSearch(
  cls: StudioClass,
  state: CanvasSearchState
): boolean {
  // Compile regexes once per call and reuse across all sub-checks.
  const queryStr = state.canvasSearchQuery.trim();
  const queryRegex = buildCompiledRegex(state.canvasSearchQuery, state.useRegex);
  const propFilterStr = state.propertyNameFilter.trim();
  const propFilterRegex = buildCompiledRegex(state.propertyNameFilter, state.useRegex);

  if (!matchesCompiledQuery(cls.name ?? '', queryStr, queryRegex)) return false;
  if (!matchesSchemaType(cls, state.searchFilterType)) return false;
  if (state.searchFilterGroups.length > 0) {
    const groupId = (cls.canvas_metadata as { group?: string } | undefined)?.group;
    if (!groupId || !state.searchFilterGroups.includes(groupId)) return false;
  }
  if (!matchesHasProperties(cls, state.hasProperties)) return false;
  if (!matchesPropertyNameFilter(cls, propFilterStr, propFilterRegex)) return false;
  return true;
}

/**
 * Returns the set of class ids that pass the search filters.
 */
export function getVisibleClassIds(
  classes: StudioClass[],
  state: CanvasSearchState
): Set<string> {
  const visible = new Set<string>();
  for (const cls of classes) {
    if (classMatchesSearch(cls, state)) {
      visible.add(getStableClassId(cls));
    }
  }
  return visible;
}

/**
 * Returns the set of group ids that should be shown:
 * - When no search is active: all groups (including empty ones with no classes).
 * - When search is active with no group filter: only groups containing at least one visible class.
 * - When a specific group filter is set: only that group (if it contains a visible child class).
 */
export function getVisibleGroupIds(
  groups: StudioGroup[],
  state: CanvasSearchState,
  visibleClassIds: Set<string>,
  classToGroup: Map<string, string>
): Set<string> {
  if (!isSearchActive(state)) {
    return new Set(groups.map((g) => g.id));
  }
  if (state.searchFilterGroups.length > 0) {
    const allowed = new Set<string>();
    for (const gid of state.searchFilterGroups) {
      const hasVisibleChild = Array.from(visibleClassIds).some(
        (cid) => classToGroup.get(cid) === gid
      );
      if (hasVisibleChild) allowed.add(gid);
    }
    return allowed.size > 0 ? expandGroupIdsWithAncestors(groups, allowed) : new Set();
  }
  const groupIdsWithVisibleChildren = new Set<string>();
  for (const cid of visibleClassIds) {
    const gid = classToGroup.get(cid);
    if (gid) groupIdsWithVisibleChildren.add(gid);
  }
  return expandGroupIdsWithAncestors(groups, groupIdsWithVisibleChildren);
}
