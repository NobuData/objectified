/**
 * Canvas search state and filter logic. GitHub #85 — search on the canvas.
 * GitHub #240 — multi-group canvas filter (`searchFilterGroups`).
 * GitHub #241 — description/property/tag search, case sensitivity, combined filters, saved searches.
 */

import type { StudioClass, StudioClassProperty, StudioGroup } from './types';
import { getStableClassId } from './types';
import { collectGroupDescendants, expandGroupIdsWithAncestors } from './canvasGroupLayout';
import {
  classHasValidationErrors,
  isStudioClassDeprecated,
} from './classValidation';
import { effectiveClassPropertyData } from './validationRulesExport';

/** Filter by schema composition type (class = no composition, allOf/oneOf/anyOf = has that key). */
export type SearchFilterType = 'all' | 'class' | 'allOf' | 'oneOf' | 'anyOf';

/** How multiple enabled text scopes combine for `canvasSearchQuery`. */
export type QueryFieldCombineMode = 'matchAny' | 'matchAll';

/** How active structural filters combine. */
export type StructuralFilterCombineMode = 'and' | 'or';

/**
 * How non-matching canvas nodes are shown while search is active (GitHub #242).
 * - hideNonMatches: remove non-matches from the canvas (legacy behavior).
 * - dimNonMatches: keep all nodes; fade nodes that do not match the current search.
 */
export type SearchMatchDisplayMode = 'hideNonMatches' | 'dimNonMatches';

export interface CanvasSearchState {
  /** Text query; matched against enabled scopes (name, description, …). */
  canvasSearchQuery: string;
  /** When true, canvasSearchQuery is interpreted as a regex. */
  useRegex: boolean;
  /** When false (default), substring and regex matching ignore case where applicable. */
  caseSensitive: boolean;
  /** Search class name with the main query. */
  searchInName: boolean;
  /** Search class description. */
  searchInDescription: boolean;
  /** Search property display names. */
  searchInPropertyNames: boolean;
  /** Search property type / format / ref text. */
  searchInPropertyTypes: boolean;
  /** Search class tag names. */
  searchInTags: boolean;
  /** Search stringified class `metadata` (x-* annotations and extras). */
  searchInAnnotations: boolean;
  /** How enabled text scopes combine. */
  queryFieldCombineMode: QueryFieldCombineMode;
  /** Filter by type: all, class (no composition), or schema key (allOf/oneOf/anyOf). */
  searchFilterType: SearchFilterType;
  /** When non-empty, show only classes in any of these groups (and those group nodes). GitHub #240. */
  searchFilterGroups: string[];
  /** When set, class must include this tag name (exact string on `StudioClass.tags`). */
  searchFilterTag: string | null;
  /** When true: only classes with at least one property. When false: only classes with no properties. When null: any. */
  hasProperties: boolean | null;
  /** When non-empty, only classes that have a property whose name matches (substring or regex). */
  propertyNameFilter: string;
  /** When true, only classes with validation errors; when false, only without; when null, either. */
  requireValidationErrors: boolean | null;
  /** When true, only deprecated classes; when false, only non-deprecated; when null, either. */
  requireDeprecated: boolean | null;
  /** How non-neutral structural filters are combined. */
  structuralFilterMode: StructuralFilterCombineMode;
  /**
   * Whether to hide non-matches or only dim them (GitHub #242).
   * Ignored when search is inactive.
   */
  searchMatchDisplayMode: SearchMatchDisplayMode;
  /**
   * When focus mode is on, limit matches to classes inside the current focus subgraph
   * (computed from archive-filtered edges before search-driven hiding; GitHub #242).
   */
  searchInFocusOnly: boolean;
}

export const defaultCanvasSearchState: CanvasSearchState = {
  canvasSearchQuery: '',
  useRegex: false,
  caseSensitive: false,
  searchInName: true,
  searchInDescription: false,
  searchInPropertyNames: false,
  searchInPropertyTypes: false,
  searchInTags: false,
  searchInAnnotations: false,
  queryFieldCombineMode: 'matchAny',
  searchFilterType: 'all',
  searchFilterGroups: [],
  searchFilterTag: null,
  hasProperties: null,
  propertyNameFilter: '',
  requireValidationErrors: null,
  requireDeprecated: null,
  structuralFilterMode: 'and',
  searchMatchDisplayMode: 'hideNonMatches',
  searchInFocusOnly: false,
};

