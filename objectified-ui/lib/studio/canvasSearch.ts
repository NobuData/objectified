/**
 * Canvas search state and filter logic. GitHub #85 — Add search functionality to the canvas.
 * Reference: canvasSearchQuery, searchFilterType, searchFilterGroup.
 */

import type { StudioClass, StudioGroup } from './types';
import { getStableClassId } from './types';

/** Filter by schema composition type (class = no composition, allOf/oneOf/anyOf = has that key). */
export type SearchFilterType = 'all' | 'class' | 'allOf' | 'oneOf' | 'anyOf';

export interface CanvasSearchState {
  /** Text query; matched against class name (and optionally group name). */
  canvasSearchQuery: string;
  /** When true, canvasSearchQuery is interpreted as a regex. */
  useRegex: boolean;
  /** Filter by type: all, class (no composition), or schema key (allOf/oneOf/anyOf). */
  searchFilterType: SearchFilterType;
  /** When set, show only classes in this group (and the group node). */
  searchFilterGroup: string | null;
  /** When true: only classes with at least one property. When false: only classes with no properties. When null: any. */
  hasProperties: boolean | null;
  /** When non-empty, only classes that have a property whose name matches (case-insensitive substring or regex). */
  propertyNameFilter: string;
}

export const defaultCanvasSearchState: CanvasSearchState = {
  canvasSearchQuery: '',
  useRegex: false,
  searchFilterType: 'all',
  searchFilterGroup: null,
  hasProperties: null,
  propertyNameFilter: '',
};

function matchesQuery(text: string, query: string, useRegex: boolean): boolean {
  const q = query.trim();
  if (!q) return true;
  if (useRegex) {
    try {
      const re = new RegExp(q);
      return re.test(text);
    } catch {
      return text.toLowerCase().includes(q.toLowerCase());
    }
  }
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

function matchesPropertyNameFilter(cls: StudioClass, propertyNameFilter: string, useRegex: boolean): boolean {
  const q = propertyNameFilter.trim();
  if (!q) return true;
  const props = cls.properties ?? [];
  return props.some((p) => {
    const name = (p.name ?? '').trim();
    return matchesQuery(name, q, useRegex);
  });
}

/**
 * Returns true if the class passes all search filters.
 */
export function classMatchesSearch(
  cls: StudioClass,
  state: CanvasSearchState
): boolean {
  if (!matchesQuery(cls.name ?? '', state.canvasSearchQuery, state.useRegex)) {
    return false;
  }
  if (!matchesSchemaType(cls, state.searchFilterType)) return false;
  if (state.searchFilterGroup != null) {
    const groupId = (cls.canvas_metadata as { group?: string } | undefined)?.group;
    if (groupId !== state.searchFilterGroup) return false;
  }
  if (!matchesHasProperties(cls, state.hasProperties)) return false;
  if (!matchesPropertyNameFilter(cls, state.propertyNameFilter, state.useRegex)) {
    return false;
  }
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
 * Returns the set of group ids that should be shown: either all groups (when no group filter),
 * or only the selected group; when group filter is set we also require that the group contains
 * at least one visible class (handled by caller by intersecting with visible class parent groups).
 */
export function getVisibleGroupIds(
  groups: StudioGroup[],
  state: CanvasSearchState,
  visibleClassIds: Set<string>,
  classToGroup: Map<string, string>
): Set<string> {
  if (state.searchFilterGroup != null) {
    const gid = state.searchFilterGroup;
    const hasVisibleChild = Array.from(visibleClassIds).some(
      (cid) => classToGroup.get(cid) === gid
    );
    return hasVisibleChild ? new Set([gid]) : new Set();
  }
  const groupIdsWithVisibleChildren = new Set<string>();
  for (const cid of visibleClassIds) {
    const gid = classToGroup.get(cid);
    if (gid) groupIdsWithVisibleChildren.add(gid);
  }
  return groupIdsWithVisibleChildren;
}
