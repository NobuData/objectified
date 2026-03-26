/**
 * Archived groups — hidden on canvas until restored.
 * Reference: GitHub #239 — archive group, retain in state for restore.
 */

import type { StudioGroup } from './types';
import type { GroupCanvasMetadata } from './canvasGroupStorage';

function metaOf(g: StudioGroup): GroupCanvasMetadata {
  return (g.metadata ?? {}) as GroupCanvasMetadata;
}

type GroupWithParent = StudioGroup & { _parentId: string | null };

/**
 * Group ids hidden from the canvas: groups marked archived and all nested child groups.
 * Uses a single O(n) traversal by building a parent→children map once.
 */
export function getArchivedSubtreeGroupIds(groups: StudioGroup[]): Set<string> {
  const hidden = new Set<string>();

  // Build id lookup and parent -> children adjacency map once.
  const idToGroup = new Map<string, GroupWithParent>();
  const childrenByParent = new Map<string | null, GroupWithParent[]>();

  for (const g of groups) {
    const gwp: GroupWithParent = {
      ...g,
      _parentId: (metaOf(g).parentGroupId as string | undefined) ?? null,
    };
    idToGroup.set(gwp.id, gwp);
    const siblings = childrenByParent.get(gwp._parentId);
    if (siblings) {
      siblings.push(gwp);
    } else {
      childrenByParent.set(gwp._parentId, [gwp]);
    }
  }

  // Identify root groups: those whose parentGroupId is null/undefined or not present in groups.
  const roots: GroupWithParent[] = [];
  for (const g of idToGroup.values()) {
    if (g._parentId === null || !idToGroup.has(g._parentId)) {
      roots.push(g);
    }
  }

  const visit = (group: GroupWithParent, hasArchivedAncestor: boolean) => {
    const isArchived = metaOf(group).archived === true;
    const hiddenHere = hasArchivedAncestor || isArchived;
    if (hiddenHere) {
      hidden.add(group.id);
    }
    for (const child of childrenByParent.get(group.id) ?? []) {
      visit(child, hiddenHere);
    }
  };

  for (const root of roots) {
    visit(root, false);
  }

  return hidden;
}