function normalizeSearchFilterGroups(raw: Partial<CanvasSearchState>): string[] {
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.searchFilterGroups)) {
    return [...new Set(r.searchFilterGroups.map((x) => String(x)))];
  }
  if (typeof r.searchFilterGroup === 'string' && r.searchFilterGroup) {
    return [r.searchFilterGroup];
  }
  return [...defaultCanvasSearchState.searchFilterGroups];
}

/**
 * Merge partial / persisted state with defaults so new fields never read as undefined.
 */
export function normalizeCanvasSearchState(
  raw: Partial<CanvasSearchState> | null | undefined
): CanvasSearchState {
  if (!raw || typeof raw !== 'object') return { ...defaultCanvasSearchState };
  return {
    ...defaultCanvasSearchState,
    ...raw,
    canvasSearchQuery:
      typeof raw.canvasSearchQuery === 'string'
        ? raw.canvasSearchQuery
        : defaultCanvasSearchState.canvasSearchQuery,
    useRegex:
      typeof raw.useRegex === 'boolean' ? raw.useRegex : defaultCanvasSearchState.useRegex,
    caseSensitive:
      typeof raw.caseSensitive === 'boolean'
        ? raw.caseSensitive
        : defaultCanvasSearchState.caseSensitive,
    searchInName:
      typeof raw.searchInName === 'boolean'
        ? raw.searchInName
        : defaultCanvasSearchState.searchInName,
    searchInDescription:
      typeof raw.searchInDescription === 'boolean'
        ? raw.searchInDescription
        : defaultCanvasSearchState.searchInDescription,
    searchInPropertyNames:
      typeof raw.searchInPropertyNames === 'boolean'
        ? raw.searchInPropertyNames
        : defaultCanvasSearchState.searchInPropertyNames,
    searchInPropertyTypes:
      typeof raw.searchInPropertyTypes === 'boolean'
        ? raw.searchInPropertyTypes
        : defaultCanvasSearchState.searchInPropertyTypes,
    searchInTags:
      typeof raw.searchInTags === 'boolean'
        ? raw.searchInTags
        : defaultCanvasSearchState.searchInTags,
    searchInAnnotations:
      typeof raw.searchInAnnotations === 'boolean'
        ? raw.searchInAnnotations
        : defaultCanvasSearchState.searchInAnnotations,
    queryFieldCombineMode:
      raw.queryFieldCombineMode === 'matchAll' ? 'matchAll' : 'matchAny',
    searchFilterType:
      raw.searchFilterType === 'class' ||
      raw.searchFilterType === 'allOf' ||
      raw.searchFilterType === 'oneOf' ||
      raw.searchFilterType === 'anyOf'
        ? raw.searchFilterType
        : raw.searchFilterType === 'all'
          ? 'all'
          : defaultCanvasSearchState.searchFilterType,
    searchFilterGroups: normalizeSearchFilterGroups(raw),
    searchFilterTag:
      raw.searchFilterTag === null || raw.searchFilterTag === undefined
        ? null
        : String(raw.searchFilterTag),
    hasProperties:
      raw.hasProperties === true || raw.hasProperties === false || raw.hasProperties === null
        ? raw.hasProperties
        : defaultCanvasSearchState.hasProperties,
    propertyNameFilter:
      typeof raw.propertyNameFilter === 'string'
        ? raw.propertyNameFilter
        : defaultCanvasSearchState.propertyNameFilter,
    requireValidationErrors:
      raw.requireValidationErrors === true ||
      raw.requireValidationErrors === false ||
      raw.requireValidationErrors === null
        ? raw.requireValidationErrors
        : defaultCanvasSearchState.requireValidationErrors,
    requireDeprecated:
      raw.requireDeprecated === true || raw.requireDeprecated === false || raw.requireDeprecated === null
        ? raw.requireDeprecated
        : defaultCanvasSearchState.requireDeprecated,
    structuralFilterMode:
      raw.structuralFilterMode === 'or' ? 'or' : 'and',
    searchMatchDisplayMode:
      raw.searchMatchDisplayMode === 'dimNonMatches' ? 'dimNonMatches' : 'hideNonMatches',
    searchInFocusOnly:
      typeof raw.searchInFocusOnly === 'boolean'
        ? raw.searchInFocusOnly
        : defaultCanvasSearchState.searchInFocusOnly,
  };
}

