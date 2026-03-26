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
  saveSearchHistoryEntries,
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

// Helper: should account sync be disabled based on this error?
function shouldDisableSync(error: unknown): boolean {
  return isRestApiError(error) && (error.statusCode === 401 || error.statusCode === 404);
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
    if (shouldDisableSync(e)) {
      // Re-throw so the caller (useEffect) can disable sync and avoid retries.
      throw e;
    }
    // For other errors (403, network failures, etc.) treat as unsupported and
    // return null so the local-only history continues to work.
    return null;
  }
}

async function saveAccountHistory(entries: SearchHistoryEntry[]): Promise<void> {
  const me = await getMe();
  const meta = (me.metadata ?? {}) as Record<string, unknown>;
  const nextMeta: Record<string, unknown> = {
    ...meta,
    [ACCOUNT_HISTORY_METADATA_KEY]: { entries },
  };
  await updateMe({ metadata: nextMeta });
}

export function useSearchHistory(): UseSearchHistoryReturn {
  const [entries, setEntries] = useState<SearchHistoryEntry[]>(getSearchHistory);
  const [syncEnabled, setSyncEnabledState] = useState<boolean>(getSearchHistorySyncEnabled);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gate: true once the initial account fetch+merge has completed so the save
  // effect never fires a write before we have merged remote data.
  const hydratedFromAccountRef = useRef<boolean>(false);

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
    if (!enabled) {
      // Reset the hydration gate so that if the user re-enables sync later the
      // fetch effect will run again before any save is attempted.
      hydratedFromAccountRef.current = false;
    }
    setSearchHistorySyncEnabled(enabled);
    setSyncEnabledState(enabled);
  }, []);

  // Fetch + merge remote history when sync is enabled.
  useEffect(() => {
    if (!syncEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchAccountHistory();
        if (cancelled || !remote) return;
        const local = getSearchHistory();
        const merged = mergeEntries(local, remote);
        // Use the shared persistence helper so the cap and sanitization rules
        // are applied consistently with the rest of the search history module.
        saveSearchHistoryEntries(merged);
        setEntries(merged);
      } catch (error: unknown) {
        if (shouldDisableSync(error)) {
          // Account sync is not supported or the user is signed out; disable
          // syncing to avoid repeated failing network calls.
          setSyncEnabled(false);
          return;
        }
        // For other transient errors ignore so we don't spam failing requests.
      } finally {
        if (!cancelled) {
          hydratedFromAccountRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncEnabled, setSyncEnabled]);

  // Debounced save back to the account whenever entries change.
  useEffect(() => {
    if (!syncEnabled) return;
    // Do not write to the account before the initial remote merge has finished;
    // otherwise a fast local change could overwrite the remote history.
    if (!hydratedFromAccountRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void (async () => {
        try {
          await saveAccountHistory(entries);
        } catch (error: unknown) {
          if (shouldDisableSync(error)) {
            // Account sync is not supported or the user is signed out; disable
            // syncing to avoid repeated failing network calls.
            setSyncEnabled(false);
          }
          // For other transient errors ignore.
        }
      })();
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [entries, syncEnabled, setSyncEnabled]);

  return { entries, addEntry, removeEntry, clearAll, refresh, syncEnabled, setSyncEnabled };
}

