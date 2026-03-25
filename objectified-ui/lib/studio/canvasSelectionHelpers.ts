/**
 * Helpers for canvas multi-select: filter visible classes by group or tag (GitHub #234).
 */

import type { StudioClass } from './types';
import { getStableClassId } from './types';

/** Visible class IDs that belong to a canvas group. */
export function filterVisibleClassIdsByGroup(
  visibleClassIds: readonly string[],
  classToGroup: ReadonlyMap<string, string>,
  groupId: string
): string[] {
  return visibleClassIds.filter((id) => classToGroup.get(id) === groupId);
}

/** Visible classes that have the given tag (case-insensitive comparison). */
export function filterVisibleClassIdsByTag(
  visibleClassIdSet: ReadonlySet<string>,
  classes: readonly StudioClass[],
  tagName: string
): string[] {
  const needle = tagName.trim().toLowerCase();
  if (!needle) return [];
  const out: string[] = [];
  for (const cls of classes) {
    const id = getStableClassId(cls);
    if (!visibleClassIdSet.has(id)) continue;
    const tags = cls.tags ?? [];
    if (tags.some((t) => t.toLowerCase() === needle)) {
      out.push(id);
    }
  }
  return out;
}
