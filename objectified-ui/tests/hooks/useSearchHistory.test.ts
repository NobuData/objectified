/**
 * Unit tests for useSearchHistory React hook. GitHub #86.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSearchHistory } from '@/app/hooks/useSearchHistory';
import { getMe, updateMe, RestApiError } from '@lib/api/rest-client';
import { getSearchHistorySyncEnabled, setSearchHistorySyncEnabled } from '@lib/studio/searchHistory';

// Actual module used to build RestApiError instances in tests.
const { RestApiError: ActualRestApiError } = jest.requireActual<{ RestApiError: typeof RestApiError }>('@lib/api/rest-client');

jest.mock('@lib/api/rest-client', () => ({
  getMe: jest.fn(),
  updateMe: jest.fn(),
  isRestApiError: (e: unknown) => e instanceof (jest.requireActual('@lib/api/rest-client') as { RestApiError: typeof RestApiError }).RestApiError,
  RestApiError: (jest.requireActual('@lib/api/rest-client') as { RestApiError: typeof RestApiError }).RestApiError,
}));

const mockGetMe = getMe as jest.MockedFunction<typeof getMe>;
const mockUpdateMe = updateMe as jest.MockedFunction<typeof updateMe>;

/** Resolved value type for `getMe`. */
type GetMeResult = Awaited<ReturnType<typeof getMe>>;

describe('useSearchHistory', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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

  describe('syncEnabled', () => {
    it('defaults to false', () => {
      const { result } = renderHook(() => useSearchHistory());
      expect(result.current.syncEnabled).toBe(false);
    });

    it('setSyncEnabled(true) persists the setting to localStorage', () => {
      const { result } = renderHook(() => useSearchHistory());
      act(() => {
        result.current.setSyncEnabled(true);
      });
      expect(result.current.syncEnabled).toBe(true);
      expect(getSearchHistorySyncEnabled()).toBe(true);
    });

    it('setSyncEnabled(false) persists the setting to localStorage', () => {
      setSearchHistorySyncEnabled(true);
      const { result } = renderHook(() => useSearchHistory());
      act(() => {
        result.current.setSyncEnabled(false);
      });
      expect(result.current.syncEnabled).toBe(false);
      expect(getSearchHistorySyncEnabled()).toBe(false);
    });

    it('merges remote history into local on enable', async () => {
      // Seed local history
      localStorage.setItem(
        'objectified:canvas:searchHistory',
        JSON.stringify({
          entries: [{ query: 'local-query', savedAt: '2026-01-01T00:00:00.000Z' }],
        })
      );
      // Mock remote history with an additional entry
      mockGetMe.mockResolvedValueOnce({
        metadata: {
          canvas_search_history_v1: {
            entries: [{ query: 'remote-query', savedAt: '2026-01-02T00:00:00.000Z' }],
          },
        },
      } as GetMeResult);

      const { result } = renderHook(() => useSearchHistory());
      act(() => {
        result.current.setSyncEnabled(true);
      });

      await waitFor(() => {
        // After merge, both entries should be present (remote first as it is newer)
        expect(result.current.entries.map((e) => e.query)).toContain('local-query');
        expect(result.current.entries.map((e) => e.query)).toContain('remote-query');
      });
    });

    it('auto-disables sync on 401 from fetchAccountHistory', async () => {
      mockGetMe.mockRejectedValueOnce(new ActualRestApiError('Unauthorized', 401));

      const { result } = renderHook(() => useSearchHistory());
      act(() => {
        result.current.setSyncEnabled(true);
      });

      await waitFor(() => {
        expect(result.current.syncEnabled).toBe(false);
      });
      expect(getSearchHistorySyncEnabled()).toBe(false);
    });

    it('auto-disables sync on 404 from fetchAccountHistory', async () => {
      mockGetMe.mockRejectedValueOnce(new ActualRestApiError('Not Found', 404));

      const { result } = renderHook(() => useSearchHistory());
      act(() => {
        result.current.setSyncEnabled(true);
      });

      await waitFor(() => {
        expect(result.current.syncEnabled).toBe(false);
      });
    });

    it('auto-disables sync on 401 during save', async () => {
      // First call is fetchAccountHistory (getMe returns empty remote), second is save (getMe throws 401)
      mockGetMe
        .mockResolvedValueOnce({ metadata: {} } as GetMeResult)
        .mockRejectedValueOnce(new ActualRestApiError('Unauthorized', 401));

      const { result } = renderHook(() => useSearchHistory());
      act(() => {
        result.current.setSyncEnabled(true);
      });

      // Wait for hydration to complete
      await waitFor(() => {
        expect(mockGetMe).toHaveBeenCalledTimes(1);
      });

      // Add an entry to trigger the debounced save
      act(() => {
        result.current.addEntry('trigger-save');
      });

      // Advance timers to fire the debounce
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.syncEnabled).toBe(false);
      });
    });

    it('does not save to account before hydration completes', async () => {
      // Make fetch take a long time so hydration has not completed when addEntry is called
      let resolveFetch!: (v: GetMeResult) => void;
      mockGetMe.mockImplementationOnce(
        () => new Promise<GetMeResult>((res) => { resolveFetch = res; })
      );

      const { result } = renderHook(() => useSearchHistory());
      act(() => {
        result.current.setSyncEnabled(true);
      });

      // Add an entry before fetch resolves — save should not be scheduled
      act(() => {
        result.current.addEntry('pre-hydration-query');
      });

      // Advance timers to confirm the debounce fires if scheduled (it shouldn't)
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(mockUpdateMe).not.toHaveBeenCalled();

      // Now resolve the fetch; after that saves should proceed
      mockGetMe.mockResolvedValueOnce({ metadata: {} } as GetMeResult);
      await act(async () => {
        resolveFetch({ metadata: {} } as GetMeResult);
      });
    });
  });
});

