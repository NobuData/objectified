/**
 * React hook for canvas search history management.
 * GitHub #86 — Add search history to the canvas search functionality.
 *
 * Wraps the localStorage persistence functions from searchHistory.ts
 * with React state so the UI re-renders when history changes.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSearchHistory,
  addSearchHistoryEntry,
  removeSearchHistoryEntry,
  clearSearchHistory,
  type SearchHistoryEntry,
  getSearchHistorySyncEnabled,
  setSearchHistorySyncEnabled,
} from '@lib/studio/searchHistory';
import { getMe, updateMe, isRestApiError } from '@lib/api/rest-client';

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
  /** Whether to sync search history to the signed-in user account (when supported). */
  syncEnabled: boolean;
  /** Enable/disable account sync. */
  setSyncEnabled: (enabled: boolean) => void;
}

const ACCOUNT_HISTORY_METADATA_KEY = 'canvas_search_history_v1';
const SAVE_DEBOUNCE_MS = 750;

function normalizeEntryLike(x: unknown): SearchHistoryEntry | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (typeof r.query !== 'string' || typeof r.savedAt !== 'string') return null;
  return { query: r.query, savedAt: r.savedAt };
}

function normalizeEntryList(raw: unknown): SearchHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeEntryLike).filter((x): x is SearchHistoryEntry => x != null);
}

function isoTimeMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function mergeEntries(local: SearchHistoryEntry[], remote: SearchHistoryEntry[]): SearchHistoryEntry[] {
  const byLower = new Map<string, SearchHistoryEntry>();
  const ingest = (entries: SearchHistoryEntry[]) => {
    for (const e of entries) {
      const q = e.query?.trim();
      if (!q) continue;
      const key = q.toLowerCase();
      const prev = byLower.get(key);
      if (!prev || isoTimeMs(e.savedAt) >= isoTimeMs(prev.savedAt)) {
        byLower.set(key, { query: q, savedAt: e.savedAt });
      }
    }
  };
  ingest(local);
  ingest(remote);
  return Array.from(byLower.values()).sort((a, b) => isoTimeMs(b.savedAt) - isoTimeMs(a.savedAt));
}

async function fetchAccountHistory(): Promise<SearchHistoryEntry[] | null> {
  try {
    const me = await getMe();
    const meta = (me.metadata ?? {}) as Record<string, unknown>;
    const raw = meta[ACCOUNT_HISTORY_METADATA_KEY] as unknown;
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    const entries = normalizeEntryList(obj?.entries);
    return entries;
  } catch (e: unknown) {
    if (isRestApiError(e)) {
      // Not signed in / endpoint not available / forbidden: treat as unsupported.
      if (e.statusCode === 401 || e.statusCode === 403 || e.statusCode === 404) return null;
    }
    return null;
  }
}

async function saveAccountHistory(entries: SearchHistoryEntry[]): Promise<void> {
  try {
    const me = await getMe();
    const meta = (me.metadata ?? {}) as Record<string, unknown>;
    const nextMeta: Record<string, unknown> = {
      ...meta,
      [ACCOUNT_HISTORY_METADATA_KEY]: { entries },
    };
    await updateMe({ metadata: nextMeta });
  } catch {
    // Best-effort only.
  }
}

export function useSearchHistory(): UseSearchHistoryReturn {
  const [entries, setEntries] = useState<SearchHistoryEntry[]>(getSearchHistory);
  const [syncEnabled, setSyncEnabledState] = useState<boolean>(getSearchHistorySyncEnabled);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const setSyncEnabled = useCallback((enabled: boolean) => {
    setSearchHistorySyncEnabled(enabled);
    setSyncEnabledState(enabled);
  }, []);

  useEffect(() => {
    if (!syncEnabled) return;
    let cancelled = false;
    (async () => {
      const remote = await fetchAccountHistory();
      if (cancelled || !remote) return;
      const local = getSearchHistory();
      const merged = mergeEntries(local, remote);
      // Persist merged list locally so the UI and other tabs stay consistent.
      localStorage.setItem('objectified:canvas:searchHistory', JSON.stringify({ entries: merged }));
      setEntries(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [syncEnabled]);

  useEffect(() => {
    if (!syncEnabled) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveAccountHistory(entries);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [entries, syncEnabled]);

  return { entries, addEntry, removeEntry, clearAll, refresh, syncEnabled, setSyncEnabled };
}

