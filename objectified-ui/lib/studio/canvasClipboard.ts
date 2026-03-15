/**
 * Copy/paste/duplicate for classes on the canvas. Classes (and optional refs) in local state.
 * Reference: GitHub #97.
 */

import type { StudioClass, StudioClassProperty } from './types';
import { generateLocalId } from './types';

const PASTE_OFFSET = { x: 40, y: 40 };

/**
 * Return a name that does not collide with existing (case-insensitive).
 * Tries "Name (copy)", "Name (copy 2)", etc.
 */
export function getUniqueName(
  baseName: string,
  usedNormalizedNames: Set<string>
): string {
  const norm = (s: string) => s.trim().toLowerCase();
  let name = baseName?.trim() || 'Unnamed class';
  if (!usedNormalizedNames.has(norm(name))) return name;
  let n = 1;
  while (true) {
    const suffix = n === 1 ? '(copy)' : `(copy ${n})`;
    const candidate = `${name} ${suffix}`;
    if (!usedNormalizedNames.has(norm(candidate))) return candidate;
    n += 1;
  }
}

/**
 * Replace $ref values in an object when the referenced class name (normalized) is in the map.
 * Deep-clones and returns new object. Used when pasting so refs between pasted classes point to new names.
 */
function remapRefsInValue(
  val: unknown,
  normalizedOldNameToNewName: Map<string, string>
): unknown {
  if (val == null) return val;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map((item) => remapRefsInValue(item, normalizedOldNameToNewName));
  }
  const obj = val as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '$ref' && typeof v === 'string') {
      const ref = v;
      const schemasMatch = ref.match(/^(#\/components\/schemas\/)(.+)$/);
      const defsMatch = ref.match(/^(#\/\$defs\/)(.+)$/);
      const match = schemasMatch ?? defsMatch;
      const rawName = match ? match[2].trim() : ref.split('/').pop()?.trim();
      const normalized = rawName ? rawName.toLowerCase() : '';
      const newName = normalized ? normalizedOldNameToNewName.get(normalized) : undefined;
      if (newName !== undefined) {
        // Preserve the original ref prefix so $defs refs stay as $defs and components/schemas refs stay as components/schemas
        const prefix = match ? match[1] : '';
        out[k] = prefix ? `${prefix}${newName}` : newName;
      } else {
        out[k] = v;
      }
    } else {
      out[k] = remapRefsInValue(v, normalizedOldNameToNewName);
    }
  }
  return out;
}

function deepCloneProperty(prop: StudioClassProperty): StudioClassProperty {
  return {
    ...prop,
    data: prop.data ? JSON.parse(JSON.stringify(prop.data)) : undefined,
    property_data: prop.property_data
      ? JSON.parse(JSON.stringify(prop.property_data))
      : undefined,
  };
}

/**
 * Clone clipboard classes for paste: new localIds, unique names, offset positions,
 * and remap $ref in properties so refs between pasted classes point to the new names.
 */
export function cloneClassesForPaste(
  clipboardClasses: StudioClass[],
  existingClassNames: string[],
  positionOffset: { x: number; y: number } = PASTE_OFFSET
): StudioClass[] {
  const used = new Set(existingClassNames.map((n) => n.trim().toLowerCase()));
  const normalizedOldToNewName = new Map<string, string>();
  const newNamesByIndex: string[] = [];

  for (const cls of clipboardClasses) {
    const oldNorm = (cls.name ?? '').trim().toLowerCase();
    const newName = getUniqueName(cls.name ?? 'Unnamed class', used);
    used.add(newName.trim().toLowerCase());
    newNamesByIndex.push(newName);
    if (oldNorm && !normalizedOldToNewName.has(oldNorm))
      normalizedOldToNewName.set(oldNorm, newName);
  }

  return clipboardClasses.map((cls, idx) => {
    const newName = newNamesByIndex[idx] ?? cls.name ?? 'Unnamed class';
    const pos = cls.canvas_metadata?.position ?? { x: 0, y: 0 };
    const newMeta = {
      ...cls.canvas_metadata,
      position: {
        x: pos.x + positionOffset.x,
        y: pos.y + positionOffset.y,
      },
    };
    const properties = (cls.properties ?? []).map((prop) => {
      const cloned = deepCloneProperty(prop);
      if (cloned.data)
        cloned.data = remapRefsInValue(cloned.data, normalizedOldToNewName) as Record<string, unknown>;
      if (cloned.property_data)
        cloned.property_data = remapRefsInValue(
          cloned.property_data,
          normalizedOldToNewName
        ) as Record<string, unknown>;
      return cloned;
    });
    return {
      ...cls,
      id: undefined,
      localId: generateLocalId(),
      version_id: undefined,
      name: newName,
      canvas_metadata: newMeta,
      properties,
      schema: cls.schema
        ? (remapRefsInValue(cls.schema, normalizedOldToNewName) as Record<string, unknown>)
        : undefined,
    };
  });
}

export { PASTE_OFFSET };
