/**
 * React hook for canvas search history management.
 * GitHub #86 — Add search history to the canvas search functionality.
 *
 * Wraps the localStorage persistence functions from searchHistory.ts
 * with React state so the UI re-renders when history changes.
 */

'use client';

import { useCallback, useState } from 'react';
import {
  getSearchHistory,
  addSearchHistoryEntry,
  removeSearchHistoryEntry,
  clearSearchHistory,
  type SearchHistoryEntry,
} from '@lib/studio/searchHistory';

export interface UseSearchHistoryReturn {
  /** Current list of search history entries (most recent first). */
  entries: SearchHistoryEntry[];
  /** Add a query to the history. Blank queries are ignored. Duplicates move to front. */
  addEntry: (query: string) => void;
  /** Remove a specific entry by its query string. */
  removeEntry: (query: string) => void;
  /** Clear all search history entries. */
  clearAll: () => void;
  /** Re-read entries from localStorage (useful after external changes). */
  refresh: () => void;
}

export function useSearchHistory(): UseSearchHistoryReturn {
  const [entries, setEntries] = useState<SearchHistoryEntry[]>(getSearchHistory);

  const addEntry = useCallback((query: string) => {
    const updated = addSearchHistoryEntry(query);
    setEntries(updated);
  }, []);

  const removeEntry = useCallback((query: string) => {
    const updated = removeSearchHistoryEntry(query);
    setEntries(updated);
  }, []);

  const clearAll = useCallback(() => {
    const updated = clearSearchHistory();
    setEntries(updated);
  }, []);

  const refresh = useCallback(() => {
    setEntries(getSearchHistory());
  }, []);

  return { entries, addEntry, removeEntry, clearAll, refresh };
}

