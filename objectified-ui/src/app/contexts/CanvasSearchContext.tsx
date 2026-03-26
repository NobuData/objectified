'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  defaultCanvasSearchState,
  normalizeCanvasSearchState,
  type CanvasSearchState,
  type SearchFilterType,
  type QueryFieldCombineMode,
  type StructuralFilterCombineMode,
  type SearchMatchDisplayMode,
} from '@lib/studio/canvasSearch';

export interface CanvasSearchContextValue {
  state: CanvasSearchState;
  setState: (state: CanvasSearchState) => void;
  patchState: (partial: Partial<CanvasSearchState>) => void;
  clearSearch: () => void;
  setQuery: (canvasSearchQuery: string) => void;
  setUseRegex: (useRegex: boolean) => void;
  setCaseSensitive: (caseSensitive: boolean) => void;
  setFilterType: (searchFilterType: SearchFilterType) => void;
  setFilterGroups: (searchFilterGroups: string[]) => void;
  toggleFilterGroup: (groupId: string) => void;
  clearFilterGroups: () => void;
  setFilterTag: (searchFilterTag: string | null) => void;
  setHasProperties: (hasProperties: boolean | null) => void;
  setPropertyNameFilter: (propertyNameFilter: string) => void;
  setRequireValidationErrors: (requireValidationErrors: boolean | null) => void;
  setRequireDeprecated: (requireDeprecated: boolean | null) => void;
  setStructuralFilterMode: (structuralFilterMode: StructuralFilterCombineMode) => void;
  setQueryFieldCombineMode: (queryFieldCombineMode: QueryFieldCombineMode) => void;
  setSearchInName: (v: boolean) => void;
  setSearchInDescription: (v: boolean) => void;
  setSearchInPropertyNames: (v: boolean) => void;
  setSearchInPropertyTypes: (v: boolean) => void;
  setSearchInTags: (v: boolean) => void;
  setSearchInAnnotations: (v: boolean) => void;
  setSearchMatchDisplayMode: (mode: SearchMatchDisplayMode) => void;
  setSearchInFocusOnly: (v: boolean) => void;
  /** Match navigation (GitHub #242): index into ordered canvas matches, or -1 if none / cleared. */
  activeSearchMatchIndex: number;
  setActiveSearchMatchIndex: (i: number) => void;
  stepActiveSearchMatch: (delta: 1 | -1) => void;
  resetActiveSearchMatch: () => void;
  /** Class ids matching current search (may differ from nav list when only node-order is needed). */
  searchMatchClassCount: number;
  setSearchMatchClassCount: (n: number) => void;
  /** Count of navigable match nodes on canvas (classes + broken-ref nodes in walk order). */
  searchMatchNavTotal: number;
  setSearchMatchNavTotal: (n: number) => void;
  /** Registered by canvas React Flow (GitHub #242). */
  registerSearchZoomHandlers: (
    handlers: { fitActive: () => void; fitAll: () => void } | null
  ) => void;
  fitActiveSearchMatchOnCanvas: () => void;
  fitAllSearchMatchesOnCanvas: () => void;
}

const CanvasSearchContext = createContext<CanvasSearchContextValue | null>(null);

