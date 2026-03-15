/**
 * Unit tests for canvas settings persistence helpers.
 * Reference: GitHub #77 — Configure react-flow canvas properly
 */

import {
  getCanvasSettings,
  saveCanvasSettings,
  DEFAULT_CANVAS_SETTINGS,
  type CanvasSettings,
} from '@lib/studio/canvasSettings';

// ─── localStorage mock ────────────────────────────────────────────────────────
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
const _originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(global, 'localStorage');
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});
afterAll(() => {
  if (_originalLocalStorageDescriptor) {
    Object.defineProperty(global, 'localStorage', _originalLocalStorageDescriptor);
  }
});
// ─────────────────────────────────────────────────────────────────────────────

describe('DEFAULT_CANVAS_SETTINGS', () => {
  it('has all expected fields', () => {
    expect(DEFAULT_CANVAS_SETTINGS.showBackground).toBe(true);
    expect(DEFAULT_CANVAS_SETTINGS.showControls).toBe(true);
    expect(DEFAULT_CANVAS_SETTINGS.showMiniMap).toBe(true);
    expect(DEFAULT_CANVAS_SETTINGS.viewportPersistence).toBe(true);
    expect(DEFAULT_CANVAS_SETTINGS.showLayoutHints).toBe(false);
    expect(DEFAULT_CANVAS_SETTINGS.showDependencyOverlay).toBe(false);
  });
});

describe('getCanvasSettings', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('returns defaults when nothing is stored', () => {
    const result = getCanvasSettings();
    expect(result).toEqual(DEFAULT_CANVAS_SETTINGS);
  });

  it('returns stored settings merged with defaults', () => {
    const stored: CanvasSettings = {
      showBackground: false,
      showControls: false,
      showMiniMap: true,
      viewportPersistence: false,
      showLayoutHints: true,
      showDependencyOverlay: false,
    };
    localStorageMock.setItem('objectified:canvas:settings', JSON.stringify({ settings: stored, savedAt: new Date().toISOString() }));
    const result = getCanvasSettings();
    expect(result).toEqual(stored);
  });

  it('merges partial stored settings with defaults', () => {
    // Only override some keys; missing keys should fall back to defaults
    localStorageMock.setItem(
      'objectified:canvas:settings',
      JSON.stringify({ settings: { showBackground: false }, savedAt: new Date().toISOString() })
    );
    const result = getCanvasSettings();
    expect(result.showBackground).toBe(false);
    expect(result.showControls).toBe(DEFAULT_CANVAS_SETTINGS.showControls);
    expect(result.showMiniMap).toBe(DEFAULT_CANVAS_SETTINGS.showMiniMap);
    expect(result.viewportPersistence).toBe(DEFAULT_CANVAS_SETTINGS.viewportPersistence);
    expect(result.showLayoutHints).toBe(DEFAULT_CANVAS_SETTINGS.showLayoutHints);
    expect(result.showDependencyOverlay).toBe(DEFAULT_CANVAS_SETTINGS.showDependencyOverlay);
  });

  it('returns defaults when stored value is invalid JSON', () => {
    localStorageMock.getItem.mockReturnValueOnce('not-json');
    const result = getCanvasSettings();
    expect(result).toEqual(DEFAULT_CANVAS_SETTINGS);
  });

  it('returns defaults when stored value has no settings field', () => {
    localStorageMock.setItem(
      'objectified:canvas:settings',
      JSON.stringify({ savedAt: new Date().toISOString() })
    );
    const result = getCanvasSettings();
    expect(result).toEqual(DEFAULT_CANVAS_SETTINGS);
  });

  it('returns defaults when stored value is an empty object', () => {
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({}));
    const result = getCanvasSettings();
    expect(result).toEqual(DEFAULT_CANVAS_SETTINGS);
  });

  it('returns defaults when localStorage throws on read', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });
    const result = getCanvasSettings();
    expect(result).toEqual(DEFAULT_CANVAS_SETTINGS);
  });
});

describe('saveCanvasSettings', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('persists settings to localStorage', () => {
    const settings: CanvasSettings = {
      showBackground: false,
      showControls: true,
      showMiniMap: false,
      viewportPersistence: true,
      showLayoutHints: false,
      showDependencyOverlay: false,
    };
    saveCanvasSettings(settings);
    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    const [key, value] = localStorageMock.setItem.mock.calls[0];
    expect(key).toBe('objectified:canvas:settings');
    const parsed = JSON.parse(value);
    expect(parsed.settings).toEqual(settings);
    expect(typeof parsed.savedAt).toBe('string');
  });

  it('round-trips save and get', () => {
    const settings: CanvasSettings = {
      showBackground: false,
      showControls: false,
      showMiniMap: false,
      viewportPersistence: false,
      showLayoutHints: true,
      showDependencyOverlay: true,
    };
    saveCanvasSettings(settings);
    expect(getCanvasSettings()).toEqual(settings);
  });

  it('does not throw when localStorage throws on write', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() =>
      saveCanvasSettings(DEFAULT_CANVAS_SETTINGS)
    ).not.toThrow();
  });

  it('overwrites previously saved settings', () => {
    const first: CanvasSettings = { ...DEFAULT_CANVAS_SETTINGS, showBackground: false };
    const second: CanvasSettings = { ...DEFAULT_CANVAS_SETTINGS, showMiniMap: false };
    saveCanvasSettings(first);
    saveCanvasSettings(second);
    expect(getCanvasSettings()).toEqual(second);
  });
});
