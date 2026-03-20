/**
 * Unit tests for useDashboardKeyboardShortcuts React hook. GitHub #186.
 */

import { renderHook } from '@testing-library/react';
import { useDashboardKeyboardShortcuts, OPEN_GLOBAL_SEARCH } from '@/app/dashboard/hooks/useDashboardKeyboardShortcuts';

function fireKeyDown(opts: Partial<KeyboardEvent> & { key: string }) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    ...opts,
  });
  window.dispatchEvent(event);
  return event;
}

describe('useDashboardKeyboardShortcuts', () => {
  let router: { push: jest.Mock };

  beforeEach(() => {
    router = { push: jest.fn() };
  });

  it('navigates to home on Alt+Shift+H', () => {
    renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    fireKeyDown({ key: 'h', altKey: true, shiftKey: true });
    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('navigates to dashboard on Alt+Shift+D', () => {
    renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    fireKeyDown({ key: 'd', altKey: true, shiftKey: true });
    expect(router.push).toHaveBeenCalledWith('/dashboard');
  });

  it('navigates to data-designer on Alt+Shift+E', () => {
    renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    fireKeyDown({ key: 'e', altKey: true, shiftKey: true });
    expect(router.push).toHaveBeenCalledWith('/data-designer');
  });

  it('dispatches open-global-search event on Alt+Shift+K', () => {
    renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    const listener = jest.fn();
    window.addEventListener(OPEN_GLOBAL_SEARCH, listener);
    fireKeyDown({ key: 'k', altKey: true, shiftKey: true });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_GLOBAL_SEARCH, listener);
  });

  it('calls onOpenMobileNav on Alt+Shift+M', () => {
    const onOpenMobileNav = jest.fn();
    renderHook(() => useDashboardKeyboardShortcuts(router, { onOpenMobileNav }));
    fireKeyDown({ key: 'm', altKey: true, shiftKey: true });
    expect(onOpenMobileNav).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when Alt is not held', () => {
    renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    fireKeyDown({ key: 'h', altKey: false, shiftKey: true });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('does not navigate when Shift is not held', () => {
    renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    fireKeyDown({ key: 'h', altKey: true, shiftKey: false });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('does not navigate when Ctrl is also held', () => {
    renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    fireKeyDown({ key: 'h', altKey: true, shiftKey: true, ctrlKey: true });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('does not navigate when Meta is also held', () => {
    renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    fireKeyDown({ key: 'h', altKey: true, shiftKey: true, metaKey: true });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('ignores repeated keydown events (keyboard held)', () => {
    renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    fireKeyDown({ key: 'h', altKey: true, shiftKey: true, repeat: true });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('removes the event listener on unmount', () => {
    const { unmount } = renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    unmount();
    fireKeyDown({ key: 'h', altKey: true, shiftKey: true });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('does not navigate for unknown shortcut keys', () => {
    renderHook(() => useDashboardKeyboardShortcuts(router, {}));
    fireKeyDown({ key: 'z', altKey: true, shiftKey: true });
    expect(router.push).not.toHaveBeenCalled();
  });
});
