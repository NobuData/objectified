/**
 * Unit tests for state backup persistence helpers.
 * Reference: GitHub #65 — localStorage backup keyed by versionId; clear on push.
 */

import {
  backupStorageKey,
  computeStateChecksum,
  saveStateBackup,
  loadStateBackup,
  loadStateBackupWithDiagnostics,
  clearStateBackup,
} from '@lib/studio/stateBackup';
import type { LocalVersionState } from '@lib/studio/types';

const VERSION_ID = 'version-abc-123';

function makeState(overrides: Partial<LocalVersionState> = {}): LocalVersionState {
  return {
    versionId: VERSION_ID,
    revision: 1,
    classes: [],
    properties: [],
    canvas_metadata: null,
    groups: [],
    ...overrides,
  };
}

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

describe('backupStorageKey', () => {
  it('returns a predictable key for a versionId', () => {
    const key = backupStorageKey(VERSION_ID);
    expect(key).toContain(VERSION_ID);
    expect(key).toMatch(/objectified:studio:backup:/);
  });

  it('produces different keys for different versionIds', () => {
    expect(backupStorageKey('v1')).not.toBe(backupStorageKey('v2'));
  });
});

describe('saveStateBackup', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('saves state to localStorage', () => {
    const state = makeState();
    saveStateBackup(state);
    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    const [key, value] = localStorageMock.setItem.mock.calls[0];
    expect(key).toBe(backupStorageKey(VERSION_ID));
    const parsed = JSON.parse(value);
    expect(parsed.formatVersion).toBe(2);
    expect(typeof parsed.checksum).toBe('string');
    expect(parsed.state).toEqual(state);
    expect(typeof parsed.savedAt).toBe('string');
  });

  it('saves state with classes and properties', () => {
    const state = makeState({
      classes: [{ name: 'User', properties: [] }],
      properties: [{ id: 'p1', name: 'email' }],
    });
    saveStateBackup(state);
    const [, value] = localStorageMock.setItem.mock.calls[0];
    const parsed = JSON.parse(value);
    expect(parsed.state.classes).toHaveLength(1);
    expect(parsed.state.classes[0].name).toBe('User');
    expect(parsed.state.properties).toHaveLength(1);
  });

  it('does not throw when localStorage throws', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveStateBackup(makeState())).not.toThrow();
  });
});

describe('loadStateBackup', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('returns null when nothing is saved', () => {
    expect(loadStateBackup(VERSION_ID)).toBeNull();
  });

  it('returns saved state', () => {
    const state = makeState({ revision: 42 });
    saveStateBackup(state);
    const loaded = loadStateBackup(VERSION_ID);
    expect(loaded).toEqual(state);
  });

  it('returns null when stored value is invalid JSON', () => {
    localStorageMock.getItem.mockReturnValueOnce('not-json');
    expect(loadStateBackup(VERSION_ID)).toBeNull();
  });

  it('returns null when stored value has no state field', () => {
    localStorageMock.getItem.mockReturnValueOnce(
      JSON.stringify({ savedAt: new Date().toISOString() })
    );
    expect(loadStateBackup(VERSION_ID)).toBeNull();
  });

  it('round-trips save and load for multiple versions independently', () => {
    const s1 = makeState({ versionId: 'v1', revision: 1 });
    const s2 = makeState({ versionId: 'v2', revision: 2 });

    saveStateBackup(s1);
    saveStateBackup(s2);

    expect(loadStateBackup('v1')).toEqual(s1);
    expect(loadStateBackup('v2')).toEqual(s2);
  });

  it('returns null and warning when backup checksum is invalid', () => {
    const state = makeState({ revision: 11 });
    localStorageMock.getItem.mockReturnValueOnce(
      JSON.stringify({
        formatVersion: 2,
        checksum: 'deadbeef',
        savedAt: new Date().toISOString(),
        state,
      })
    );
    const loaded = loadStateBackupWithDiagnostics(VERSION_ID);
    expect(loaded.state).toBeNull();
    expect(loaded.status).toBe('corrupted');
    expect(loaded.warning).toContain('integrity');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(backupStorageKey(VERSION_ID));
  });

  it('returns null and warning when backup format is incompatible', () => {
    const state = makeState({ revision: 6 });
    localStorageMock.getItem.mockReturnValueOnce(
      JSON.stringify({
        formatVersion: 99,
        checksum: computeStateChecksum(state),
        savedAt: new Date().toISOString(),
        state,
      })
    );
    const loaded = loadStateBackupWithDiagnostics(VERSION_ID);
    expect(loaded.state).toBeNull();
    expect(loaded.status).toBe('incompatible');
    expect(loaded.warning).toContain('incompatible');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(backupStorageKey(VERSION_ID));
  });
});

describe('clearStateBackup', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('removes the backup from localStorage', () => {
    saveStateBackup(makeState());
    expect(loadStateBackup(VERSION_ID)).not.toBeNull();

    clearStateBackup(VERSION_ID);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(backupStorageKey(VERSION_ID));
  });

  it('does not throw when no backup exists', () => {
    expect(() => clearStateBackup(VERSION_ID)).not.toThrow();
  });

  it('does not throw when localStorage throws', () => {
    localStorageMock.removeItem.mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });
    expect(() => clearStateBackup(VERSION_ID)).not.toThrow();
  });

  it('does not affect other version backups', () => {
    const s1 = makeState({ versionId: 'v1' });
    const s2 = makeState({ versionId: 'v2' });
    saveStateBackup(s1);
    saveStateBackup(s2);

    clearStateBackup('v1');

    // v2 should still be present
    expect(loadStateBackup('v2')).toEqual(s2);
  });
});

