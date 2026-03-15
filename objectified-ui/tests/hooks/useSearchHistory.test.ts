/**
 * Unit tests for useSearchHistory React hook. GitHub #86.
 */

import { renderHook, act } from '@testing-library/react';
import { useSearchHistory } from '@/app/hooks/useSearchHistory';

describe('useSearchHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with empty entries when localStorage is empty', () => {
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.entries).toEqual([]);
  });

  it('addEntry adds a query and updates entries', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addEntry('test query');
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].query).toBe('test query');
  });

  it('addEntry ignores blank queries', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addEntry('   ');
    });
    expect(result.current.entries).toEqual([]);
  });

  it('addEntry deduplicates (case-insensitive) and moves to front', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addEntry('alpha');
    });
    act(() => {
      result.current.addEntry('beta');
    });
    act(() => {
      result.current.addEntry('ALPHA');
    });
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0].query).toBe('ALPHA');
    expect(result.current.entries[1].query).toBe('beta');
  });

  it('removeEntry removes a specific entry by query', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addEntry('keep');
    });
    act(() => {
      result.current.addEntry('remove-me');
    });
    act(() => {
      result.current.removeEntry('remove-me');
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].query).toBe('keep');
  });

  it('clearAll empties the history', () => {
    const { result } = renderHook(() => useSearchHistory());
    act(() => {
      result.current.addEntry('a');
    });
    act(() => {
      result.current.addEntry('b');
    });
    act(() => {
      result.current.clearAll();
    });
    expect(result.current.entries).toEqual([]);
  });

  it('refresh re-reads entries from localStorage', () => {
    const { result } = renderHook(() => useSearchHistory());
    // Write directly to localStorage (simulating external changes)
    localStorage.setItem(
      'objectified:canvas:searchHistory',
      JSON.stringify({
        entries: [{ query: 'external', savedAt: '2026-01-01T00:00:00.000Z' }],
      })
    );
    act(() => {
      result.current.refresh();
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].query).toBe('external');
  });
});

