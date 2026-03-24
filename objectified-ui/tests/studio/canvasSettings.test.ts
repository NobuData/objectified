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
    expect(DEFAULT_CANVAS_SETTINGS.showMiniMapLegend).toBe(false);
    expect(DEFAULT_CANVAS_SETTINGS.viewportPersistence).toBe(true);
    expect(DEFAULT_CANVAS_SETTINGS.showLayoutHints).toBe(false);
    expect(DEFAULT_CANVAS_SETTINGS.showDependencyOverlay).toBe(false);
    expect(DEFAULT_CANVAS_SETTINGS.showSchemaMetricsPanel).toBe(false);
    expect(DEFAULT_CANVAS_SETTINGS.gridSize).toBe(16);
    expect(DEFAULT_CANVAS_SETTINGS.gridStyle).toBe('dots');
    expect(DEFAULT_CANVAS_SETTINGS.snapToGrid).toBe(true);
    expect(DEFAULT_CANVAS_SETTINGS.edgePathType).toBe('smoothstep');
    expect(DEFAULT_CANVAS_SETTINGS.edgeStrokeColor).toBe('');
    expect(DEFAULT_CANVAS_SETTINGS.edgeAnimated).toBe(false);
    expect(DEFAULT_CANVAS_SETTINGS.simplifiedNodeView).toBe(false);
    expect(DEFAULT_CANVAS_SETTINGS.highContrastCanvas).toBe(false);
    expect(DEFAULT_CANVAS_SETTINGS.reducedMotion).toBe(false);
    expect(DEFAULT_CANVAS_SETTINGS.persistUndoStackInSession).toBe(false);
    expect(DEFAULT_CANVAS_SETTINGS.maxUndoDepth).toBe(50);
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
    // Intentionally omit the new fields (gridSize, gridStyle, snapToGrid,
    // edgePathType, edgeStrokeColor, edgeAnimated) to validate that
    // getCanvasSettings() correctly back-fills them from DEFAULT_CANVAS_SETTINGS.
    const stored = {
      showBackground: false,
      showControls: false,
      showMiniMap: true,
      viewportPersistence: false,
      showLayoutHints: true,
      showDependencyOverlay: false,
      showSchemaMetricsPanel: false,
      persistUndoStackInSession: true,
    };
    localStorageMock.setItem('objectified:canvas:settings', JSON.stringify({ settings: stored, savedAt: new Date().toISOString() }));
    const result = getCanvasSettings();
    expect(result.showBackground).toBe(false);
    expect(result.showControls).toBe(false);
    expect(result.showMiniMap).toBe(true);
    expect(result.viewportPersistence).toBe(false);
    expect(result.showLayoutHints).toBe(true);
    expect(result.showDependencyOverlay).toBe(false);
    expect(result.showSchemaMetricsPanel).toBe(false);
    expect(result.persistUndoStackInSession).toBe(true);
    // New fields should be filled from DEFAULT_CANVAS_SETTINGS
    expect(result.gridSize).toBe(DEFAULT_CANVAS_SETTINGS.gridSize);
    expect(result.gridStyle).toBe(DEFAULT_CANVAS_SETTINGS.gridStyle);
    expect(result.snapToGrid).toBe(DEFAULT_CANVAS_SETTINGS.snapToGrid);
    expect(result.edgePathType).toBe(DEFAULT_CANVAS_SETTINGS.edgePathType);
    expect(result.edgeStrokeColor).toBe(DEFAULT_CANVAS_SETTINGS.edgeStrokeColor);
    expect(result.edgeAnimated).toBe(DEFAULT_CANVAS_SETTINGS.edgeAnimated);
    expect(result.simplifiedNodeView).toBe(DEFAULT_CANVAS_SETTINGS.simplifiedNodeView);
    expect(result.highContrastCanvas).toBe(DEFAULT_CANVAS_SETTINGS.highContrastCanvas);
    expect(result.reducedMotion).toBe(DEFAULT_CANVAS_SETTINGS.reducedMotion);
    expect(result.maxUndoDepth).toBe(DEFAULT_CANVAS_SETTINGS.maxUndoDepth);
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
    expect(result.showSchemaMetricsPanel).toBe(DEFAULT_CANVAS_SETTINGS.showSchemaMetricsPanel);
    expect(result.persistUndoStackInSession).toBe(
      DEFAULT_CANVAS_SETTINGS.persistUndoStackInSession
    );
    expect(result.maxUndoDepth).toBe(DEFAULT_CANVAS_SETTINGS.maxUndoDepth);
  });

  it('sanitizes invalid maxUndoDepth values to the default', () => {
    localStorageMock.setItem(
      'objectified:canvas:settings',
      JSON.stringify({
        settings: { maxUndoDepth: 0, persistUndoStackInSession: true },
        savedAt: new Date().toISOString(),
      })
    );
    const result = getCanvasSettings();
    expect(result.persistUndoStackInSession).toBe(true);
    expect(result.maxUndoDepth).toBe(DEFAULT_CANVAS_SETTINGS.maxUndoDepth);
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
      ...DEFAULT_CANVAS_SETTINGS,
      showBackground: false,
      showControls: true,
      showMiniMap: false,
      viewportPersistence: true,
      showLayoutHints: false,
      showDependencyOverlay: false,
      showSchemaMetricsPanel: false,
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
      ...DEFAULT_CANVAS_SETTINGS,
      showBackground: false,
      showControls: false,
      showMiniMap: false,
      viewportPersistence: false,
      showLayoutHints: true,
      showDependencyOverlay: true,
      showSchemaMetricsPanel: true,
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


