/**
 * Build React Flow edges between class nodes from property refs ($ref in data/schema).
 * Style by ref type: direct, optional, weak, bidirectional. Reference: GitHub #81.
 */

import type { Edge } from '@xyflow/react';
import type { StudioClass, StudioClassProperty } from './types';
import { getStableClassId } from './types';

/** Ref type for edge styling (direct = solid, optional = dashed, weak = dotted, bidirectional = two-way). */
export type ClassRefType = 'direct' | 'optional' | 'weak' | 'bidirectional';

export interface ClassRefEdgeData extends Record<string, unknown> {
  refType: ClassRefType;
  /** Property name that defines the ref (for tooltip/label). */
  label?: string;
}

/** Extract referenced schema/class names from a JSON Schema-like object (e.g. $ref, items.$ref). */
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
        const name = match ? match[1].trim() : ref.split('/').pop()?.trim();
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

function getRefTypeFromData(data: Record<string, unknown> | undefined): ClassRefType {
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
 * resolve target by class name, and assign refType from property data (default direct).
 */
export function buildClassRefEdges(classes: StudioClass[]): Edge<ClassRefEdgeData>[] {
  const classNames = new Set(classes.map((c) => (c.name ?? '').trim()).filter(Boolean));
  const nameToId = new Map<string, string>();
  for (const cls of classes) {
    const name = (cls.name ?? '').trim();
    if (name) nameToId.set(name, getStableClassId(cls));
  }

  const edges: Edge<ClassRefEdgeData>[] = [];
  let edgeIdx = 0;

  for (const cls of classes) {
    const sourceName = (cls.name ?? '').trim();
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
        const id = `class-ref-${edgeIdx++}`;
        edges.push({
          id,
          source: sourceId,
          target: targetId,
          type: 'classRef',
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
