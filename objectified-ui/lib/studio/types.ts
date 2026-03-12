/**
 * Local in-browser version state: single source of truth for the design studio.
 * Supports undo/redo and save-to-server when the user commits.
 *
 * Reference: GitHub #61 — versionId, classes[], properties[], class_properties[]
 * (order and overrides), canvas_metadata per class, groups.
 */

/** Canvas metadata for a class (position, dimensions, style, group). */
export interface ClassCanvasMetadata {
  position?: { x: number; y: number };
  dimensions?: { width?: number; height?: number };
  style?: Record<string, unknown>;
  group?: string;
}

/** A single class-property in a class (order preserved; overrides via data). */
export interface StudioClassProperty {
  id?: string;
  class_id?: string;
  property_id?: string;
  parent_id?: string | null;
  name: string;
  description?: string;
  data?: Record<string, unknown>;
  property_name?: string;
  property_data?: Record<string, unknown>;
}

/** A class in the local version state (with properties in order and optional canvas_metadata). */
export interface StudioClass {
  id?: string;
  version_id?: string;
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Class-properties in display/order; overrides in data. */
  properties: StudioClassProperty[];
  /** Canvas position/dimensions/style/group (stored in metadata.canvas_metadata or here). */
  canvas_metadata?: ClassCanvasMetadata;
  tags?: string[];
}

/** Project-level property definition (for palette / sidebar). */
export interface StudioProperty {
  id: string;
  project_id?: string;
  name: string;
  description?: string;
  data?: Record<string, unknown>;
}

/** Group definition for canvas (e.g. visual grouping). Optional for future use. */
export interface StudioGroup {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
}

/**
 * Local version state: single source of truth in the browser.
 * Can be pushed to the master server when the user saves.
 */
export interface LocalVersionState {
  versionId: string;
  /** Server revision after last pull/commit; null if never committed or after local-only edits. */
  revision: number | null;
  /** Classes in order; each includes properties (class_properties) in order. */
  classes: StudioClass[];
  /** Project-level property definitions (for palette). */
  properties: StudioProperty[];
  /** Version-level canvas metadata (layout, etc.). */
  canvas_metadata: Record<string, unknown> | null;
  /** Optional groups (e.g. for canvas grouping). */
  groups: StudioGroup[];
}

/** Action kinds for the undo stack (optional: could store full state snapshots only). */
export type StudioActionKind =
  | 'replace_state'
  | 'add_class'
  | 'update_class'
  | 'remove_class'
  | 'reorder_classes'
  | 'add_class_property'
  | 'update_class_property'
  | 'remove_class_property'
  | 'reorder_class_properties'
  | 'update_canvas_metadata'
  | 'update_version_canvas_metadata';
