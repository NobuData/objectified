/**
 * Unit tests for code generation template persistence helpers.
 * Reference: GitHub #119 — configurable code generation templates.
 */

import {
  loadCustomCodegenTemplates,
  upsertCustomCodegenTemplate,
  deleteCustomCodegenTemplate,
} from '@lib/studio/codeGenerationStorage';

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

beforeEach(() => {
  localStorageMock.clear();
  jest.clearAllMocks();
});

describe('loadCustomCodegenTemplates guard — requires all three IDs', () => {
  it('returns [] when tenantId is empty', () => {
    const result = loadCustomCodegenTemplates('', 'proj-1', 'ver-1');
    expect(result).toEqual([]);
    expect(localStorageMock.getItem).not.toHaveBeenCalled();
  });

  it('returns [] when projectId is empty', () => {
    const result = loadCustomCodegenTemplates('tenant-1', '', 'ver-1');
    expect(result).toEqual([]);
    expect(localStorageMock.getItem).not.toHaveBeenCalled();
  });

  it('returns [] when versionId is empty', () => {
    const result = loadCustomCodegenTemplates('tenant-1', 'proj-1', '');
    expect(result).toEqual([]);
    expect(localStorageMock.getItem).not.toHaveBeenCalled();
  });

  it('reads from storage when all IDs are provided', () => {
    const result = loadCustomCodegenTemplates('tenant-1', 'proj-1', 'ver-1');
    expect(result).toEqual([]);
    expect(localStorageMock.getItem).toHaveBeenCalledTimes(1);
  });
});

describe('upsertCustomCodegenTemplate', () => {
  it('saves and retrieves a template', () => {
    const saved = upsertCustomCodegenTemplate('t', 'p', 'v', {
      name: 'My Template',
      body: '{{#classes}}{{name}}{{/classes}}',
    });
    expect(saved.name).toBe('My Template');
    expect(saved.id).toBeTruthy();

    const loaded = loadCustomCodegenTemplates('t', 'p', 'v');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('My Template');
  });

  it('is scoped per tenant+project+version — different scope returns empty', () => {
    upsertCustomCodegenTemplate('t', 'p', 'v1', {
      name: 'Template A',
      body: 'body A',
    });
    const otherScope = loadCustomCodegenTemplates('t', 'p', 'v2');
    expect(otherScope).toHaveLength(0);
  });

  it('does not save when any ID is missing', () => {
    upsertCustomCodegenTemplate('', 'p', 'v', { name: 'X', body: 'y' });
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });
});

describe('deleteCustomCodegenTemplate', () => {
  it('removes the specified template', () => {
    const saved = upsertCustomCodegenTemplate('t', 'p', 'v', { name: 'To Delete', body: '' });
    deleteCustomCodegenTemplate('t', 'p', 'v', saved.id);
    expect(loadCustomCodegenTemplates('t', 'p', 'v')).toHaveLength(0);
  });
});
