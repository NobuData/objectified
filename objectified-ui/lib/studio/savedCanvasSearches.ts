/**
 * Named saved canvas searches (full filter state). GitHub #241.
 * Persisted in localStorage similar to searchHistory.ts.
 */

import {
  normalizeCanvasSearchState,
  type CanvasSearchState,
} from './canvasSearch';

const STORAGE_KEY = 'objectified:canvas:savedSearches';
const MAX_SAVED = 40;

export interface SavedCanvasSearch {
  id: string;
  name: string;
  state: CanvasSearchState;
  savedAt: string;
}

interface Stored {
  version: 1;
  items: SavedCanvasSearch[];
}

function loadRaw(): Stored | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Stored;
    if (!data || data.version !== 1 || !Array.isArray(data.items)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveAll(items: SavedCanvasSearch[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const payload: Stored = { version: 1, items };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / privacy mode
  }
}

/**
 * Return saved searches (most recently saved first).
 */
export function getSavedCanvasSearches(): SavedCanvasSearch[] {
  const data = loadRaw();
  if (!data) return [];
  return data.items
    .filter(
      (x) =>
        x &&
        typeof x.id === 'string' &&
        typeof x.name === 'string' &&
        typeof x.savedAt === 'string' &&
        x.state &&
        typeof x.state === 'object'
    )
    .map((x) => ({
      id: x.id,
      name: x.name.trim() || 'Untitled',
      savedAt: x.savedAt,
      state: normalizeCanvasSearchState(x.state as Partial<CanvasSearchState>),
    }));
}

export function saveCanvasSearchPreset(name: string, state: CanvasSearchState): SavedCanvasSearch[] {
  const trimmed = name.trim();
  if (!trimmed) return getSavedCanvasSearches();

  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `saved-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const entry: SavedCanvasSearch = {
    id,
    name: trimmed,
    state: normalizeCanvasSearchState(state),
    savedAt: new Date().toISOString(),
  };

  const existing = getSavedCanvasSearches();
  const updated = [entry, ...existing].slice(0, MAX_SAVED);
  saveAll(updated);
  return updated;
}

export function removeSavedCanvasSearch(id: string): SavedCanvasSearch[] {
  const updated = getSavedCanvasSearches().filter((x) => x.id !== id);
  saveAll(updated);
  return updated;
}
