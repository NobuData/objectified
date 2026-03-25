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

/** When to show property / cardinality labels on ref edges (GitHub #232). */
export type CanvasEdgeLabelMode = 'off' | 'hover' | 'always';

/** How class properties are listed inside canvas nodes. Reference: GitHub #230. */
export type NodePropertyDisplayMode = 'full' | 'compact' | 'hidden';

/** When to show resize handles for selected nodes. Reference: GitHub #235. */
export type CanvasResizeHandleVisibility = 'always' | 'hover';

export interface CanvasSettings {
  showBackground: boolean;
  showControls: boolean;
  showMiniMap: boolean;
  /** Show MiniMap legend for groups and selected nodes. */
  showMiniMapLegend: boolean;
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
  /** Snap dragged class/group nodes to alignment with peers (same coordinate space). Reference: GitHub #235. */
  snapToAlignment: boolean;
  /** Max distance (flow px) to snap to another node's edge or center. */
  alignmentSnapPx: number;
  /** Resize handles when a node is selected: always visible, or only while hovering the node. */
  resizeHandleVisibility: CanvasResizeHandleVisibility;
  /** Min/max class node dimensions (flow px). Enforced by NodeResizer. */
  classNodeMinWidth: number;
  classNodeMaxWidth: number;
  classNodeMinHeight: number;
  classNodeMaxHeight: number;
  /** Min/max group node dimensions (flow px). */
  groupNodeMinWidth: number;
  groupNodeMaxWidth: number;
  groupNodeMinHeight: number;
  groupNodeMaxHeight: number;
  /**
   * When true, scroll / two-finger trackpad gesture pans the viewport (with modifier zoom per React Flow).
   * Reference: GitHub #235.
   */
  canvasScrollPan: boolean;
  /** Edge path routing: straight, bezier, orthogonal (step), smoothstep (smart). */
  edgePathType: CanvasEdgePathType;
  /** Edge stroke color; empty string = use theme (--class-ref-edge-stroke). */
  edgeStrokeColor: string;
  /** Property / cardinality / relationship labels on edges. Reference: GitHub #232. */
  edgeLabelMode: CanvasEdgeLabelMode;
  /** Animate edges. */
  edgeAnimated: boolean;
  /**
   * Hide property lists in nodes for faster high-level canvas overview.
   * Kept in sync with `nodePropertyDisplay === 'hidden'` for backward compatibility.
   */
  simplifiedNodeView: boolean;
  /** Property list density in class nodes (GitHub #230). */
  nodePropertyDisplay: NodePropertyDisplayMode;
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
  showMiniMapLegend: false,
  viewportPersistence: true,
  showLayoutHints: false,
  showDependencyOverlay: false,
  showSchemaMetricsPanel: false,
  gridSize: 16,
  gridStyle: 'dots',
  snapToGrid: true,
  snapToAlignment: true,
  alignmentSnapPx: 8,
  resizeHandleVisibility: 'always',
  classNodeMinWidth: 180,
  classNodeMaxWidth: 400,
  classNodeMinHeight: 48,
  classNodeMaxHeight: 400,
  groupNodeMinWidth: 120,
  groupNodeMaxWidth: 800,
  groupNodeMinHeight: 80,
  groupNodeMaxHeight: 600,
  canvasScrollPan: true,
  edgePathType: 'smoothstep',
  edgeStrokeColor: '',
  edgeLabelMode: 'hover',
  edgeAnimated: false,
  simplifiedNodeView: false,
  nodePropertyDisplay: 'full',
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

function clampAlignmentSnapPx(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CANVAS_SETTINGS.alignmentSnapPx;
  }
  return Math.min(32, Math.max(2, Math.round(value)));
}

function normalizeDimensionPair(
  minRaw: unknown,
  maxRaw: unknown,
  defaults: { min: number; max: number },
  bounds: { lo: number; hi: number }
): { min: number; max: number } {
  const d = defaults;
  let min =
    typeof minRaw === 'number' && Number.isFinite(minRaw)
      ? Math.round(minRaw)
      : d.min;
  let max =
    typeof maxRaw === 'number' && Number.isFinite(maxRaw)
      ? Math.round(maxRaw)
      : d.max;
  min = Math.max(bounds.lo, Math.min(min, bounds.hi));
  max = Math.max(bounds.lo, Math.min(max, bounds.hi));
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  const span = max - min;
  if (span < 40) {
    max = Math.min(bounds.hi, min + 40);
    if (max <= min) min = Math.max(bounds.lo, max - 40);
  }
  return { min, max };
}

