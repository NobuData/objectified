/**
 * Canvas search history — localStorage persistence.
 * GitHub #86 — Add search history to the canvas search functionality.
 *
 * Stores recent search queries so users can quickly re-apply previous searches.
 * Reference: canvasSettings.ts for the localStorage persistence pattern.
 */

const SEARCH_HISTORY_KEY = 'objectified:canvas:searchHistory';
const SEARCH_HISTORY_SYNC_ENABLED_KEY = 'objectified:canvas:searchHistorySyncEnabled';

/** Maximum number of history entries retained. */
export const MAX_HISTORY_ENTRIES = 50;

export interface SearchHistoryEntry {
  /** The search query text. */
  query: string;
  /** ISO-8601 timestamp of when the entry was saved. */
  savedAt: string;
}

interface StoredSearchHistory {
  entries: SearchHistoryEntry[];
}

/**
 * Load search history entries from localStorage.
 * Returns an empty array when nothing is stored or on error.
 */
export function getSearchHistory(): SearchHistoryEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as StoredSearchHistory;
    if (!Array.isArray(data.entries)) return [];
    // Sanitize: discard any entry whose required fields are not strings (e.g.
    // corrupted or legacy localStorage data) to prevent downstream .toLowerCase()
    // calls from throwing.
    return data.entries.filter(
      (e) => typeof e?.query === 'string' && typeof e?.savedAt === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * Persist search history entries to localStorage.
 */
function saveSearchHistory(entries: SearchHistoryEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const data: StoredSearchHistory = { entries };
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Add a query to the search history. Duplicate queries are moved to the front
 * (most recent). The list is capped at MAX_HISTORY_ENTRIES.
 * Blank/whitespace-only queries are ignored.
 * Returns the updated entries list.
 */
export function addSearchHistoryEntry(query: string): SearchHistoryEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return getSearchHistory();

  const existing = getSearchHistory();
  // Remove any previous occurrence of the same query (case-insensitive)
  const filtered = existing.filter(
    (e) => e.query.toLowerCase() !== trimmed.toLowerCase()
  );

  const newEntry: SearchHistoryEntry = {
    query: trimmed,
    savedAt: new Date().toISOString(),
  };

  const updated = [newEntry, ...filtered].slice(0, MAX_HISTORY_ENTRIES);
  saveSearchHistory(updated);
  return updated;
}

/**
 * Remove a specific entry from the search history by its query string.
 * Returns the updated entries list.
 */
export function removeSearchHistoryEntry(query: string): SearchHistoryEntry[] {
  const existing = getSearchHistory();
  const updated = existing.filter(
    (e) => e.query.toLowerCase() !== query.toLowerCase()
  );
  saveSearchHistory(updated);
  return updated;
}

/**
 * Clear all search history entries.
 * Returns an empty array.
 */
export function clearSearchHistory(): SearchHistoryEntry[] {
  saveSearchHistory([]);
  return [];
}

/**
 * Whether search history should be synced to the signed-in user's account (when supported).
 * Stored locally so the UI can keep the setting even when offline.
 */
export function getSearchHistorySyncEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(SEARCH_HISTORY_SYNC_ENABLED_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

export function setSearchHistorySyncEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SEARCH_HISTORY_SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore localStorage errors
  }
}

