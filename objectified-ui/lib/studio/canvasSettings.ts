/**
 * Canvas display settings (Background, Controls, MiniMap, viewport persistence).
 * Persisted to localStorage and applied to the design canvas.
 *
 * Reference: GitHub #77 — Configure react-flow canvas properly
 * Reference: GitHub #94 — Add canvas settings form (grid, background, edge, routing, animation)
 */

const CANVAS_SETTINGS_KEY = 'objectified:canvas:settings';

/** Grid/background pattern style. Maps to React Flow BackgroundVariant. */
export type CanvasGridStyle = 'dots' | 'lines' | 'cross';

/** Edge path routing type. */
export type CanvasEdgePathType = 'straight' | 'bezier' | 'orthogonal' | 'smoothstep';

export interface CanvasSettings {
  showBackground: boolean;
  showControls: boolean;
  showMiniMap: boolean;
  viewportPersistence: boolean;
  /** Show optional layout hints (edge crossings, spacing). Reference: GitHub #89. */
  showLayoutHints: boolean;
  /** Show dependency overlay (upstream/downstream/path from selected node, circular ref warning). Reference: GitHub #90. */
  showDependencyOverlay: boolean;
  /** Show schema metrics panel (depth, circular, affected count). Reference: GitHub #91. */
  showSchemaMetricsPanel: boolean;
  /** Grid: size in pixels (gap between dots/lines). */
  gridSize: number;
  /** Grid: pattern style (dots, lines, cross). */
  gridStyle: CanvasGridStyle;
  /** Grid: snap nodes to grid when dragging. */
  snapToGrid: boolean;
  /** Edge path routing: straight, bezier, orthogonal (step), smoothstep (smart). */
  edgePathType: CanvasEdgePathType;
  /** Edge stroke color; empty string = use theme (--class-ref-edge-stroke). */
  edgeStrokeColor: string;
  /** Animate edges. */
  edgeAnimated: boolean;
  /** Hide property lists in nodes for faster high-level canvas overview. */
  simplifiedNodeView: boolean;
  /** Increase contrast for nodes and edges for visibility/accessibility. */
  highContrastCanvas: boolean;
  /** Reduce canvas motion by disabling optional edge animation. */
  reducedMotion: boolean;
  /** Persist studio undo/redo stacks in sessionStorage for page refresh recovery. */
  persistUndoStackInSession: boolean;
  /** Maximum number of undo steps kept in memory. */
  maxUndoDepth: number;
  /**
   * When opening a URL with only `revision` (no view/readOnly/edit), load that snapshot as read-only.
   * Use `edit=1` on the URL to force an editable load.
   */
  defaultRevisionLoadReadOnly: boolean;
  /** After loading a specific revision, clear undo/redo instead of restoring a matching session stack. */
  clearUndoStackOnRevisionLoad: boolean;
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  showBackground: true,
  showControls: true,
  showMiniMap: true,
  viewportPersistence: true,
  showLayoutHints: false,
  showDependencyOverlay: false,
  showSchemaMetricsPanel: false,
  gridSize: 16,
  gridStyle: 'dots',
  snapToGrid: true,
  edgePathType: 'smoothstep',
  edgeStrokeColor: '',
  edgeAnimated: false,
  simplifiedNodeView: false,
  highContrastCanvas: false,
  reducedMotion: false,
  persistUndoStackInSession: false,
  maxUndoDepth: 50,
  defaultRevisionLoadReadOnly: false,
  clearUndoStackOnRevisionLoad: true,
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
    const merged = {
      ...DEFAULT_CANVAS_SETTINGS,
      ...data.settings,
    };
    return {
      ...merged,
      maxUndoDepth:
        typeof merged.maxUndoDepth === 'number' &&
        Number.isFinite(merged.maxUndoDepth) &&
        merged.maxUndoDepth >= 1
          ? Math.floor(merged.maxUndoDepth)
          : DEFAULT_CANVAS_SETTINGS.maxUndoDepth,
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
