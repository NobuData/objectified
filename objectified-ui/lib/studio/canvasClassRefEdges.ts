/**
 * Build React Flow edges between class nodes from property refs ($ref in data/schema).
 * Style by ref type: direct, optional, weak, bidirectional. Reference: GitHub #81.
 */

import { MarkerType, type Edge } from '@xyflow/react';
import type { StudioClass, StudioClassProperty } from './types';
import { getStableClassId } from './types';

/** Ref type for edge styling (direct = solid, optional = dashed, weak = dotted, bidirectional = two-way). */
export type ClassRefType = 'direct' | 'optional' | 'weak' | 'bidirectional';

/** Prefix for $ref to a class schema (OpenAPI 3 / JSON Schema). */
export const REF_PREFIX = '#/components/schemas/';

/** Build $ref string for a class name (e.g. "User" → "#/components/schemas/User"). */
export function refForClassName(name: string): string {
  return `${REF_PREFIX}${(name ?? '').trim()}`;
}

/** Parse class name from a $ref string; returns undefined if not a recognized ref format. */
export function parseClassNameFromRef(ref: string): string | undefined {
  if (typeof ref !== 'string' || !ref.trim()) return undefined;
  const match = ref.match(/#\/(?:components\/schemas|\$defs)\/(.+)$/);
  const raw = match ? match[1].trim() : ref.split('/').pop()?.trim();
  return raw || undefined;
}

export interface ClassRefEdgeData extends Record<string, unknown> {
  refType: ClassRefType;
  /** Property name that defines the ref (for tooltip/label). */
  label?: string;
}

/** Extract referenced schema/class names (normalized lowercase) from a JSON Schema-like object (e.g. $ref, items.$ref). */
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

/**
 * Build edges from class refs: for each class, scan properties for $ref in data/property_data,
 * resolve target by normalized class name (case-insensitive), and assign refType from property
 * data (default direct). Duplicate normalized class names are warned and skipped to avoid
 * ambiguous links.
 */
export function buildClassRefEdges(classes: StudioClass[]): Edge<ClassRefEdgeData>[] {
  // Build normalized (trim+lowercase) name → id map; detect and skip duplicates.
  const nameToId = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const cls of classes) {
    const name = (cls.name ?? '').trim().toLowerCase();
    if (!name) continue;
    if (duplicates.has(name)) continue;
    if (nameToId.has(name)) {
      console.warn(
        `[buildClassRefEdges] Duplicate class name (normalized): "${name}" – edges to this name will be skipped`
      );
      duplicates.add(name);
      nameToId.delete(name);
    } else {
      nameToId.set(name, getStableClassId(cls));
    }
  }

  const classNames = new Set(nameToId.keys());
  const edges: Edge<ClassRefEdgeData>[] = [];
  const arrowMarker = { type: MarkerType.ArrowClosed };

  for (const cls of classes) {
    const sourceName = (cls.name ?? '').trim().toLowerCase();
    if (!sourceName) continue;
    const sourceId = nameToId.get(sourceName);
    if (!sourceId) continue;

    const properties = (cls.properties ?? []) as StudioClassProperty[];
    for (const prop of properties) {
      const data = (prop.data ?? prop.property_data) as Record<string, unknown> | undefined;
      if (!data) continue;
      const refs = extractRefs(data, classNames);
      const refType = getRefTypeFromData(data);
      const propName = (prop.name ?? '').trim();

      for (const targetName of refs) {
        const targetId = nameToId.get(targetName);
        if (!targetId || targetId === sourceId) continue;
        // Deterministic id to prevent React Flow from recreating edges between renders.
        const id = `class-ref-${sourceId}--${targetId}--${propName || targetName}`;
        edges.push({
          id,
          source: sourceId,
          target: targetId,
          type: 'classRef',
          markerEnd: arrowMarker,
          markerStart: refType === 'bidirectional' ? arrowMarker : undefined,
          data: {
            refType,
            label: propName || undefined,
          },
        });
      }
    }
  }

  return edges;
}
