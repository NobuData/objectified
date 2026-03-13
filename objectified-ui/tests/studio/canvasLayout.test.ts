/**
 * Unit tests for canvas layout persistence helpers.
 * Reference: GitHub #63 — saveDefaultCanvasLayout / getDefaultCanvasLayout
 */

import {
  saveDefaultCanvasLayout,
  getDefaultCanvasLayout,
  canvasLayoutStorageKey,
  type ClassPositionEntry,
} from '@lib/studio/canvasLayout';

const VERSION_ID = 'version-abc-123';

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

describe('canvasLayoutStorageKey', () => {
  it('returns a predictable key for a versionId', () => {
    const key = canvasLayoutStorageKey(VERSION_ID);
    expect(key).toContain(VERSION_ID);
    expect(key).toMatch(/objectified:canvas:layout:/);
  });
});

describe('saveDefaultCanvasLayout', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('saves positions to localStorage', () => {
    const positions: ClassPositionEntry[] = [
      { classId: 'c1', position: { x: 10, y: 20 } },
      { classId: 'c2', position: { x: 100, y: 200 } },
    ];
    saveDefaultCanvasLayout(VERSION_ID, positions);
    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    const [key, value] = localStorageMock.setItem.mock.calls[0];
    expect(key).toBe(canvasLayoutStorageKey(VERSION_ID));
    const parsed = JSON.parse(value);
    expect(parsed.positions).toEqual(positions);
    expect(typeof parsed.savedAt).toBe('string');
  });

  it('saves an empty array without throwing', () => {
    expect(() => saveDefaultCanvasLayout(VERSION_ID, [])).not.toThrow();
    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
  });

  it('does not throw when localStorage throws', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() =>
      saveDefaultCanvasLayout(VERSION_ID, [{ classId: 'c1', position: { x: 0, y: 0 } }])
    ).not.toThrow();
  });
});

describe('getDefaultCanvasLayout', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('returns an empty array when nothing is saved', () => {
    const result = getDefaultCanvasLayout(VERSION_ID);
    expect(result).toEqual([]);
  });

  it('returns saved positions', () => {
    const positions: ClassPositionEntry[] = [
      { classId: 'c1', position: { x: 10, y: 20 } },
      { classId: 'c2', position: { x: 50, y: 75 } },
    ];
    saveDefaultCanvasLayout(VERSION_ID, positions);
    const result = getDefaultCanvasLayout(VERSION_ID);
    expect(result).toEqual(positions);
  });

  it('returns an empty array when stored value is invalid JSON', () => {
    localStorageMock.getItem.mockReturnValueOnce('not-json');
    const result = getDefaultCanvasLayout(VERSION_ID);
    expect(result).toEqual([]);
  });

  it('returns an empty array when stored value has no positions field', () => {
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ savedAt: new Date().toISOString() }));
    const result = getDefaultCanvasLayout(VERSION_ID);
    expect(result).toEqual([]);
  });

  it('round-trips save and get for multiple versions independently', () => {
    const v1Positions: ClassPositionEntry[] = [{ classId: 'a', position: { x: 1, y: 2 } }];
    const v2Positions: ClassPositionEntry[] = [{ classId: 'b', position: { x: 3, y: 4 } }];

    saveDefaultCanvasLayout('v1', v1Positions);
    saveDefaultCanvasLayout('v2', v2Positions);

    expect(getDefaultCanvasLayout('v1')).toEqual(v1Positions);
    expect(getDefaultCanvasLayout('v2')).toEqual(v2Positions);
  });
});

