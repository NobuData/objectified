/**
 * Canvas group layout helpers: nesting, absolute positions, hit-testing for drag reparenting.
 * Reference: GitHub #237 — nested groups, create from selection/tag, drag in/out of groups.
 */

import type { Node } from '@xyflow/react';
import type { StudioClass, StudioGroup } from './types';
import { getStableClassId } from './types';
import type { GroupCanvasMetadata } from './canvasGroupStorage';
import { getFlowNodeDimensions } from './canvasAutoLayout';

const DEFAULT_CLASS_W = 220;
const DEFAULT_CLASS_H = 120;

function metaOf(g: StudioGroup): GroupCanvasMetadata {
  return (g.metadata ?? {}) as GroupCanvasMetadata;
}

/** Topologically sort groups so every parent appears before its children (for React Flow). */
export function sortGroupsParentsFirst(groups: StudioGroup[]): StudioGroup[] {
  const byId = new Map(groups.map((ga) => [ga.id, ga]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: StudioGroup[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) return;
    visiting.add(id);
    const g = byId.get(id);
    const p = g ? metaOf(g).parentGroupId : undefined;
    if (p && byId.has(p)) visit(p);
    visiting.delete(id);
    visited.add(id);
    if (g) out.push(g);
  }

  for (const g of groups) visit(g.id);
  return out;
}

/**
 * Sum of `metadata.position` along the parent chain from this group up to the root.
 * Each stored position is relative to its immediate parent (or absolute for root).
 */
export function getGroupAbsolutePosition(
  groups: StudioGroup[],
  groupId: string
): { x: number; y: number } {
  const byId = new Map(groups.map((g) => [g.id, g]));
  let x = 0;
  let y = 0;
  let cur: string | undefined = groupId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const g = byId.get(cur);
    if (!g) break;
    const pos = metaOf(g).position ?? { x: 0, y: 0 };
    x += pos.x ?? 0;
    y += pos.y ?? 0;
    cur = metaOf(g).parentGroupId;
  }
  return { x, y };
}

/** Build map of group id → absolute flow origin (top-left). */
export function buildGroupAbsoluteOriginMap(
  groups: StudioGroup[]
): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  for (const g of groups) {
    m.set(g.id, getGroupAbsolutePosition(groups, g.id));
  }
  return m;
}

/** Absolute top-left of a class on the canvas (handles group-relative storage). */
export function getClassAbsoluteFlowPosition(
  cls: StudioClass,
  groups: StudioGroup[]
): { x: number; y: number } {
  const meta = cls.canvas_metadata ?? {};
  const rel = meta.position ?? { x: 0, y: 0 };
  let x = rel.x ?? 0;
  let y = rel.y ?? 0;
  const gid = meta.group;
  if (gid) {
    const gpos = getGroupAbsolutePosition(groups, gid);
    x += gpos.x;
    y += gpos.y;
  }
  return { x, y };
}

/** All ancestor group ids (including `groupId`), walking parentGroupId to root. */
export function getGroupAncestorIds(
  groups: StudioGroup[],
  groupId: string
): Set<string> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out = new Set<string>();
  let cur: string | undefined = groupId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.add(cur);
    const g = byId.get(cur);
    cur = g ? metaOf(g).parentGroupId : undefined;
  }
  return out;
}

/** Union of each id in `groupIds` with all of its ancestor groups (nested layout). */
export function expandGroupIdsWithAncestors(
  groups: StudioGroup[],
  groupIds: Set<string>
): Set<string> {
  const out = new Set<string>();
  for (const id of groupIds) {
    for (const a of getGroupAncestorIds(groups, id)) out.add(a);
  }
  return out;
}

/** All groups nested under `rootId` (not including `rootId`). */
export function getStrictDescendantGroupIds(
  groups: StudioGroup[],
  rootId: string
): Set<string> {
  const children = new Map<string, string[]>();
  for (const g of groups) {
    const p = metaOf(g).parentGroupId;
    if (!p) continue;
    if (!children.has(p)) children.set(p, []);
    children.get(p)!.push(g.id);
  }
  const out = new Set<string>();
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/** True if setting `parentGroupId` on `groupId` would create a cycle. */
export function wouldCreateGroupParentCycle(
  groups: StudioGroup[],
  groupId: string,
  newParentId: string | null | undefined
): boolean {
  if (!newParentId) return false;
  if (newParentId === groupId) return true;
  const byId = new Map(groups.map((g) => [g.id, g]));
  /** Walk up from the proposed parent; if we hit `groupId`, it would nest a group inside its descendant. */
  let cur: string | undefined = newParentId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur === groupId) return true;
    const g = byId.get(cur);
    cur = g ? metaOf(g).parentGroupId : undefined;
  }
  return false;
}

