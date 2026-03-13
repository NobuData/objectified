/**
 * Canvas layout persistence helpers.
 *
 * Saves and restores node positions to localStorage so positions survive
 * page refreshes before the user commits changes to the server.
 *
 * Reference: GitHub #63 — saveDefaultCanvasLayout / getDefaultCanvasLayout pattern
 */

const CANVAS_LAYOUT_KEY_PREFIX = 'objectified:canvas:layout:';

export interface ClassPositionEntry {
  classId: string;
  position: { x: number; y: number };
}

interface CanvasLayoutStorage {
  positions: ClassPositionEntry[];
  savedAt: string;
}

/** Returns the localStorage key for a given versionId. */
export function canvasLayoutStorageKey(versionId: string): string {
  return `${CANVAS_LAYOUT_KEY_PREFIX}${versionId}`;
}

/**
 * Persist canvas node positions to localStorage so they survive page refreshes.
 * Called whenever a class node is dragged to a new position.
 */
export function saveDefaultCanvasLayout(
  versionId: string,
  positions: ClassPositionEntry[]
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const data: CanvasLayoutStorage = {
      positions,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(canvasLayoutStorageKey(versionId), JSON.stringify(data));
  } catch {
    // Ignore localStorage errors (quota exceeded, SSR, private browsing, etc.)
  }
}

/**
 * Retrieve previously saved canvas node positions from localStorage.
 * Returns an empty array if nothing has been saved or on any error.
 */
export function getDefaultCanvasLayout(versionId: string): ClassPositionEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(canvasLayoutStorageKey(versionId));
    if (!raw) return [];
    const data = JSON.parse(raw) as CanvasLayoutStorage;
    return data.positions ?? [];
  } catch {
    return [];
  }
}

