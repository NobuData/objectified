/**
 * Unit tests for canvas search history localStorage persistence. GitHub #86.
 */

import {
  getSearchHistory,
  addSearchHistoryEntry,
  removeSearchHistoryEntry,
  clearSearchHistory,
  getSearchHistorySyncEnabled,
  setSearchHistorySyncEnabled,
  MAX_HISTORY_ENTRIES,
  type SearchHistoryEntry,
} from '@lib/studio/searchHistory';

describe('searchHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getSearchHistory', () => {
    it('returns empty array when nothing stored', () => {
      expect(getSearchHistory()).toEqual([]);
    });

    it('returns empty array on invalid JSON', () => {
      localStorage.setItem('objectified:canvas:searchHistory', 'not-json');
      expect(getSearchHistory()).toEqual([]);
    });

    it('returns empty array when entries is not an array', () => {
      localStorage.setItem(
        'objectified:canvas:searchHistory',
        JSON.stringify({ entries: 'not-array' })
      );
      expect(getSearchHistory()).toEqual([]);
    });

    it('returns stored entries', () => {
      const entries: SearchHistoryEntry[] = [
        { query: 'foo', savedAt: '2026-01-01T00:00:00.000Z' },
        { query: 'bar', savedAt: '2026-01-01T00:01:00.000Z' },
      ];
      localStorage.setItem(
        'objectified:canvas:searchHistory',
        JSON.stringify({ entries })
      );
      expect(getSearchHistory()).toEqual(entries);
    });

    it('filters out entries with non-string query or savedAt fields', () => {
      const raw = JSON.stringify({
        entries: [
          { query: 'valid', savedAt: '2026-01-01T00:00:00.000Z' },
          { query: 123, savedAt: '2026-01-01T00:01:00.000Z' },
          { query: 'also-valid', savedAt: '2026-01-01T00:02:00.000Z' },
          { query: null, savedAt: '2026-01-01T00:03:00.000Z' },
          { savedAt: '2026-01-01T00:04:00.000Z' },
        ],
      });
      localStorage.setItem('objectified:canvas:searchHistory', raw);
      const result = getSearchHistory();
      expect(result).toHaveLength(2);
      expect(result[0].query).toBe('valid');
      expect(result[1].query).toBe('also-valid');
    });
  });

  describe('addSearchHistoryEntry', () => {
    it('adds a new entry to an empty history', () => {
      const result = addSearchHistoryEntry('hello');
      expect(result).toHaveLength(1);
      expect(result[0].query).toBe('hello');
      expect(result[0].savedAt).toBeTruthy();
    });

    it('ignores blank/whitespace-only queries', () => {
      const result = addSearchHistoryEntry('   ');
      expect(result).toEqual([]);
    });

    it('trims the query before storing', () => {
      const result = addSearchHistoryEntry('  hello  ');
      expect(result[0].query).toBe('hello');
    });

    it('moves duplicate queries to the front (case-insensitive)', () => {
      addSearchHistoryEntry('alpha');
      addSearchHistoryEntry('beta');
      const result = addSearchHistoryEntry('Alpha');
      expect(result).toHaveLength(2);
      expect(result[0].query).toBe('Alpha');
      expect(result[1].query).toBe('beta');
    });

    it('caps entries at MAX_HISTORY_ENTRIES', () => {
      for (let i = 0; i < MAX_HISTORY_ENTRIES + 10; i++) {
        addSearchHistoryEntry(`query-${i}`);
      }
      const result = getSearchHistory();
      expect(result).toHaveLength(MAX_HISTORY_ENTRIES);
      // Most recent should be first
      expect(result[0].query).toBe(`query-${MAX_HISTORY_ENTRIES + 9}`);
    });

    it('persists entries to localStorage', () => {
      addSearchHistoryEntry('persisted');
      const raw = localStorage.getItem('objectified:canvas:searchHistory');
      expect(raw).toBeTruthy();
      const data = JSON.parse(raw!);
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].query).toBe('persisted');
    });
  });

  describe('removeSearchHistoryEntry', () => {
    it('removes an entry by query (case-insensitive)', () => {
      addSearchHistoryEntry('alpha');
      addSearchHistoryEntry('beta');
      const result = removeSearchHistoryEntry('ALPHA');
      expect(result).toHaveLength(1);
      expect(result[0].query).toBe('beta');
    });

    it('returns empty array when removing last entry', () => {
      addSearchHistoryEntry('only');
      const result = removeSearchHistoryEntry('only');
      expect(result).toEqual([]);
    });

    it('is a no-op when query not found', () => {
      addSearchHistoryEntry('exists');
      const result = removeSearchHistoryEntry('missing');
      expect(result).toHaveLength(1);
      expect(result[0].query).toBe('exists');
    });
  });

  describe('clearSearchHistory', () => {
    it('clears all entries and returns empty array', () => {
      addSearchHistoryEntry('a');
      addSearchHistoryEntry('b');
      const result = clearSearchHistory();
      expect(result).toEqual([]);
      expect(getSearchHistory()).toEqual([]);
    });

    it('persists the cleared state to localStorage', () => {
      addSearchHistoryEntry('a');
      clearSearchHistory();
      const raw = localStorage.getItem('objectified:canvas:searchHistory');
      expect(raw).toBeTruthy();
      const data = JSON.parse(raw!);
      expect(data.entries).toEqual([]);
    });
  });

  describe('searchHistory sync setting', () => {
    it('defaults to false', () => {
      expect(getSearchHistorySyncEnabled()).toBe(false);
    });

    it('persists enabled=true', () => {
      setSearchHistorySyncEnabled(true);
      expect(localStorage.getItem('objectified:canvas:searchHistorySyncEnabled')).toBe('true');
      expect(getSearchHistorySyncEnabled()).toBe(true);
    });

    it('persists enabled=false', () => {
      setSearchHistorySyncEnabled(true);
      setSearchHistorySyncEnabled(false);
      expect(localStorage.getItem('objectified:canvas:searchHistorySyncEnabled')).toBe('false');
      expect(getSearchHistorySyncEnabled()).toBe(false);
    });
  });
});

