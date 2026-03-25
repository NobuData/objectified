/**
 * Reference: GitHub #230 — Per-version node theme preferences
 */

import {
  getCanvasVersionNodeThemePrefs,
  saveCanvasVersionNodeThemePrefs,
  DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS,
} from '@lib/studio/canvasVersionNodeTheme';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();
const _d = Object.getOwnPropertyDescriptor(global, 'localStorage');
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});
afterAll(() => {
  if (_d) Object.defineProperty(global, 'localStorage', _d);
});

describe('canvasVersionNodeTheme', () => {
  const vid = 'version-1';

  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('returns defaults when empty', () => {
    expect(getCanvasVersionNodeThemePrefs(vid)).toEqual(
      DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS
    );
  });

  it('round-trips save and get', () => {
    const next = {
      applyTagColorsToNodes: false,
      useTenantPrimaryAccent: true,
    };
    saveCanvasVersionNodeThemePrefs(vid, next);
    expect(getCanvasVersionNodeThemePrefs(vid)).toEqual(next);
  });
});
