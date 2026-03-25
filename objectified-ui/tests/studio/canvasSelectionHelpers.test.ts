import { describe, expect, it } from '@jest/globals';
import {
  filterVisibleClassIdsByGroup,
  filterVisibleClassIdsByTag,
} from '@lib/studio/canvasSelectionHelpers';
import type { StudioClass } from '@lib/studio/types';

describe('canvasSelectionHelpers', () => {
  it('filterVisibleClassIdsByGroup keeps only members of the group', () => {
    const visible = ['a', 'b', 'c'];
    const map = new Map<string, string>([
      ['a', 'g1'],
      ['b', 'g2'],
      ['c', 'g1'],
    ]);
    expect(filterVisibleClassIdsByGroup(visible, map, 'g1').sort()).toEqual([
      'a',
      'c',
    ]);
  });

  it('filterVisibleClassIdsByTag matches tags case-insensitively', () => {
    const visible = new Set(['id1', 'id2']);
    const classes: StudioClass[] = [
      {
        localId: 'id1',
        name: 'One',
        tags: ['Alpha', 'beta'],
      } as StudioClass,
      {
        localId: 'id2',
        name: 'Two',
        tags: ['gamma'],
      } as StudioClass,
    ];
    expect(filterVisibleClassIdsByTag(visible, classes, 'ALPHA')).toEqual(['id1']);
    expect(filterVisibleClassIdsByTag(visible, classes, 'Beta')).toEqual(['id1']);
    expect(filterVisibleClassIdsByTag(visible, classes, '  gamma  ')).toEqual([
      'id2',
    ]);
  });
});
