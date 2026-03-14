/**
 * Canvas display settings (Background, Controls, MiniMap, viewport persistence).
 * Persisted to localStorage and applied to the design canvas.
 *
 * Reference: GitHub #77 — Configure react-flow canvas properly
 */

const CANVAS_SETTINGS_KEY = 'objectified:canvas:settings';

export interface CanvasSettings {
  showBackground: boolean;
  showControls: boolean;
  showMiniMap: boolean;
  viewportPersistence: boolean;
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  showBackground: true,
  showControls: true,
  showMiniMap: true,
  viewportPersistence: true,
};

interface StoredCanvasSettings {
  settings: CanvasSettings;
  savedAt: string;
}

/**
 * Load canvas settings from localStorage.
 * Returns defaults when nothing is stored or on error.
 */
export function getCanvasSettings(): CanvasSettings {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_CANVAS_SETTINGS;
    const raw = localStorage.getItem(CANVAS_SETTINGS_KEY);
    if (!raw) return DEFAULT_CANVAS_SETTINGS;
    const data = JSON.parse(raw) as StoredCanvasSettings;
    return {
      ...DEFAULT_CANVAS_SETTINGS,
      ...data.settings,
    };
  } catch {
    return DEFAULT_CANVAS_SETTINGS;
  }
}

/**
 * Persist canvas settings to localStorage.
 */
export function saveCanvasSettings(settings: CanvasSettings): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const data: StoredCanvasSettings = {
      settings,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(CANVAS_SETTINGS_KEY, JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
}