export function CanvasSearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CanvasSearchState>(defaultCanvasSearchState);
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(-1);
  const [searchMatchClassCount, setSearchMatchClassCount] = useState(0);
  const [searchMatchNavTotal, setSearchMatchNavTotalState] = useState(0);
  const searchMatchNavTotalRef = useRef(0);
  const searchZoomHandlersRef = useRef<{ fitActive: () => void; fitAll: () => void } | null>(
    null
  );

  const patchState = useCallback((partial: Partial<CanvasSearchState>) => {
    setState((prev) => normalizeCanvasSearchState({ ...prev, ...partial }));
  }, []);

  const clearSearch = useCallback(() => {
    setState(defaultCanvasSearchState);
    setActiveSearchMatchIndex(-1);
    setSearchMatchClassCount(0);
    searchMatchNavTotalRef.current = 0;
    setSearchMatchNavTotalState(0);
  }, []);

  const setSearchMatchNavTotal = useCallback((n: number) => {
    searchMatchNavTotalRef.current = n;
    setSearchMatchNavTotalState(n);
    setActiveSearchMatchIndex((idx) => (idx >= n ? -1 : idx));
  }, []);

  const resetActiveSearchMatch = useCallback(() => {
    setActiveSearchMatchIndex(-1);
  }, []);

  const stepActiveSearchMatch = useCallback((delta: 1 | -1) => {
    const n = searchMatchNavTotalRef.current;
    if (n <= 0) {
      setActiveSearchMatchIndex(-1);
      return;
    }
    setActiveSearchMatchIndex((prev) => {
      if (prev < 0) return delta > 0 ? 0 : n - 1;
      return (prev + delta + n * 10) % n;
    });
  }, []);

  const setQuery = useCallback((canvasSearchQuery: string) => {
    setState((prev) => ({ ...prev, canvasSearchQuery }));
  }, []);

  const setUseRegex = useCallback((useRegex: boolean) => {
    setState((prev) => ({ ...prev, useRegex }));
  }, []);

  const setCaseSensitive = useCallback((caseSensitive: boolean) => {
    setState((prev) => ({ ...prev, caseSensitive }));
  }, []);

  const setFilterType = useCallback((searchFilterType: SearchFilterType) => {
    setState((prev) => ({ ...prev, searchFilterType }));
  }, []);

  const setFilterGroups = useCallback((searchFilterGroups: string[]) => {
    setState((prev) => ({ ...prev, searchFilterGroups: [...new Set(searchFilterGroups)] }));
  }, []);

  const toggleFilterGroup = useCallback((groupId: string) => {
    setState((prev) => {
      const cur = prev.searchFilterGroups;
      const has = cur.includes(groupId);
      const next = has ? cur.filter((id) => id !== groupId) : [...cur, groupId];
      return { ...prev, searchFilterGroups: next };
    });
  }, []);

  const clearFilterGroups = useCallback(() => {
    setState((prev) => ({ ...prev, searchFilterGroups: [] }));
  }, []);

  const setFilterTag = useCallback((searchFilterTag: string | null) => {
    setState((prev) => ({ ...prev, searchFilterTag }));
  }, []);

  const setHasProperties = useCallback((hasProperties: boolean | null) => {
    setState((prev) => ({ ...prev, hasProperties }));
  }, []);

  const setPropertyNameFilter = useCallback((propertyNameFilter: string) => {
    setState((prev) => ({ ...prev, propertyNameFilter }));
  }, []);

  const setRequireValidationErrors = useCallback((requireValidationErrors: boolean | null) => {
    setState((prev) => ({ ...prev, requireValidationErrors }));
  }, []);

  const setRequireDeprecated = useCallback((requireDeprecated: boolean | null) => {
    setState((prev) => ({ ...prev, requireDeprecated }));
  }, []);

  const setStructuralFilterMode = useCallback(
    (structuralFilterMode: StructuralFilterCombineMode) => {
      setState((prev) => ({ ...prev, structuralFilterMode }));
    },
    []
  );

  const setQueryFieldCombineMode = useCallback((queryFieldCombineMode: QueryFieldCombineMode) => {
    setState((prev) => ({ ...prev, queryFieldCombineMode }));
  }, []);

  const setSearchInName = useCallback((searchInName: boolean) => {
    setState((prev) => ({ ...prev, searchInName }));
  }, []);

  const setSearchInDescription = useCallback((searchInDescription: boolean) => {
    setState((prev) => ({ ...prev, searchInDescription }));
  }, []);

  const setSearchInPropertyNames = useCallback((searchInPropertyNames: boolean) => {
    setState((prev) => ({ ...prev, searchInPropertyNames }));
  }, []);

  const setSearchInPropertyTypes = useCallback((searchInPropertyTypes: boolean) => {
    setState((prev) => ({ ...prev, searchInPropertyTypes }));
  }, []);

  const setSearchInTags = useCallback((searchInTags: boolean) => {
    setState((prev) => ({ ...prev, searchInTags }));
  }, []);

  const setSearchInAnnotations = useCallback((searchInAnnotations: boolean) => {
    setState((prev) => ({ ...prev, searchInAnnotations }));
  }, []);

  const setSearchMatchDisplayMode = useCallback((searchMatchDisplayMode: SearchMatchDisplayMode) => {
    setState((prev) => ({ ...prev, searchMatchDisplayMode }));
  }, []);

  const setSearchInFocusOnly = useCallback((searchInFocusOnly: boolean) => {
    setState((prev) => ({ ...prev, searchInFocusOnly }));
  }, []);

  const registerSearchZoomHandlers = useCallback(
    (handlers: { fitActive: () => void; fitAll: () => void } | null) => {
      searchZoomHandlersRef.current = handlers;
    },
    []
  );

  const fitActiveSearchMatchOnCanvas = useCallback(() => {
    searchZoomHandlersRef.current?.fitActive();
  }, []);

  const fitAllSearchMatchesOnCanvas = useCallback(() => {
    searchZoomHandlersRef.current?.fitAll();
  }, []);

  const value = useMemo<CanvasSearchContextValue>(
    () => ({
      state,
      setState: (s) => setState(normalizeCanvasSearchState(s)),
      patchState,
      clearSearch,
      setQuery,
      setUseRegex,
      setCaseSensitive,
      setFilterType,
      setFilterGroups,
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
      activeSearchMatchIndex,
      setActiveSearchMatchIndex,
      stepActiveSearchMatch,
      resetActiveSearchMatch,
      searchMatchClassCount,
      setSearchMatchClassCount,
      searchMatchNavTotal,
      setSearchMatchNavTotal,
      registerSearchZoomHandlers,
      fitActiveSearchMatchOnCanvas,
      fitAllSearchMatchesOnCanvas,
    }),
    [
      state,
      patchState,
      clearSearch,
      setQuery,
      setUseRegex,
      setCaseSensitive,
      setFilterType,
      setFilterGroups,
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
      activeSearchMatchIndex,
      stepActiveSearchMatch,
      resetActiveSearchMatch,
      searchMatchClassCount,
      searchMatchNavTotal,
      setSearchMatchNavTotal,
      registerSearchZoomHandlers,
      fitActiveSearchMatchOnCanvas,
      fitAllSearchMatchesOnCanvas,
    ]
  );

  return (
    <CanvasSearchContext.Provider value={value}>
      {children}
    </CanvasSearchContext.Provider>
  );
}

export function useCanvasSearch(): CanvasSearchContextValue {
  const ctx = useContext(CanvasSearchContext);
  if (!ctx) {
    throw new Error(
      'useCanvasSearch must be used within CanvasSearchProvider'
    );
  }
  return ctx;
}

export function useCanvasSearchOptional(): CanvasSearchContextValue | null {
  return useContext(CanvasSearchContext);
}