function normalizeInteractionSettings(
  merged: Partial<CanvasSettings>
): Pick<
  CanvasSettings,
  | 'snapToAlignment'
  | 'alignmentSnapPx'
  | 'resizeHandleVisibility'
  | 'classNodeMinWidth'
  | 'classNodeMaxWidth'
  | 'classNodeMinHeight'
  | 'classNodeMaxHeight'
  | 'groupNodeMinWidth'
  | 'groupNodeMaxWidth'
  | 'groupNodeMinHeight'
  | 'groupNodeMaxHeight'
  | 'canvasScrollPan'
> {
  const snapToAlignment =
    typeof merged.snapToAlignment === 'boolean'
      ? merged.snapToAlignment
      : DEFAULT_CANVAS_SETTINGS.snapToAlignment;
  const alignmentSnapPx = clampAlignmentSnapPx(merged.alignmentSnapPx);
  const resizeHandleVisibility: CanvasResizeHandleVisibility =
    merged.resizeHandleVisibility === 'hover'
      ? 'hover'
      : merged.resizeHandleVisibility === 'always'
        ? 'always'
        : DEFAULT_CANVAS_SETTINGS.resizeHandleVisibility;
  const canvasScrollPan =
    typeof merged.canvasScrollPan === 'boolean'
      ? merged.canvasScrollPan
      : DEFAULT_CANVAS_SETTINGS.canvasScrollPan;

  const cW = normalizeDimensionPair(
    merged.classNodeMinWidth,
    merged.classNodeMaxWidth,
    {
      min: DEFAULT_CANVAS_SETTINGS.classNodeMinWidth,
      max: DEFAULT_CANVAS_SETTINGS.classNodeMaxWidth,
    },
    { lo: 120, hi: 1200 }
  );
  const cH = normalizeDimensionPair(
    merged.classNodeMinHeight,
    merged.classNodeMaxHeight,
    {
      min: DEFAULT_CANVAS_SETTINGS.classNodeMinHeight,
      max: DEFAULT_CANVAS_SETTINGS.classNodeMaxHeight,
    },
    { lo: 40, hi: 1200 }
  );
  const gW = normalizeDimensionPair(
    merged.groupNodeMinWidth,
    merged.groupNodeMaxWidth,
    {
      min: DEFAULT_CANVAS_SETTINGS.groupNodeMinWidth,
      max: DEFAULT_CANVAS_SETTINGS.groupNodeMaxWidth,
    },
    { lo: 80, hi: 2000 }
  );
  const gH = normalizeDimensionPair(
    merged.groupNodeMinHeight,
    merged.groupNodeMaxHeight,
    {
      min: DEFAULT_CANVAS_SETTINGS.groupNodeMinHeight,
      max: DEFAULT_CANVAS_SETTINGS.groupNodeMaxHeight,
    },
    { lo: 60, hi: 1200 }
  );

  return {
    snapToAlignment,
    alignmentSnapPx,
    resizeHandleVisibility,
    canvasScrollPan,
    classNodeMinWidth: cW.min,
    classNodeMaxWidth: cW.max,
    classNodeMinHeight: cH.min,
    classNodeMaxHeight: cH.max,
    groupNodeMinWidth: gW.min,
    groupNodeMaxWidth: gW.max,
    groupNodeMinHeight: gH.min,
    groupNodeMaxHeight: gH.max,
  };
}

function normalizeNodePropertyDisplay(
  merged: Partial<CanvasSettings>
): NodePropertyDisplayMode {
  /** Legacy stores only `simplifiedNodeView`; merged defaults still set `nodePropertyDisplay: 'full'`. */
  if (merged.simplifiedNodeView === true) {
    return 'hidden';
  }
  const raw = merged.nodePropertyDisplay;
  if (raw === 'full' || raw === 'compact' || raw === 'hidden') {
    return raw;
  }
  return 'full';
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
    const nodePropertyDisplay = normalizeNodePropertyDisplay(merged);
    const simplifiedNodeView = nodePropertyDisplay === 'hidden';
    const edgeLabelMode: CanvasEdgeLabelMode =
      merged.edgeLabelMode === 'off' ||
      merged.edgeLabelMode === 'hover' ||
      merged.edgeLabelMode === 'always'
        ? merged.edgeLabelMode
        : DEFAULT_CANVAS_SETTINGS.edgeLabelMode;
    const interaction = normalizeInteractionSettings(merged);

    return {
      ...merged,
      ...interaction,
      nodePropertyDisplay,
      simplifiedNodeView,
      edgeLabelMode,
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
    const nodePropertyDisplay = normalizeNodePropertyDisplay(settings);
    const interaction = normalizeInteractionSettings(settings);
    const normalized: CanvasSettings = {
      ...settings,
      ...interaction,
      nodePropertyDisplay,
      simplifiedNodeView: nodePropertyDisplay === 'hidden',
    };
    const data: StoredCanvasSettings = {
      settings: normalized,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(CANVAS_SETTINGS_KEY, JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
}