/**
 * Returns true when at least one filter or query is active (i.e., the state differs from the
 * default). When false, no filtering should be applied to the canvas.
 *
 * Text-scope toggles, regex, and case options only activate search when there is a non-empty
 * main query (so empty-query mode never hides empty groups or changes the canvas).
 */
export function isSearchActive(state: CanvasSearchState): boolean {
  const n = normalizeCanvasSearchState(state);
  if (n.canvasSearchQuery.trim().length > 0) return true;
  return (
    n.searchFilterType !== 'all' ||
    n.searchFilterGroups.length > 0 ||
    n.searchFilterTag !== null ||
    n.hasProperties !== null ||
    n.propertyNameFilter.trim().length > 0 ||
    n.requireValidationErrors !== null ||
    n.requireDeprecated !== null
  );
}

function regexFlags(caseSensitive: boolean): string {
  return caseSensitive ? '' : 'i';
}

/**
 * Compile a search query into a RegExp (when useRegex=true and query is non-empty),
 * falling back to null (substring matching used instead). Compile once and reuse across matches.
 */
export function buildCompiledRegex(
  query: string,
  useRegex: boolean,
  caseSensitive: boolean
): RegExp | null {
  const q = query.trim();
  if (!q || !useRegex) return null;
  try {
    return new RegExp(q, regexFlags(caseSensitive));
  } catch (err) {
    console.warn(`[canvasSearch] Invalid regex pattern "${q}":`, err);
    return null;
  }
}

/** Apply a pre-compiled query to text; falls back to substring when re is null. */
function matchesCompiledQuery(
  text: string,
  q: string,
  re: RegExp | null,
  caseSensitive: boolean
): boolean {
  if (!q) return true;
  if (re) return re.test(text);
  if (caseSensitive) return text.includes(q);
  return text.toLowerCase().includes(q.toLowerCase());
}

