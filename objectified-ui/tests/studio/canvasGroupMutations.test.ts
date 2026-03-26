/**
 * Reference: GitHub #239 — ungroup keeps class positions.
 */

import { describe, expect, it } from '@jest/globals';
import {
  detachGroupKeepClasses,
  getDirectMemberClassNames,
} from '@lib/studio/canvasGroupMutations';
import type { LocalVersionState } from '@lib/studio/types';

function makeState(): LocalVersionState {
  return {
    versionId: 'v1',
    revision: null,
    classes: [],
    properties: [],
    canvas_metadata: null,
    groups: [],
  };
}

describe('detachGroupKeepClasses', () => {
  it('removes group ref and sets absolute positions for member classes', () => {
    const draft = makeState();
    draft.groups = [
      {
        id: 'g1',
        name: 'G',
        metadata: { position: { x: 10, y: 20 } },
      },
    ];
    draft.classes = [
      {
        localId: 'c1',
        name: 'Alpha',
        properties: [],
        canvas_metadata: { group: 'g1', position: { x: 5, y: 6 } },
      },
    ];
    detachGroupKeepClasses(draft, 'g1');
    expect(draft.groups.some((g) => g.id === 'g1')).toBe(false);
    const c = draft.classes[0];
    expect(c?.canvas_metadata?.group).toBeUndefined();
    expect(c?.canvas_metadata?.position).toEqual({ x: 15, y: 26 });
  });

  it('hoists child group to absolute position', () => {
    const draft = makeState();
    draft.groups = [
      {
        id: 'parent',
        name: 'P',
        metadata: { position: { x: 100, y: 50 } },
      },
      {
        id: 'child',
        name: 'C',
        metadata: { parentGroupId: 'parent', position: { x: 10, y: 10 } },
      },
    ];
    detachGroupKeepClasses(draft, 'parent');
    const child = draft.groups.find((g) => g.id === 'child');
    expect(child).toBeDefined();
    const meta = child?.metadata as { parentGroupId?: string; position?: { x: number; y: number } };
    expect(meta.parentGroupId).toBeUndefined();
    expect(meta.position).toEqual({ x: 110, y: 60 });
  });
});

describe('getDirectMemberClassNames', () => {
  it('lists sorted names for direct members only', () => {
    const classes = [
      { localId: 'a', name: 'Zebra', properties: [], canvas_metadata: { group: 'g' } },
      { localId: 'b', name: 'Apple', properties: [], canvas_metadata: { group: 'g' } },
      { localId: 'c', name: 'Other', properties: [], canvas_metadata: { group: 'h' } },
    ];
    expect(getDirectMemberClassNames(classes, 'g')).toEqual(['Apple', 'Zebra']);
  });
});
