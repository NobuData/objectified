/**
 * Draft mutations for canvas groups (ungroup, etc.).
 * Reference: GitHub #239 — delete group only vs delete-all, ungroup with position preserve.
 */

import type { LocalVersionState, StudioClass, StudioGroup } from './types';
import { getStableClassId } from './types';
import type { GroupCanvasMetadata } from './canvasGroupStorage';
import { getClassAbsoluteFlowPosition, getGroupAbsolutePosition } from './canvasGroupLayout';

/** Default flow position when persisting layout entries. */
const DEFAULT_CLASS_POSITION = { x: 0, y: 0 };

/**
 * Remove a group and keep member classes at absolute flow positions.
 * Direct child groups become top-level with absolute positions.
 */
export function detachGroupKeepClasses(
  draft: LocalVersionState,
  groupId: string
): void {
  const groups = draft.groups as StudioGroup[];
  const gAbs = getGroupAbsolutePosition(groups, groupId);
  for (const h of draft.groups) {
    if (h.id === groupId) continue;
    const hm = (h.metadata ?? {}) as GroupCanvasMetadata;
    if (hm.parentGroupId !== groupId) continue;
    const rel = hm.position ?? { x: 0, y: 0 };
    h.metadata = {
      ...h.metadata,
      parentGroupId: undefined,
      position: {
        x: gAbs.x + (rel.x ?? 0),
        y: gAbs.y + (rel.y ?? 0),
      },
    } as Record<string, unknown>;
  }
  for (const c of draft.classes) {
    if (c.canvas_metadata?.group !== groupId) continue;
    const abs = getClassAbsoluteFlowPosition(c, draft.groups as StudioGroup[]);
    const meta = { ...c.canvas_metadata };
    delete meta.group;
    meta.position = { x: abs.x, y: abs.y };
    c.canvas_metadata = meta;
  }
  draft.groups = draft.groups.filter((g) => g.id !== groupId);
}

/** Build class position entries from draft for saveDefaultCanvasLayout. */
export function classLayoutEntriesFromDraft(
  draft: LocalVersionState
): { classId: string; position: { x: number; y: number } }[] {
  return draft.classes.map((c) => ({
    classId: getStableClassId(c),
    position: c.canvas_metadata?.position ?? DEFAULT_CLASS_POSITION,
  }));
}

/** Class names directly assigned to the group (not nested child groups). */
export function getDirectMemberClassNames(
  classes: StudioClass[],
  groupId: string
): string[] {
  const names: string[] = [];
  for (const c of classes) {
    if (c.canvas_metadata?.group !== groupId) continue;
    const n = (c.name ?? '').trim();
    names.push(n || '(unnamed class)');
  }
  return names.sort((a, b) => a.localeCompare(b));
}
