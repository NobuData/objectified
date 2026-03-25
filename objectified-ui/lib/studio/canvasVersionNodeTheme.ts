/**
 * Per-version preferences for automatic class-node theming (tag colors, tenant accent).
 * Stored in localStorage so they survive refresh per schema version.
 *
 * Reference: GitHub #230 — Per-version node theming, tenant/tag colors
 */

import {
  DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS,
  type CanvasVersionNodeThemePrefs,
} from './canvasNodeThemeResolve';

const PREFIX = 'objectified:canvas:version-node-theme-prefs:';

export { DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS };

interface Stored {
  prefs: Partial<CanvasVersionNodeThemePrefs>;
  savedAt: string;
}

function storageKey(versionId: string): string {
  return `${PREFIX}${versionId}`;
}

export function getCanvasVersionNodeThemePrefs(
  versionId: string
): CanvasVersionNodeThemePrefs {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS };
    }
    const raw = localStorage.getItem(storageKey(versionId));
    if (!raw) return { ...DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS };
    const data = JSON.parse(raw) as Stored;
    return {
      ...DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS,
      ...data.prefs,
    };
  } catch {
    return { ...DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS };
  }
}

export function saveCanvasVersionNodeThemePrefs(
  versionId: string,
  prefs: CanvasVersionNodeThemePrefs
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const data: Stored = {
      prefs,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey(versionId), JSON.stringify(data));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('objectified:canvas-version-node-theme-changed', {
          detail: { versionId },
        })
      );
    }
  } catch {
    // Ignore localStorage errors
  }
}
