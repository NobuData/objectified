'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
}

const CanvasSearchContext = createContext<CanvasSearchContextValue | null>(null);

export function CanvasSearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CanvasSearchState>(defaultCanvasSearchState);

  const patchState = useCallback((partial: Partial<CanvasSearchState>) => {
    setState((prev) => normalizeCanvasSearchState({ ...prev, ...partial }));
  }, []);

  const clearSearch = useCallback(() => {
    setState(defaultCanvasSearchState);
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
