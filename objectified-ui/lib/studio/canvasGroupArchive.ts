/**
 * Archived groups — hidden on canvas until restored.
 * Reference: GitHub #239 — archive group, retain in state for restore.
 */

import type { StudioGroup } from './types';
import type { GroupCanvasMetadata } from './canvasGroupStorage';
import { getStrictDescendantGroupIds } from './canvasGroupLayout';

function metaOf(g: StudioGroup): GroupCanvasMetadata {
  return (g.metadata ?? {}) as GroupCanvasMetadata;
}

/**
 * Group ids hidden from the canvas: groups marked archived and all nested child groups.
 */
export function getArchivedSubtreeGroupIds(groups: StudioGroup[]): Set<string> {
  const hidden = new Set<string>();
  for (const g of groups) {
    if (metaOf(g).archived === true) {
      hidden.add(g.id);
      for (const d of getStrictDescendantGroupIds(groups, g.id)) {
        hidden.add(d);
      }
    }
  }
  return hidden;
}
