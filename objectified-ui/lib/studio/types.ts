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
  /** Client-generated stable id for locally-created properties (before save). */
  localId?: string;
  class_id?: string;
  property_id?: string;
  parent_id?: string | null;
  name: string;
  description?: string;
  data?: Record<string, unknown>;
  property_name?: string;
  property_data?: Record<string, unknown>;
}

/**
 * Generate a stable client-side id for a new class (e.g. before save).
 * Use this when creating a class so React Flow and draft updates key off a stable id.
 */
export function generateLocalId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Generate a stable client-side id for a new group (GitHub #83). */
export function generateGroupId(): string {
  return `group-${generateLocalId()}`;
}

/** Return a stable key for a class: server id when present, otherwise client localId. */
export function getStableClassId(cls: { id?: string; localId?: string }): string {
  return cls.id ?? cls.localId ?? '';
}

/** A class in the local version state (with properties in order and optional canvas_metadata). */
export interface StudioClass {
  id?: string;
  /** Client-generated stable id when the class is created before save (no server id yet). */
  localId?: string;
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
  /** When true, state is a loaded revision for viewing only; edits and commit are disabled. */
  readOnly?: boolean;
}

/**
 * Data shape for the class node on the react-flow canvas (GitHub #79).
 * Rendered from local state; position, dimensions, style come from canvas_metadata on the node.
 */
export interface ClassNodeData {
  /** Class name shown in the node header. */
  name: string;
  /** Properties assigned to the class, shown as members. */
  properties: StudioClassProperty[];
  /** Optional canvas metadata for dimensions and style (applied by the canvas). */
  canvas_metadata?: ClassCanvasMetadata;
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
