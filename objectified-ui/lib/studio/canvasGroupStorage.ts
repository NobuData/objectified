/**
 * Canvas group persistence helpers.
 * Saves and restores group definitions (position, dimensions, style) to localStorage
 * so groups survive page refreshes. Groups are not yet sent to the server.
 *
 * Reference: GitHub #83 — Add ability to create groups in the react-flow canvas.
 */

import type { StudioGroup } from './types';

const CANVAS_GROUPS_KEY_PREFIX = 'objectified:canvas:groups:';

export interface GroupCanvasMetadata {
  position?: { x: number; y: number };
  dimensions?: { width?: number; height?: number };
  style?: Record<string, string | number>;
}

interface CanvasGroupsStorage {
  groups: StudioGroup[];
  savedAt: string;
}

function storageKey(versionId: string): string {
  return `${CANVAS_GROUPS_KEY_PREFIX}${versionId}`;
}

/**
 * Persist canvas groups to localStorage.
 */
export function saveCanvasGroups(
  versionId: string,
  groups: StudioGroup[]
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const data: CanvasGroupsStorage = {
      groups,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey(versionId), JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Retrieve saved canvas groups for a version. Returns empty array if none or on error.
 */
export function getCanvasGroups(versionId: string): StudioGroup[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(storageKey(versionId));
    if (!raw) return [];
    const data = JSON.parse(raw) as CanvasGroupsStorage;
    return data.groups ?? [];
  } catch {
    return [];
  }
}
