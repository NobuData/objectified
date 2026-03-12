/**
 * Compare two schema class lists (e.g. from version pull responses) and return
 * added/removed/modified classes and property-level changes.
 * Matching is case-insensitive by class name and property name.
 */

export interface CompareSchemasModifiedClass {
  class_name: string;
  added_property_names: string[];
  removed_property_names: string[];
  modified_property_names: string[];
}

export interface CompareSchemasResult {
  added_class_names: string[];
  removed_class_names: string[];
  modified_classes: CompareSchemasModifiedClass[];
}

type ClassLike = { name?: string; properties?: Array<{ name?: string; data?: unknown; property_data?: unknown }> };

function classKey(c: ClassLike): string {
  return (c.name ?? '').trim().toLowerCase();
}

function propKey(p: { name?: string }): string {
  return (p.name ?? '').trim().toLowerCase();
}

function propDataEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Compare two class lists (e.g. from GET /versions/{id}/pull) and return
 * added classes, removed classes, and modified classes with property-level diff.
 */
export function compareSchemas(
  oldClasses: ClassLike[],
  newClasses: ClassLike[]
): CompareSchemasResult {
  const oldByName = new Map<string, ClassLike>();
  const newByName = new Map<string, ClassLike>();
  for (const c of oldClasses) {
    const k = classKey(c);
    if (k) oldByName.set(k, c);
  }
  for (const c of newClasses) {
    const k = classKey(c);
    if (k) newByName.set(k, c);
  }

  const added_class_names: string[] = [];
  const removed_class_names: string[] = [];
  const modified_classes: CompareSchemasModifiedClass[] = [];

  for (const [nameKey, newC] of newByName) {
    const displayName = (newC.name ?? nameKey).trim() || nameKey;
    const oldC = oldByName.get(nameKey);
    if (!oldC) {
      added_class_names.push(displayName);
      continue;
    }
    const oldProps = new Map<string, { name?: string; data?: unknown; property_data?: unknown }>();
    const newProps = new Map<string, { name?: string; data?: unknown; property_data?: unknown }>();
    for (const p of oldC.properties ?? []) {
      const pk = propKey(p);
      if (pk) oldProps.set(pk, p);
    }
    for (const p of newC.properties ?? []) {
      const pk = propKey(p);
      if (pk) newProps.set(pk, p);
    }
    const added_property_names: string[] = [];
    const removed_property_names: string[] = [];
    const modified_property_names: string[] = [];
    for (const [pk, p] of newProps) {
      const propDisplayName = (p.name ?? pk).trim() || pk;
      if (!oldProps.has(pk)) {
        added_property_names.push(propDisplayName);
      } else {
        const oldData = oldProps.get(pk);
        const a = (oldData?.data ?? oldData?.property_data) ?? {};
        const b = (p.data ?? p.property_data) ?? {};
        if (!propDataEqual(a, b)) {
          modified_property_names.push(propDisplayName);
        }
      }
    }
    for (const [pk, p] of oldProps) {
      if (!newProps.has(pk)) {
        removed_property_names.push((p.name ?? pk).trim() || pk);
      }
    }
    if (
      added_property_names.length > 0 ||
      removed_property_names.length > 0 ||
      modified_property_names.length > 0
    ) {
      modified_classes.push({
        class_name: displayName,
        added_property_names,
        removed_property_names,
        modified_property_names,
      });
    }
  }

  for (const [nameKey, oldC] of oldByName) {
    if (!newByName.has(nameKey)) {
      const displayName = (oldC.name ?? nameKey).trim() || nameKey;
      removed_class_names.push(displayName);
    }
  }

  return {
    added_class_names,
    removed_class_names,
    modified_classes,
  };
}
