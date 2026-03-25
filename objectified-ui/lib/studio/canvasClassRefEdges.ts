/**
 * Build React Flow edges between class nodes from property refs ($ref in data/schema),
 * SQL ID refs (x-ref-class-id / x-ref-class-name), and class-level inheritance (schema.allOf).
 * Style by ref type, binding, relationship kind, cardinality labels, and broken targets.
 * Reference: GitHub #81, #232.
 */

import { MarkerType, type Edge } from '@xyflow/react';
import type { StudioClass, StudioClassProperty, StudioGroup } from './types';
import { getStableClassId } from './types';

/** Ref type for edge styling (direct = solid, optional = dashed, weak = dotted, bidirectional = two-way). */
export type ClassRefType = 'direct' | 'optional' | 'weak' | 'bidirectional';

/** How the canvas resolved the reference (schema $ref vs SQL / FK id style). Reference: GitHub #232. */
export type ClassRefBinding = 'schemaRef' | 'idRef';

/** UML-style edge classification when modeled on the property or via allOf inheritance. */
export type ClassRelationshipKind =
  | 'association'
  | 'composition'
  | 'aggregation'
  | 'inheritance';

/** Prefix for $ref to a class schema (OpenAPI 3 / JSON Schema). */
export const REF_PREFIX = '#/components/schemas/';

/** React Flow node id prefix for broken-reference placeholders (canvas only). */
export const BROKEN_REF_NODE_ID_PREFIX = 'broken-ref:';

export function isBrokenRefPlaceholderNodeId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(BROKEN_REF_NODE_ID_PREFIX);
}

export function brokenRefPlaceholderNodeId(
  sourceId: string,
  prop: StudioClassProperty,
  propIndex: number
): string {
  const key =
    (prop.name ?? '').trim() ||
    (prop.id ?? '').trim() ||
    (prop.localId ?? '').trim() ||
    `idx-${propIndex}`;
  return `${BROKEN_REF_NODE_ID_PREFIX}${sourceId}:${encodeURIComponent(key)}`;
}

/** Build $ref string for a class name (e.g. "User" → "#/components/schemas/User"). */
export function refForClassName(name: string): string {
  return `${REF_PREFIX}${(name ?? '').trim()}`;
}