function getNodeAbsoluteOrigin(node: Node, nodeById: Map<string, Node>): {
  x: number;
  y: number;
} {
  let x = node.position?.x ?? 0;
  let y = node.position?.y ?? 0;
  let parentId = node.parentId;
  const seen = new Set<string>([node.id]);
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const p = nodeById.get(parentId);
    if (!p) break;
    x += p.position?.x ?? 0;
    y += p.position?.y ?? 0;
    parentId = p.parentId;
  }
  return { x, y };
}

/** Top-left of a node in absolute flow coordinates (sums parent chain). */
export function getFlowNodeAbsoluteOrigin(
  node: Node,
  allNodes: Node[]
): { x: number; y: number } {
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  return getNodeAbsoluteOrigin(node, nodeById);
}

/** Center of a node in absolute flow coordinates. */
export function getNodeAbsoluteCenter(node: Node, allNodes: Node[]): {
  x: number;
  y: number;
} {
  const o = getFlowNodeAbsoluteOrigin(node, allNodes);
  const { width, height } = getFlowNodeDimensions(node);
  return { x: o.x + width / 2, y: o.y + height / 2 };
}

export interface GroupHitRect {
  id: string;
  /** Area in px² for choosing innermost container. */
  area: number;
  absX: number;
  absY: number;
  width: number;
  height: number;
}

export function listGroupHitRects(
  groups: StudioGroup[],
  groupNodes: Node[],
  allNodes: Node[]
): GroupHitRect[] {
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const out: GroupHitRect[] = [];
  for (const gn of groupNodes) {
    if (gn.type !== 'group') continue;
    const g = groups.find((gg) => gg.id === gn.id);
    if (!g) continue;
    const o = getNodeAbsoluteOrigin(gn, nodeById);
    const { width, height } = getFlowNodeDimensions(gn);
    out.push({
      id: gn.id,
      area: Math.max(1, width * height),
      absX: o.x,
      absY: o.y,
      width,
      height,
    });
  }
  return out;
}

/** Innermost group whose bounds contain `point` (smallest area). */
export function findInnermostGroupAtPoint(
  rects: GroupHitRect[],
  point: { x: number; y: number }
): string | null {
  let best: GroupHitRect | null = null;
  for (const r of rects) {
    const inside =
      point.x >= r.absX &&
      point.x <= r.absX + r.width &&
      point.y >= r.absY &&
      point.y <= r.absY + r.height;
    if (!inside) continue;
    if (!best || r.area < best.area) best = r;
  }
  return best?.id ?? null;
}

export interface SelectionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const PADDING = 28;

/**
 * Bounding box in absolute coordinates for the given class flow nodes.
 */
export function getAbsoluteBoundsForClassNodes(
  classNodes: Node[],
  allNodes: Node[]
): SelectionBounds | null {
  if (classNodes.length === 0) return null;
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of classNodes) {
    if (n.type !== 'class') continue;
    const o = getNodeAbsoluteOrigin(n, nodeById);
    const { width, height } = getFlowNodeDimensions(n);
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + width);
    maxY = Math.max(maxY, o.y + height);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Position and dimensions for a new group wrapping the given bounds; origin is top-left. */
export function newGroupLayoutFromSelectionBounds(
  b: SelectionBounds,
  padding = PADDING
): {
  position: { x: number; y: number };
  dimensions: { width: number; height: number };
} {
  const minX = b.minX - padding;
  const minY = b.minY - padding;
  const width = Math.max(120, b.maxX - b.minX + padding * 2);
  const height = Math.max(80, b.maxY - b.minY + padding * 2);
  return {
    position: { x: minX, y: minY },
    dimensions: { width, height },
  };
}

/** Class ids that carry `tagName` (case-sensitive match to class.tags). */
export function getClassIdsWithTag(classes: StudioClass[], tagName: string): string[] {
  const t = tagName.trim();
  if (!t) return [];
  const ids: string[] = [];
  for (const cls of classes) {
    const id = getStableClassId(cls);
    if (!id) continue;
    if ((cls.tags ?? []).some((x) => x === t)) ids.push(id);
  }
  return ids;
}
