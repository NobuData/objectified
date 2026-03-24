import { renderHook, act } from '@testing-library/react';
import { useMobileNavViewport } from '@/app/dashboard/hooks/useMobileNavViewport';

describe('useMobileNavViewport', () => {
  let mobileMatches = false;
  const changeListeners: Array<() => void> = [];

  beforeEach(() => {
    mobileMatches = false;
    changeListeners.length = 0;
    window.matchMedia = jest.fn().mockImplementation((query: string) => {
      const isMobileQuery = query === '(max-width: 767px)';
      return {
        get matches() {
          return isMobileQuery ? mobileMatches : false;
        },
        media: query,
        addEventListener: (_event: string, cb: EventListener) => {
          if (isMobileQuery) changeListeners.push(cb as () => void);
        },
        removeEventListener: (_event: string, cb: EventListener) => {
          if (!isMobileQuery) return;
          const i = changeListeners.indexOf(cb as () => void);
          if (i !== -1) changeListeners.splice(i, 1);
        },
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      };
    }) as unknown as typeof window.matchMedia;
  });

  it('returns false when (max-width: 767px) does not match', () => {
    mobileMatches = false;
    const { result } = renderHook(() => useMobileNavViewport());
    expect(result.current).toBe(false);
  });

  it('returns true when (max-width: 767px) matches', () => {
    mobileMatches = true;
    const { result } = renderHook(() => useMobileNavViewport());
    expect(result.current).toBe(true);
  });

  it('updates when the media query changes', () => {
    mobileMatches = false;
    const { result } = renderHook(() => useMobileNavViewport());
    expect(result.current).toBe(false);

    act(() => {
      mobileMatches = true;
      changeListeners.forEach((fn) => fn());
    });
    expect(result.current).toBe(true);
  });
});