/** Parse class name from a $ref string; returns undefined if not a recognized ref format. */
export function parseClassNameFromRef(ref: string): string | undefined {
  if (typeof ref !== 'string' || !ref.trim()) return undefined;
  const match = ref.match(/#\/(?:components\/schemas|\$defs)\/(.+)$/);
  if (!match) return undefined;
  const raw = match[1].trim();
  return raw || undefined;
}

const REL_KEYS = [
  'x-relationship',
  'relationshipKind',
  'relationship_kind',
  'umlRelationship',
] as const;

export interface ClassRefEdgeData extends Record<string, unknown> {
  refType: ClassRefType;
  /** Property name or inheritance label. */
  label?: string;
  /** Multiplicity text (e.g. 1, 0..1, 1..*). */
  cardinalityLabel?: string;
  /** Schema $ref vs SQL id-style reference. */
  refBinding: ClassRefBinding;
  relationshipKind: ClassRelationshipKind;
  /** Target class id is missing (edge terminates on a placeholder node). */
  brokenRef?: boolean;
  /** Opens property editor when the user invokes “fix” on a broken ref edge. */
  fix?: {
    sourceClassId: string;
    propertyName: string;
  };
  /**
   * Canvas action: edit this property on the source class (GitHub #233).
   * Omitted for inheritance edges; use relationshipKind / label instead.
   */
  edit?: {
    sourceClassId: string;
    propertyName: string;
  };
  /**
   * Perpendicular path offset (px) so multiple edges between the same nodes
   * separate visually (GitHub #233).
   */
  parallelOffset?: number;
  /**
   * Stamped by DesignCanvas based on current schemaMode so ClassRefEdge does not
   * need to subscribe to the full StudioContext (GitHub #233).
   */
  sqlModeDistinctIdRef?: boolean;
}

export interface BrokenRefPlaceholder {
  id: string;
  position: { x: number; y: number };
  sourceClassId: string;
  propertyName: string;
  hint: string;
}

export interface DesignCanvasRefLayer {
  /** All canvas edges including broken-ref edges to placeholders. */
  canvasEdges: Edge<ClassRefEdgeData>[];
  /** Placeholder nodes for unresolved references (merge into React Flow `nodes`). */
  brokenRefPlaceholders: BrokenRefPlaceholder[];
}

const REF_CLASS_ID_KEYS = ['x-ref-class-id', 'refClassId', 'ref_class_id'] as const;

export function getRefClassIdFromData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  for (const key of REF_CLASS_ID_KEYS) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export function getRefBindingFromData(
  data: Record<string, unknown> | undefined
): ClassRefBinding {
  if (data && data['x-ref-storage'] === 'id') return 'idRef';
  return 'schemaRef';
}

export function getRelationshipKindFromPropertyData(
  data: Record<string, unknown> | undefined
): ClassRelationshipKind {
  if (!data) return 'association';
  for (const key of REL_KEYS) {
    const v = data[key];
    if (
      v === 'association' ||
      v === 'composition' ||
      v === 'aggregation' ||
      v === 'inheritance'
    ) {
      return v;
    }
  }
  return 'association';
}

function getClassRequiredList(cls: StudioClass): string[] {
  const req = cls.schema?.required;
  if (!Array.isArray(req)) return [];
  return req.filter((x): x is string => typeof x === 'string');
}

function isPropertyRequiredOnClass(cls: StudioClass, propertyName: string): boolean {
  const trimmed = propertyName.trim().toLowerCase();
  if (!trimmed) return false;
  return getClassRequiredList(cls).some((n) => n.trim().toLowerCase() === trimmed);
}

/** Human-readable multiplicity for edges (GitHub #232). */
export function getCardinalityLabel(
  data: Record<string, unknown> | undefined,
  propertyName: string,
  cls: StudioClass
): string | undefined {
  if (!data) return undefined;
  const req = isPropertyRequiredOnClass(cls, propertyName);
  const typeField = data.type;
  const isArray =
    typeField === 'array' ||
    (Array.isArray(typeField) && (typeField as string[]).includes('array'));

  if (isArray) {
    const min =
      typeof data.minItems === 'number' && Number.isFinite(data.minItems)
        ? Math.max(0, Math.floor(data.minItems))
        : req
          ? 1
          : 0;
    const max =
      typeof data.maxItems === 'number' && Number.isFinite(data.maxItems)
        ? Math.max(0, Math.floor(data.maxItems))
        : undefined;
    if (max === undefined) {
      if (min === 0) return '0..*';
      if (min === 1) return '1..*';
      return `${min}..*`;
    }
    return `${min}..${max}`;
  }

  return req ? '1' : '0..1';
}

/** Extract referenced schema/class names (normalized lowercase) from a JSON Schema-like object. */
function extractRefs(obj: unknown, classNames: Set<string>): Set<string> {
  const out = new Set<string>();
  if (obj == null || typeof obj !== 'object') return out;

  const visit = (val: unknown): void => {
    if (val == null) return;
    if (typeof val === 'object' && !Array.isArray(val)) {
      const o = val as Record<string, unknown>;
      if (typeof o.$ref === 'string') {
        const ref = o.$ref;
        const match = ref.match(/#\/(?:components\/schemas|\$defs)\/(.+)$/);
        const rawName = match ? match[1].trim() : ref.split('/').pop()?.trim();
        const name = rawName ? rawName.toLowerCase() : undefined;
        if (name && classNames.has(name)) {
          out.add(name);
        }
      }
      for (const v of Object.values(o)) {
        visit(v);
      }
      return;
    }
    if (Array.isArray(val)) {
      val.forEach(visit);
    }
  };

  visit(obj);
  return out;
}

const REF_TYPE_KEYS = ['refType', 'ref_type', 'linkType', 'link_type'] as const;

/** Read ref type from property data (for initial form value). */
export function getRefTypeFromData(data: Record<string, unknown> | undefined): ClassRefType {
  if (!data || typeof data !== 'object') return 'direct';
  for (const key of REF_TYPE_KEYS) {
    const v = data[key];
    if (
      v === 'direct' ||
      v === 'optional' ||
      v === 'weak' ||
      v === 'bidirectional'
    ) {
      return v as ClassRefType;
    }
  }
  return 'direct';
}

function placeholderPosition(
  sourceCls: StudioClass,
  placeholderIndex: number,
  groupPositions: Map<string, { x: number; y: number }>
): { x: number; y: number } {
  const relPos = sourceCls.canvas_metadata?.position ?? { x: 0, y: 0 };
  const groupId = sourceCls.canvas_metadata?.group;
  const groupOffset = groupId ? (groupPositions.get(groupId) ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
  const base = { x: (relPos.x ?? 0) + groupOffset.x, y: (relPos.y ?? 0) + groupOffset.y };
  const angle = ((placeholderIndex * 47) % 360) * (Math.PI / 180);
  const dist = 150;
  return {
    x: base.x + Math.cos(angle) * dist,
    y: base.y + Math.sin(angle) * dist,
  };
}

function pushInheritanceEdges(
  classes: StudioClass[],
  nameToId: Map<string, string>,
  duplicates: Set<string>,
  edges: Edge<ClassRefEdgeData>[]
): void {
  let seq = 0;
  for (const cls of classes) {
    const sourceId = getStableClassId(cls);
    if (!sourceId) continue;
    const allOf = cls.schema?.allOf;
    if (!Array.isArray(allOf)) continue;
    for (const entry of allOf) {
      if (!entry || typeof entry !== 'object') continue;
      const ref = (entry as { $ref?: string }).$ref;
      if (typeof ref !== 'string') continue;
      const match = ref.match(/#\/(?:components\/schemas|\$defs)\/(.+)$/);
      const rawName = match ? match[1].trim() : ref.split('/').pop()?.trim();
      const name = rawName?.toLowerCase();
      if (!name || duplicates.has(name)) continue;
      const targetId = nameToId.get(name);
      if (!targetId || targetId === sourceId) continue;
      const id = `inherit-${sourceId}--${targetId}--${seq++}`;
      edges.push({
        id,
        source: sourceId,
        target: targetId,
        type: 'classRef',
        markerEnd: { type: MarkerType.Arrow },
        data: {
          refType: 'direct',
          refBinding: 'schemaRef',
          relationshipKind: 'inheritance',
          label: 'extends',
        },
      });
    }
  }
}

/**
 * Full ref layer for the design canvas (includes broken-ref placeholders and edges).
 * Pass `groups` so that placeholder positions for grouped classes use absolute canvas coordinates.
 */
export function buildDesignCanvasRefLayer(
  classes: StudioClass[],
  groups?: StudioGroup[]
): DesignCanvasRefLayer {
  const groupPositions = new Map<string, { x: number; y: number }>();
  if (groups) {
    for (const g of groups) {
      const pos = (g.metadata as { position?: { x: number; y: number } } | undefined)?.position;
      if (pos) groupPositions.set(g.id, pos);
    }
  }
  const validIds = new Set<string>();
  for (const cls of classes) {
    const id = getStableClassId(cls);
    if (id) validIds.add(id);
  }

  const nameToId = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const cls of classes) {
    const name = (cls.name ?? '').trim().toLowerCase();
    if (!name) continue;
    if (duplicates.has(name)) continue;
    if (nameToId.has(name)) {
      console.warn(
        `[buildDesignCanvasRefLayer] Duplicate class name (normalized): "${name}" – edges to this name will be skipped`
      );
      duplicates.add(name);
      nameToId.delete(name);
    } else {
      nameToId.set(name, getStableClassId(cls));
    }
  }

  const classNames = new Set(nameToId.keys());
  const edges: Edge<ClassRefEdgeData>[] = [];
  const brokenRefPlaceholders: BrokenRefPlaceholder[] = [];
  const arrowClosed = { type: MarkerType.ArrowClosed };
  let brokenOrdinal = 0;

  for (const cls of classes) {
    const sourceId = getStableClassId(cls);
    if (!sourceId) continue;

    const properties = (cls.properties ?? []) as StudioClassProperty[];
    properties.forEach((prop, propIndex) => {
      const data = (prop.data ?? prop.property_data) as Record<string, unknown> | undefined;
      if (!data) return;
      const propName = (prop.name ?? '').trim();
      const refType = getRefTypeFromData(data);
      const relationshipKind = getRelationshipKindFromPropertyData(data);
      const refBinding = getRefBindingFromData(data);
      const cardinalityLabel = getCardinalityLabel(data, propName, cls);
      const refs = extractRefs(data, classNames);
      const refClassId = getRefClassIdFromData(data);
      const xRefNameRaw = data['x-ref-class-name'];
      const xRefName =
        typeof xRefNameRaw === 'string' && xRefNameRaw.trim() ? xRefNameRaw.trim() : '';

      let targetId: string | null = null;
      let broken = false;
      let brokenHint = '';

      if (refClassId) {
        if (validIds.has(refClassId) && refClassId !== sourceId) {
          targetId = refClassId;
        } else {
          broken = true;
          brokenHint = refClassId;
        }
      }

      if (!broken && targetId === null) {
        for (const targetName of refs) {
          const tid = nameToId.get(targetName);
          if (tid && tid !== sourceId) {
            targetId = tid;
            break;
          }
        }
        if (targetId === null && refs.size > 0) {
          const first = [...refs][0];
          broken = true;
          brokenHint = first;
        }
      }

      if (!broken && targetId === null && refBinding === 'idRef' && xRefName) {
        const tid = nameToId.get(xRefName.toLowerCase());
        if (tid && tid !== sourceId) {
          targetId = tid;
        } else {
          broken = true;
          brokenHint = xRefName;
        }
      }

      if (targetId === null && !broken) {
        return;
      }

      const markerStart = refType === 'bidirectional' ? arrowClosed : undefined;
      const markerEnd =
        relationshipKind === 'inheritance'
          ? { type: MarkerType.Arrow }
          : arrowClosed;

      if (broken) {
        const orphanId = brokenRefPlaceholderNodeId(sourceId, prop, propIndex);
        const hint =
          brokenHint ||
          xRefName ||
          (refs.size > 0 ? [...refs][0] : '') ||
          'unknown target';
        brokenRefPlaceholders.push({
          id: orphanId,
          position: placeholderPosition(cls, brokenOrdinal++, groupPositions),
          sourceClassId: sourceId,
          propertyName: propName,
          hint,
        });
        const id = `class-ref-broken-${sourceId}--${encodeURIComponent(propName || String(propIndex))}`;
      edges.push({
        id,
        source: sourceId,
        target: orphanId,
        type: 'classRef',
        markerEnd,
        markerStart,
        data: {
          refType,
          refBinding,
          relationshipKind,
          label: propName || undefined,
          cardinalityLabel,
          brokenRef: true,
          fix: {
            sourceClassId: sourceId,
            propertyName: propName,
          },
          ...(propName.trim()
            ? { edit: { sourceClassId: sourceId, propertyName: propName } }
            : {}),
        },
      });
        return;
      }

      const idSuffix =
        propName ||
        (refs.size > 0 ? [...refs][0] : null) ||
        (xRefName ? xRefName.toLowerCase() : null) ||
        targetId!;
      const idStable = `class-ref-${sourceId}--${targetId!}--${idSuffix}`;

      edges.push({
        id: idStable,
        source: sourceId,
        target: targetId!,
        type: 'classRef',
        markerEnd,
        markerStart,
        data: {
          refType,
          refBinding,
          relationshipKind,
          label: propName || undefined,
          cardinalityLabel,
          brokenRef: false,
          ...(propName.trim()
            ? { edit: { sourceClassId: sourceId, propertyName: propName } }
            : {}),
        },
      });
    });
  }

  pushInheritanceEdges(classes, nameToId, duplicates, edges);

  return {
    canvasEdges: assignParallelOffsetsToRefEdges(edges),
    brokenRefPlaceholders,
  };
}

/**
 * Spread multiple edges that share the same source and target along a perpendicular
 * offset so property labels and paths remain distinguishable (GitHub #233).
 */
export function assignParallelOffsetsToRefEdges(
  edges: Edge<ClassRefEdgeData>[]
): Edge<ClassRefEdgeData>[] {
  const keyToIndices = new Map<string, number[]>();
  edges.forEach((edge, idx) => {
    if (edge.type !== 'classRef') return;
    const key = `${edge.source}::${edge.target}`;
    const arr = keyToIndices.get(key) ?? [];
    arr.push(idx);
    keyToIndices.set(key, arr);
  });

  const next = edges.map((edge) => ({
    ...edge,
    data: edge.data ? { ...edge.data } : edge.data,
  }));

  const SPACING = 16;
  for (const indices of keyToIndices.values()) {
    if (indices.length <= 1) continue;
    const sorted = [...indices].sort(
      (ai, bi) => next[ai]!.id.localeCompare(next[bi]!.id)
    );
    const n = sorted.length;
    sorted.forEach((edgeIdx, i) => {
      const data = next[edgeIdx]?.data;
      if (!data) return;
      const parallelOffset = (i - (n - 1) / 2) * SPACING;
      next[edgeIdx]!.data = { ...data, parallelOffset };
    });
  }

  return next;
}

/**
 * Edges between real classes only (export, metrics). Omits broken-target placeholder edges.
 */
export function buildClassRefEdges(classes: StudioClass[]): Edge<ClassRefEdgeData>[] {
  return buildDesignCanvasRefLayer(classes).canvasEdges.filter(
    (e) => !e.data?.brokenRef && !isBrokenRefPlaceholderNodeId(e.target)
  );
}
