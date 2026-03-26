'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import * as Select from '@radix-ui/react-select';
import * as Label from '@radix-ui/react-label';
import * as Switch from '@radix-ui/react-switch';
import * as Popover from '@radix-ui/react-popover';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  Clock,
  Check,
  BookmarkPlus,
} from 'lucide-react';
import { useCanvasSearchOptional } from '@/app/contexts/CanvasSearchContext';
import { useCanvasFocusModeOptional } from '@/app/contexts/CanvasFocusModeContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useSearchHistory } from '@/app/hooks/useSearchHistory';
import { useSavedCanvasSearches } from '@/app/hooks/useSavedCanvasSearches';
import {
  isSearchActive,
  type SearchFilterType,
  type SearchMatchDisplayMode,
} from '@lib/studio/canvasSearch';
import { isFocusModeActive } from '@lib/studio/canvasFocusMode';
import type { StudioClass } from '@lib/studio/types';

const triggerClass =
  'inline-flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-200 min-w-0 max-w-[150px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const contentClass =
  'overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg z-[10001]';
const itemClass =
  'px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800';

function collectDistinctTags(classes: StudioClass[]): string[] {
  const s = new Set<string>();
  for (const c of classes) {
    for (const t of c.tags ?? []) {
      if (t) s.add(t);
    }
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

const iconBtnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function CanvasSearchBar() {
  const search = useCanvasSearchOptional();
  const focusMode = useCanvasFocusModeOptional();
  const studio = useStudioOptional();
  const classes = useMemo(() => studio?.state?.classes ?? [], [studio?.state?.classes]);
  const groups = useMemo(() => studio?.state?.groups ?? [], [studio?.state?.groups]);
  const tagChoices = useMemo(() => collectDistinctTags(classes), [classes]);
  const { entries, addEntry, removeEntry, clearAll } = useSearchHistory();
  const { items: savedItems, savePreset, removePreset } = useSavedCanvasSearches();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusActive = Boolean(
    focusMode?.state && isFocusModeActive(focusMode.state)
  );

  const visibleCount = useMemo(() => {
    if (!search) return null;
    if (!isSearchActive(search.state)) return null;
    return search.searchMatchClassCount;
  }, [search, search?.searchMatchClassCount]);

  const showNoMatches =
    visibleCount === 0 &&
    search != null &&
    isSearchActive(search.state) &&
    classes.length > 0;

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  const handleBlur = useCallback(() => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
    }
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      if (
        dropdownRef.current &&
        dropdownRef.current.contains(document.activeElement)
      ) {
        return;
      }
      setHistoryOpen(false);
      if (search?.state.canvasSearchQuery.trim()) {
        addEntry(search.state.canvasSearchQuery);
      }
    }, 150);
  }, [search?.state.canvasSearchQuery, addEntry]);

  const handleSelectHistoryEntry = useCallback(
    (query: string) => {
      search?.setQuery(query);
      setHistoryOpen(false);
      inputRef.current?.focus();
    },
    [search]
  );

  const handleRemoveHistoryEntry = useCallback(
    (e: MouseEvent, query: string) => {
      e.stopPropagation();
      removeEntry(query);
    },
    [removeEntry]
  );

  const handleClearAllHistory = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      clearAll();
    },
    [clearAll]
  );

  const handleConfirmSavePreset = useCallback(() => {
    if (!search) return;
    const name = saveName.trim();
    if (!name) return;
    savePreset(name, search.state);
    setSaveName('');
    setSaveDialogOpen(false);
  }, [saveName, savePreset, search]);

  if (!search) return null;

  const {
    state,
    setQuery,
    setUseRegex,
    setCaseSensitive,
    setFilterType,
    toggleFilterGroup,
    clearFilterGroups,
    setFilterTag,
    setHasProperties,
    setPropertyNameFilter,
    setRequireValidationErrors,
    setRequireDeprecated,
    setStructuralFilterMode,
    setQueryFieldCombineMode,
    setSearchInName,
    setSearchInDescription,
    setSearchInPropertyNames,
    setSearchInPropertyTypes,
    setSearchInTags,
    setSearchInAnnotations,
    setSearchMatchDisplayMode,
    setSearchInFocusOnly,
    clearSearch,
    stepActiveSearchMatch,
    activeSearchMatchIndex,
    searchMatchNavTotal,
    fitActiveSearchMatchOnCanvas,
    fitAllSearchMatchesOnCanvas,
  } = search;

  const groupFilterSummary =
    state.searchFilterGroups.length === 0
      ? 'All groups'
      : state.searchFilterGroups.length === 1
        ? groups.find((g) => g.id === state.searchFilterGroups[0])?.name ?? '1 group'
        : `${state.searchFilterGroups.length} groups`;

  const scopeCheckboxClass =
    'flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none';

  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[120px] max-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search canvas..."
            value={state.canvasSearchQuery}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setHistoryOpen(true)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (!isSearchActive(state) || searchMatchNavTotal <= 0) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                stepActiveSearchMatch(e.shiftKey ? -1 : 1);
                return;
              }
              if (e.key === 'F3') {
                e.preventDefault();
                stepActiveSearchMatch(e.shiftKey ? -1 : 1);
              }
            }}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            aria-label="Canvas search query"
          />

          {historyOpen && entries.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 top-full mt-1 w-[280px] max-h-[240px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-[10002]"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Recent searches</span>
                <button
                  type="button"
                  onMouseDown={(e) => handleClearAllHistory(e)}
                  className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1"
                  aria-label="Clear all search history"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear all
                </button>
              </div>
              <ul aria-label="Recent search queries">
                {entries.map((entry) => (
                  <li key={entry.query} className="flex items-center">
                    <button
                      type="button"
                      onMouseDown={() => handleSelectHistoryEntry(entry.query)}
                      className="flex flex-1 items-center gap-2 min-w-0 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                    >
                      <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{entry.query}</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => handleRemoveHistoryEntry(e, entry.query)}
                      className="p-0.5 mr-3 rounded hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
                      aria-label={`Remove "${entry.query}" from search history`}
                    >
                      <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {visibleCount != null && (
          <span
            className="text-xs tabular-nums text-slate-600 dark:text-slate-400 shrink-0"
            aria-live="polite"
          >
            {visibleCount} {visibleCount === 1 ? 'class' : 'classes'}
          </span>
        )}

        {isSearchActive(state) && searchMatchNavTotal > 0 ? (
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Search match navigation"
          >
            <button
              type="button"
              className={iconBtnClass}
              aria-label="Previous search match on canvas"
              onClick={() => stepActiveSearchMatch(-1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400 min-w-[3.25rem] text-center">
              {activeSearchMatchIndex < 0 ? '—' : activeSearchMatchIndex + 1}/{searchMatchNavTotal}
            </span>
            <button
              type="button"
              className={iconBtnClass}
              aria-label="Next search match on canvas"
              onClick={() => stepActiveSearchMatch(1)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onClick={() => fitActiveSearchMatchOnCanvas()}
            >
              Zoom match
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onClick={() => fitAllSearchMatchesOnCanvas()}
            >
              Fit all matches
            </button>
          </div>
        ) : null}

        <Select.Root
          value={state.searchMatchDisplayMode}
          onValueChange={(v) =>
            setSearchMatchDisplayMode(v as SearchMatchDisplayMode)
          }
        >
          <Select.Trigger
            className={triggerClass}
            aria-label="How to show non-matching nodes while search is active"
          >
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={contentClass} position="popper" sideOffset={4}>
              <Select.Viewport>
                <Select.Item value="hideNonMatches" className={itemClass}>
                  <Select.ItemText>Hide non-matches</Select.ItemText>
                </Select.Item>
                <Select.Item value="dimNonMatches" className={itemClass}>
                  <Select.ItemText>Dim non-matches</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <label
          className={`${scopeCheckboxClass} ${!focusActive ? 'opacity-50' : ''}`}
          title={
            focusActive
              ? undefined
              : 'Turn on focus mode on the canvas to limit matches to the focused subgraph'
          }
        >
          <Checkbox.Root
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
            checked={state.searchInFocusOnly}
            disabled={!focusActive}
            onCheckedChange={(c) => setSearchInFocusOnly(c === true)}
          >
            <Checkbox.Indicator>
              <Check className="h-3 w-3 text-white" strokeWidth={3} />
            </Checkbox.Indicator>
          </Checkbox.Root>
          <span>In focus only</span>
        </label>

        <div className="flex items-center gap-2">
          <Switch.Root
            id="canvas-search-regex"
            checked={state.useRegex}
            onCheckedChange={setUseRegex}
            className="w-9 h-5 rounded-full border border-slate-200 dark:border-slate-600 bg-slate-200 dark:bg-slate-700 data-[state=checked]:bg-indigo-600 dark:data-[state=checked]:bg-indigo-600 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            <Switch.Thumb className="block w-4 h-4 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-4" />
          </Switch.Root>
          <Label.Root htmlFor="canvas-search-regex" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            Regex
          </Label.Root>
        </div>

        <div className="flex items-center gap-2">
          <Switch.Root
            id="canvas-search-case"
            checked={state.caseSensitive}
            onCheckedChange={setCaseSensitive}
            className="w-9 h-5 rounded-full border border-slate-200 dark:border-slate-600 bg-slate-200 dark:bg-slate-700 data-[state=checked]:bg-indigo-600 dark:data-[state=checked]:bg-indigo-600 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            <Switch.Thumb className="block w-4 h-4 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-4" />
          </Switch.Root>
          <Label.Root htmlFor="canvas-search-case" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            Aa
          </Label.Root>
        </div>

        <Select.Root
          value={state.searchFilterType}
          onValueChange={(v) => setFilterType(v as SearchFilterType)}
        >
          <Select.Trigger className={triggerClass} aria-label="Filter by type">
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={contentClass} position="popper" sideOffset={4}>
              <Select.Viewport>
                <Select.Item value="all" className={itemClass}>
                  <Select.ItemText>All types</Select.ItemText>
                </Select.Item>
                <Select.Item value="class" className={itemClass}>
                  <Select.ItemText>Class</Select.ItemText>
                </Select.Item>
                <Select.Item value="allOf" className={itemClass}>
                  <Select.ItemText>Composition (allOf)</Select.ItemText>
                </Select.Item>
                <Select.Item value="oneOf" className={itemClass}>
                  <Select.ItemText>oneOf</Select.ItemText>
                </Select.Item>
                <Select.Item value="anyOf" className={itemClass}>
                  <Select.ItemText>anyOf</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={triggerClass}
              aria-label="Filter canvas by group"
              title="Show only classes in the selected groups (multi-select)"
            >
              <span className="truncate min-w-0">{groupFilterSummary}</span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className={`${contentClass} w-[min(280px,85vw)] max-h-[min(320px,50vh)] overflow-y-auto p-2 z-[10003]`}
              sideOffset={4}
              align="start"
            >
              <div className="flex items-center justify-between gap-2 mb-2 px-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Show classes in…
                </span>
                {state.searchFilterGroups.length > 0 ? (
                  <button
                    type="button"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    onClick={clearFilterGroups}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {groups.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 px-1 py-2">No groups yet.</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {groups.map((g) => {
                    const checked = state.searchFilterGroups.includes(g.id);
                    return (
                      <li key={g.id}>
                        <label className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-sm text-slate-800 dark:text-slate-200">
                          <Checkbox.Root
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                            checked={checked}
                            onCheckedChange={() => toggleFilterGroup(g.id)}
                          >
                            <Checkbox.Indicator>
                              <Check className="h-3 w-3 text-white" strokeWidth={3} />
                            </Checkbox.Indicator>
                          </Checkbox.Root>
                          <span className="truncate">{g.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Select.Root
          value={state.searchFilterTag ?? '\x00'}
          onValueChange={(v) => setFilterTag(v === '\x00' ? null : v)}
        >
          <Select.Trigger className={triggerClass} aria-label="Filter by tag">
            <Select.Value placeholder="All tags" />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={contentClass} position="popper" sideOffset={4}>
              <Select.Viewport>
                <Select.Item value={'\x00'} className={itemClass}>
                  <Select.ItemText>All tags</Select.ItemText>
                </Select.Item>
                {tagChoices.map((t) => (
                  <Select.Item key={t} value={t} className={itemClass}>
                    <Select.ItemText>{t}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Select.Root
          value={
            state.hasProperties === null
              ? '__any__'
              : state.hasProperties
                ? 'yes'
                : 'no'
          }
          onValueChange={(v) =>
            setHasProperties(v === '__any__' ? null : v === 'yes')
          }
        >
          <Select.Trigger className={triggerClass} aria-label="Has properties">
            <Select.Value placeholder="Has properties" />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={contentClass} position="popper" sideOffset={4}>
              <Select.Viewport>
                <Select.Item value="__any__" className={itemClass}>
                  <Select.ItemText>Any</Select.ItemText>
                </Select.Item>
                <Select.Item value="yes" className={itemClass}>
                  <Select.ItemText>Has properties</Select.ItemText>
                </Select.Item>
                <Select.Item value="no" className={itemClass}>
                  <Select.ItemText>No properties</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <div className="min-w-[100px] max-w-[140px]">
          <input
            type="text"
            placeholder="Has property (name)"
            value={state.propertyNameFilter}
            onChange={(e) => setPropertyNameFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            aria-label="Filter by property name"
          />
        </div>

        <Select.Root
          value={
            state.requireValidationErrors === null
              ? '__any_val__'
              : state.requireValidationErrors
                ? 'yes_val'
                : 'no_val'
          }
          onValueChange={(v) => {
            if (v === '__any_val__') setRequireValidationErrors(null);
            else if (v === 'yes_val') setRequireValidationErrors(true);
            else setRequireValidationErrors(false);
          }}
        >
          <Select.Trigger className={triggerClass} aria-label="Validation errors">
            <Select.Value placeholder="Validation" />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={contentClass} position="popper" sideOffset={4}>
              <Select.Viewport>
                <Select.Item value="__any_val__" className={itemClass}>
                  <Select.ItemText>Any validation</Select.ItemText>
                </Select.Item>
                <Select.Item value="yes_val" className={itemClass}>
                  <Select.ItemText>Has errors</Select.ItemText>
                </Select.Item>
                <Select.Item value="no_val" className={itemClass}>
                  <Select.ItemText>No errors</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Select.Root
          value={
            state.requireDeprecated === null
              ? '__any_dep__'
              : state.requireDeprecated
                ? 'dep_yes'
                : 'dep_no'
          }
          onValueChange={(v) => {
            if (v === '__any_dep__') setRequireDeprecated(null);
            else if (v === 'dep_yes') setRequireDeprecated(true);
            else setRequireDeprecated(false);
          }}
        >
          <Select.Trigger className={triggerClass} aria-label="Deprecated">
            <Select.Value placeholder="Deprecated" />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={contentClass} position="popper" sideOffset={4}>
              <Select.Viewport>
                <Select.Item value="__any_dep__" className={itemClass}>
                  <Select.ItemText>Any deprecation</Select.ItemText>
                </Select.Item>
                <Select.Item value="dep_yes" className={itemClass}>
                  <Select.ItemText>Deprecated</Select.ItemText>
                </Select.Item>
                <Select.Item value="dep_no" className={itemClass}>
                  <Select.ItemText>Not deprecated</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Select.Root
          value={state.structuralFilterMode}
          onValueChange={(v) =>
            setStructuralFilterMode(v === 'or' ? 'or' : 'and')
          }
        >
          <Select.Trigger className={triggerClass} aria-label="Combine structural filters">
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={contentClass} position="popper" sideOffset={4}>
              <Select.Viewport>
                <Select.Item value="and" className={itemClass}>
                  <Select.ItemText>Filters: ALL</Select.ItemText>
                </Select.Item>
                <Select.Item value="or" className={itemClass}>
                  <Select.ItemText>Filters: ANY</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={`${triggerClass} max-w-[160px]`}
              aria-label="Load a saved search"
            >
              <span className="truncate">Saved</span>
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className={`${contentClass} min-w-[200px] max-h-[280px] overflow-y-auto p-1`}
              sideOffset={4}
              align="start"
            >
              {savedItems.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">No saved searches yet</div>
              ) : (
                savedItems.map((s) => (
                  <DropdownMenu.Item
                    key={s.id}
                    className="px-3 py-2 text-sm rounded-md outline-none cursor-pointer text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800"
                    onSelect={() => search.setState(s.state)}
                  >
                    {s.name}
                  </DropdownMenu.Item>
                ))
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <button
          type="button"
          onClick={() => setSaveDialogOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
          Save
        </button>

        <button
          type="button"
          onClick={() => clearSearch()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Reset
        </button>

        <Collapsible.Root open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Collapsible.Trigger className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
              aria-hidden
            />
            Search fields
          </Collapsible.Trigger>
          <Collapsible.Content className="w-full pt-2">
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/40 p-3">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <label className={scopeCheckboxClass}>
                  <Checkbox.Root
                    checked={state.searchInName}
                    onCheckedChange={(c) => setSearchInName(c === true)}
                    className="flex h-4 w-4 items-center justify-center rounded border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-900 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                  >
                    <Checkbox.Indicator>
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  Name
                </label>
                <label className={scopeCheckboxClass}>
                  <Checkbox.Root
                    checked={state.searchInDescription}
                    onCheckedChange={(c) => setSearchInDescription(c === true)}
                    className="flex h-4 w-4 items-center justify-center rounded border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-900 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                  >
                    <Checkbox.Indicator>
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  Description
                </label>
                <label className={scopeCheckboxClass}>
                  <Checkbox.Root
                    checked={state.searchInPropertyNames}
                    onCheckedChange={(c) => setSearchInPropertyNames(c === true)}
                    className="flex h-4 w-4 items-center justify-center rounded border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-900 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                  >
                    <Checkbox.Indicator>
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  Property names
                </label>
                <label className={scopeCheckboxClass}>
                  <Checkbox.Root
                    checked={state.searchInPropertyTypes}
                    onCheckedChange={(c) => setSearchInPropertyTypes(c === true)}
                    className="flex h-4 w-4 items-center justify-center rounded border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-900 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                  >
                    <Checkbox.Indicator>
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  Property types
                </label>
                <label className={scopeCheckboxClass}>
                  <Checkbox.Root
                    checked={state.searchInTags}
                    onCheckedChange={(c) => setSearchInTags(c === true)}
                    className="flex h-4 w-4 items-center justify-center rounded border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-900 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                  >
                    <Checkbox.Indicator>
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  Tags
                </label>
                <label className={scopeCheckboxClass}>
                  <Checkbox.Root
                    checked={state.searchInAnnotations}
                    onCheckedChange={(c) => setSearchInAnnotations(c === true)}
                    className="flex h-4 w-4 items-center justify-center rounded border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-900 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                  >
                    <Checkbox.Indicator>
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  Metadata
                </label>
              </div>
              <div className="flex items-center gap-2 w-full min-w-[200px]">
                <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">Match fields</span>
                <Select.Root
                  value={state.queryFieldCombineMode}
                  onValueChange={(v) =>
                    setQueryFieldCombineMode(v === 'matchAll' ? 'matchAll' : 'matchAny')
                  }
                >
                  <Select.Trigger className={`${triggerClass} max-w-[220px]`}>
                    <Select.Value />
                    <Select.Icon>
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className={contentClass} position="popper" sideOffset={4}>
                      <Select.Viewport>
                        <Select.Item value="matchAny" className={itemClass}>
                          <Select.ItemText>Match any selected field</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="matchAll" className={itemClass}>
                          <Select.ItemText>Match all selected fields</Select.ItemText>
                        </Select.Item>
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
            </div>
            {savedItems.length > 0 && (
              <ul className="mt-2 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                {savedItems.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{s.name}</span>
                    <button
                      type="button"
                      className="shrink-0 text-red-500 hover:underline"
                      onClick={() => removePreset(s.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Collapsible.Content>
        </Collapsible.Root>
      </div>

      {showNoMatches && (
        <p
          className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1.5"
          role="status"
        >
          No matches. Try clearing some filters, use <strong className="font-medium">Match any selected field</strong>,
          or switch structural filters to <strong className="font-medium">ANY</strong> when several are set.
        </p>
      )}

      <Dialog.Root open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[10003]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[10004] w-[min(100vw-2rem,360px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-4 shadow-xl focus:outline-none">
            <Dialog.Title className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Save search
            </Dialog.Title>
            <Dialog.Description className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Store the current query and filters under a name. It is saved in this browser only.
            </Dialog.Description>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Name"
              className="mt-3 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={!saveName.trim()}
                onClick={handleConfirmSavePreset}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none"
              >
                Save
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