function propertyTypeSearchBlob(prop: StudioClassProperty): string {
  const d = effectiveClassPropertyData(prop);
  const parts: string[] = [];
  const t = d['type'];
  if (typeof t === 'string') parts.push(t);
  else if (Array.isArray(t)) {
    for (const x of t) {
      if (typeof x === 'string') parts.push(x);
    }
  }
  const fmt = d['format'];
  if (typeof fmt === 'string') parts.push(fmt);
  const ref = d['$ref'];
  if (typeof ref === 'string') parts.push(ref);
  const xName = d['x-ref-class-name'];
  if (typeof xName === 'string') parts.push(xName);
  const items = d['items'];
  if (items && typeof items === 'object' && !Array.isArray(items)) {
    const it = items as Record<string, unknown>;
    const itt = it['type'];
    if (typeof itt === 'string') parts.push(`items:${itt}`);
  }
  return parts.join(' ');
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

function matchesPropertyNameFilter(
  cls: StudioClass,
  propertyNameQ: string,
  re: RegExp | null,
  caseSensitive: boolean
): boolean {
  if (!propertyNameQ) return true;
  const props = cls.properties ?? [];
  return props.some((p) =>
    matchesCompiledQuery((p.name ?? '').trim(), propertyNameQ, re, caseSensitive)
  );
}

function matchesTagFilter(cls: StudioClass, tag: string | null): boolean {
  if (tag === null) return true;
  const tags = cls.tags ?? [];
  return tags.some((t) => t === tag);
}

function matchesMainQuery(cls: StudioClass, state: CanvasSearchState): boolean {
  const queryStr = state.canvasSearchQuery.trim();
  const queryRegex = queryStr
    ? buildCompiledRegex(state.canvasSearchQuery, state.useRegex, state.caseSensitive)
    : null;
  return matchesMainQueryWith(cls, state, queryStr, queryRegex);
}

type StructuralPredicate = (cls: StudioClass) => boolean;

/**
 * Pre-compiles structural filter predicates into a single reusable matcher.
 *
 * Improvements over the previous per-class approach:
 *  - `searchFilterGroups` is expanded to include all descendant group ids via
 *    `collectGroupDescendants`, so selecting a parent group includes classes in
 *    nested/child groups (consistent with focus/zoom behavior).
 *  - The allowed-group Set and the property-name RegExp are constructed once and
 *    captured in the returned closure instead of being re-created on every class check.
 *
 * @param state  Already-normalised search state.
 * @param groups Full group list from the canvas (required for descendant expansion).
 */
function buildCompiledStructuralMatcher(
  state: CanvasSearchState,
  groups: StudioGroup[]
): (cls: StudioClass) => boolean {
  const propFilterStr = state.propertyNameFilter.trim();
  const propFilterRegex = propFilterStr
    ? buildCompiledRegex(state.propertyNameFilter, state.useRegex, state.caseSensitive)
    : null;

  const preds: StructuralPredicate[] = [];

  if (state.searchFilterType !== 'all') {
    const ft = state.searchFilterType;
    preds.push((cls) => matchesSchemaType(cls, ft));
  }
  if (state.searchFilterGroups.length > 0) {
    // Expand each selected group to include all of its descendant groups so that
    // filtering by a parent group shows classes in nested child groups as well.
    const allowed = new Set<string>();
    for (const gid of state.searchFilterGroups) {
      for (const id of collectGroupDescendants(groups, gid)) {
        allowed.add(id);
      }
    }
    preds.push((cls) => {
      const groupId = (cls.canvas_metadata as { group?: string } | undefined)?.group;
      return !!groupId && allowed.has(groupId);
    });
  }
  if (state.searchFilterTag !== null) {
    const tag = state.searchFilterTag;
    preds.push((cls) => matchesTagFilter(cls, tag));
  }
  if (state.hasProperties !== null) {
    const hp = state.hasProperties;
    preds.push((cls) => matchesHasProperties(cls, hp));
  }
  if (propFilterStr) {
    preds.push((cls) =>
      matchesPropertyNameFilter(cls, propFilterStr, propFilterRegex, state.caseSensitive)
    );
  }
  if (state.requireValidationErrors !== null) {
    const want = state.requireValidationErrors;
    preds.push((cls) => classHasValidationErrors(cls) === want);
  }
  if (state.requireDeprecated !== null) {
    const want = state.requireDeprecated;
    preds.push((cls) => isStudioClassDeprecated(cls) === want);
  }

  if (preds.length === 0) return () => true;
  if (state.structuralFilterMode === 'or') return (cls) => preds.some((p) => p(cls));
  return (cls) => preds.every((p) => p(cls));
}

/**
 * Variant of `matchesMainQuery` that accepts already-computed `queryStr` and `queryRegex`
 * so they can be compiled once and reused across many class checks.
 */
function matchesMainQueryWith(
  cls: StudioClass,
  state: CanvasSearchState,
  queryStr: string,
  queryRegex: RegExp | null
): boolean {
  if (!queryStr) return true;

  const props = cls.properties ?? [];
  const scopeChecks: boolean[] = [];
  let anyScope = false;

  if (state.searchInName) {
    anyScope = true;
    scopeChecks.push(matchesCompiledQuery(cls.name ?? '', queryStr, queryRegex, state.caseSensitive));
  }
  if (state.searchInDescription) {
    anyScope = true;
    scopeChecks.push(
      matchesCompiledQuery(cls.description ?? '', queryStr, queryRegex, state.caseSensitive)
    );
  }
  if (state.searchInPropertyNames) {
    anyScope = true;
    const hit = props.some((p) =>
      matchesCompiledQuery((p.name ?? '').trim(), queryStr, queryRegex, state.caseSensitive)
    );
    scopeChecks.push(hit);
  }
  if (state.searchInPropertyTypes) {
    anyScope = true;
    const hit = props.some((p) =>
      matchesCompiledQuery(propertyTypeSearchBlob(p), queryStr, queryRegex, state.caseSensitive)
    );
    scopeChecks.push(hit);
  }
  if (state.searchInTags) {
    anyScope = true;
    const tags = cls.tags ?? [];
    const hit = tags.some((t) =>
      matchesCompiledQuery(t, queryStr, queryRegex, state.caseSensitive)
    );
    scopeChecks.push(hit);
  }
  if (state.searchInAnnotations) {
    anyScope = true;
    let metaText = '';
    try {
      metaText = JSON.stringify(cls.metadata ?? {});
    } catch {
      metaText = '';
    }
    scopeChecks.push(matchesCompiledQuery(metaText, queryStr, queryRegex, state.caseSensitive));
  }

  if (!anyScope) {
    return matchesCompiledQuery(cls.name ?? '', queryStr, queryRegex, state.caseSensitive);
  }

  if (state.queryFieldCombineMode === 'matchAll') {
    return scopeChecks.every(Boolean);
  }
  return scopeChecks.some(Boolean);
}

/**
 * Returns true if the class passes all search filters.
 *
 * For bulk filtering (many classes) prefer `getVisibleClassIds` which precompiles
 * the matcher once and avoids per-class allocations.
 */
export function classMatchesSearch(
  cls: StudioClass,
  state: CanvasSearchState,
  groups?: StudioGroup[]
): boolean {
  const normalized = normalizeCanvasSearchState(state);
  if (!matchesMainQuery(cls, normalized)) return false;
  const structuralMatcher = buildCompiledStructuralMatcher(normalized, groups ?? []);
  return structuralMatcher(cls);
}

/**
 * Returns the set of class ids that pass the search filters.
 *
 * Normalises state once, precompiles the query regex and structural matcher once,
 * then checks each class without any per-class allocations.
 *
 * @param groups Canvas groups — pass these to enable descendant group expansion.
 */
export function getVisibleClassIds(
  classes: StudioClass[],
  state: CanvasSearchState,
  groups?: StudioGroup[]
): Set<string> {
  const normalized = normalizeCanvasSearchState(state);
  const queryStr = normalized.canvasSearchQuery.trim();
  const queryRegex = queryStr
    ? buildCompiledRegex(normalized.canvasSearchQuery, normalized.useRegex, normalized.caseSensitive)
    : null;
  const structuralMatcher = buildCompiledStructuralMatcher(normalized, groups ?? []);
  const visible = new Set<string>();
  for (const cls of classes) {
    if (
      matchesMainQueryWith(cls, normalized, queryStr, queryRegex) &&
      structuralMatcher(cls)
    ) {
      visible.add(getStableClassId(cls));
    }
  }
  return visible;
}

/**
 * Returns the set of group ids that should be shown:
 * - When no search is active: all groups (including empty ones with no classes).
 * - When search is active with no group filter: only groups containing at least one visible class.
 * - Multi group filter (GitHub #240): union of selected groups (and their descendants) that
 *   have at least one visible class anywhere in their subtree.
 */
export function getVisibleGroupIds(
  groups: StudioGroup[],
  state: CanvasSearchState,
  visibleClassIds: Set<string>,
  classToGroup: Map<string, string>
): Set<string> {
  const normalized = normalizeCanvasSearchState(state);
  if (!isSearchActive(normalized)) {
    return new Set(groups.map((g) => g.id));
  }
  if (normalized.searchFilterGroups.length > 0) {
    const allowed = new Set<string>();
    for (const gid of normalized.searchFilterGroups) {
      // Expand to the full subtree so nested group nodes are also shown.
      const subtree = collectGroupDescendants(groups, gid);
      const hasVisibleChild = Array.from(visibleClassIds).some((cid) =>
        subtree.has(classToGroup.get(cid) ?? '')
      );
      if (hasVisibleChild) {
        for (const id of subtree) allowed.add(id);
      }
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

/** Intersection of two class-id sets (GitHub #242: search-in-focus-only). */
export function intersectClassIds(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const id of a) {
    if (b.has(id)) out.add(id);
  }
  return out;
}

/**
 * Group nodes that contain at least one matching class (including ancestor groups).
 * Used to dim group frames in “dim non-matches” search mode (GitHub #242).
 */
export function getSearchHighlightGroupIds(
  groups: StudioGroup[],
  matchClassIds: Set<string>,
  classToGroup: Map<string, string>
): Set<string> {
  const leaf = new Set<string>();
  for (const cid of matchClassIds) {
    const g = classToGroup.get(cid);
    if (g) leaf.add(g);
  }
  if (leaf.size === 0) return new Set();
  return expandGroupIdsWithAncestors(groups, leaf);
}
