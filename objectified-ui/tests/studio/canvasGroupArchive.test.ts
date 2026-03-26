/**
 * Reference: GitHub #239 — archived groups hidden from canvas.
 */

import { describe, expect, it } from '@jest/globals';
import { getArchivedSubtreeGroupIds } from '@lib/studio/canvasGroupArchive';
import type { StudioGroup } from '@lib/studio/types';

describe('getArchivedSubtreeGroupIds', () => {
  it('returns empty set when nothing archived', () => {
    const groups: StudioGroup[] = [
      { id: 'a', name: 'A', metadata: { position: { x: 0, y: 0 } } },
    ];
    expect([...getArchivedSubtreeGroupIds(groups)]).toEqual([]);
  });

  it('includes archived group and descendants', () => {
    const groups: StudioGroup[] = [
      {
        id: 'root',
        name: 'Root',
        metadata: { archived: true, position: { x: 0, y: 0 } },
      },
      {
        id: 'child',
        name: 'Child',
        metadata: { parentGroupId: 'root', position: { x: 0, y: 0 } },
      },
    ];
    const hidden = getArchivedSubtreeGroupIds(groups);
    expect(hidden.has('root')).toBe(true);
    expect(hidden.has('child')).toBe(true);
  });

  it('does not hide sibling of archived root', () => {
    const groups: StudioGroup[] = [
      {
        id: 'arch',
        name: 'Arch',
        metadata: { archived: true, position: { x: 0, y: 0 } },
      },
      {
        id: 'sib',
        name: 'Sib',
        metadata: { position: { x: 100, y: 0 } },
      },
    ];
    const hidden = getArchivedSubtreeGroupIds(groups);
    expect(hidden.has('sib')).toBe(false);
  });
});
