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
  type CanvasSearchState,
  type SearchFilterType,
} from '@lib/studio/canvasSearch';

export interface CanvasSearchContextValue {
  state: CanvasSearchState;
  setState: (state: CanvasSearchState) => void;
  setQuery: (canvasSearchQuery: string) => void;
  setUseRegex: (useRegex: boolean) => void;
  setFilterType: (searchFilterType: SearchFilterType) => void;
  setFilterGroup: (searchFilterGroup: string | null) => void;
  setHasProperties: (hasProperties: boolean | null) => void;
  setPropertyNameFilter: (propertyNameFilter: string) => void;
}

const CanvasSearchContext = createContext<CanvasSearchContextValue | null>(null);

export function CanvasSearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CanvasSearchState>(defaultCanvasSearchState);

  const setQuery = useCallback((canvasSearchQuery: string) => {
    setState((prev) => ({ ...prev, canvasSearchQuery }));
  }, []);

  const setUseRegex = useCallback((useRegex: boolean) => {
    setState((prev) => ({ ...prev, useRegex }));
  }, []);

  const setFilterType = useCallback((searchFilterType: SearchFilterType) => {
    setState((prev) => ({ ...prev, searchFilterType }));
  }, []);

  const setFilterGroup = useCallback((searchFilterGroup: string | null) => {
    setState((prev) => ({ ...prev, searchFilterGroup }));
  }, []);

  const setHasProperties = useCallback((hasProperties: boolean | null) => {
    setState((prev) => ({ ...prev, hasProperties }));
  }, []);

  const setPropertyNameFilter = useCallback((propertyNameFilter: string) => {
    setState((prev) => ({ ...prev, propertyNameFilter }));
  }, []);

  const value = useMemo<CanvasSearchContextValue>(
    () => ({
      state,
      setState,
      setQuery,
      setUseRegex,
      setFilterType,
      setFilterGroup,
      setHasProperties,
      setPropertyNameFilter,
    }),
    [
      state,
      setQuery,
      setUseRegex,
      setFilterType,
      setFilterGroup,
      setHasProperties,
      setPropertyNameFilter,
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
