/**
 * Unit tests for class-node config persistence (expand/collapse, theme).
 * Reference: GitHub #80 — Class-node properties and themes
 */

import {
  getAllClassNodeConfigs,
  getClassNodeConfig,
  saveClassNodeConfig,
  type ClassNodeConfig,
} from '@lib/studio/canvasClassNodeConfig';

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
const _originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  global,
  'localStorage'
);
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

const VERSION_ID = 'version-1';

describe('getAllClassNodeConfigs', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('returns empty object when nothing is stored', () => {
    const result = getAllClassNodeConfigs(VERSION_ID);
    expect(result).toEqual({});
  });

  it('returns stored configs for the version', () => {
    const configs: Record<string, ClassNodeConfig> = {
      'class-1': { propertiesExpanded: false },
      'class-2': { propertiesExpanded: true, theme: { backgroundColor: '#fff' } },
    };
    localStorageMock.setItem(
      'objectified:canvas:class-node-config:' + VERSION_ID,
      JSON.stringify({ configs, savedAt: new Date().toISOString() })
    );
    const result = getAllClassNodeConfigs(VERSION_ID);
    expect(result).toEqual(configs);
  });
});

describe('getClassNodeConfig', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('returns default config when nothing is stored', () => {
    const result = getClassNodeConfig(VERSION_ID, 'class-a');
    expect(result).toEqual({ propertiesExpanded: true });
  });

  it('returns merged config when stored', () => {
    const configs: Record<string, ClassNodeConfig> = {
      'class-a': { propertiesExpanded: false, theme: { border: '#000' } },
    };
    localStorageMock.setItem(
      'objectified:canvas:class-node-config:' + VERSION_ID,
      JSON.stringify({ configs, savedAt: new Date().toISOString() })
    );
    const result = getClassNodeConfig(VERSION_ID, 'class-a');
    expect(result.propertiesExpanded).toBe(false);
    expect(result.theme?.border).toBe('#000');
  });
});

describe('saveClassNodeConfig', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('persists config to localStorage', () => {
    saveClassNodeConfig(VERSION_ID, 'class-1', {
      propertiesExpanded: false,
      theme: { backgroundColor: '#eee' },
    });
    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    const [key, value] = localStorageMock.setItem.mock.calls[0];
    expect(key).toBe('objectified:canvas:class-node-config:' + VERSION_ID);
    const parsed = JSON.parse(value);
    expect(parsed.configs['class-1'].propertiesExpanded).toBe(false);
    expect(parsed.configs['class-1'].theme?.backgroundColor).toBe('#eee');
  });

  it('merges with existing configs for the same version', () => {
    localStorageMock.setItem(
      'objectified:canvas:class-node-config:' + VERSION_ID,
      JSON.stringify({
        configs: { 'class-a': { propertiesExpanded: true } },
        savedAt: new Date().toISOString(),
      })
    );
    saveClassNodeConfig(VERSION_ID, 'class-b', { propertiesExpanded: false });
    const lastCall = localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1];
    const raw = lastCall[1];
    const parsed = JSON.parse(raw);
    expect(parsed.configs['class-a'].propertiesExpanded).toBe(true);
    expect(parsed.configs['class-b'].propertiesExpanded).toBe(false);
  });
});
