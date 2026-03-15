/**
 * Unit tests for class ref edge building (GitHub #81).
 */

import { buildClassRefEdges } from '@lib/studio/canvasClassRefEdges';
import type { StudioClass } from '@lib/studio/types';

describe('buildClassRefEdges', () => {
  it('returns empty array when no classes', () => {
    expect(buildClassRefEdges([])).toEqual([]);
  });

  it('returns empty array when classes have no refs in property data', () => {
    const classes: StudioClass[] = [
      {
        id: 'c1',
        name: 'A',
        properties: [{ name: 'x', data: { type: 'string' } }],
      },
      {
        id: 'c2',
        name: 'B',
        properties: [],
      },
    ];
    expect(buildClassRefEdges(classes)).toEqual([]);
  });

  it('builds one edge when one property has $ref to another class', () => {
    const classes: StudioClass[] = [
      { id: 'c1', name: 'User', properties: [] },
      {
        id: 'c2',
        name: 'Order',
        properties: [
          {
            name: 'customer',
            data: { $ref: '#/components/schemas/User' },
          },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('c2');
    expect(edges[0].target).toBe('c1');
    expect(edges[0].type).toBe('classRef');
    expect(edges[0].data?.refType).toBe('direct');
    expect(edges[0].data?.label).toBe('customer');
  });

  it('uses refType from property data when present', () => {
    const classes: StudioClass[] = [
      { id: 'c1', name: 'A', properties: [] },
      {
        id: 'c2',
        name: 'B',
        properties: [
          {
            name: 'link',
            data: {
              $ref: '#/$defs/A',
              refType: 'optional',
            },
          },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(1);
    expect(edges[0].data?.refType).toBe('optional');
  });

  it('accepts linkType and ref_type as refType keys', () => {
    const classes: StudioClass[] = [
      { id: 'c1', name: 'X', properties: [] },
      {
        id: 'c2',
        name: 'Y',
        properties: [
          {
            name: 'r',
            data: { $ref: '#/components/schemas/X', link_type: 'weak' },
          },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(1);
    expect(edges[0].data?.refType).toBe('weak');
  });

  it('builds multiple edges for multiple refs', () => {
    const classes: StudioClass[] = [
      { id: 'a', name: 'A', properties: [] },
      { id: 'b', name: 'B', properties: [] },
      {
        id: 'c',
        name: 'C',
        properties: [
          { name: 'toA', data: { $ref: '#/$defs/A' } },
          { name: 'toB', data: { $ref: '#/$defs/B' } },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(2);
    const targets = edges.map((e) => e.target).sort();
    expect(targets).toEqual(['a', 'b']);
    expect(edges.every((e) => e.source === 'c')).toBe(true);
  });

  it('ignores $ref that does not match any class name', () => {
    const classes: StudioClass[] = [
      { id: 'c1', name: 'User', properties: [] },
      {
        id: 'c2',
        name: 'Order',
        properties: [
          {
            name: 'other',
            data: { $ref: '#/components/schemas/ExternalThing' },
          },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toEqual([]);
  });

  it('does not create edge when source and target are the same class', () => {
    const classes: StudioClass[] = [
      {
        id: 'c1',
        name: 'Self',
        properties: [
          {
            name: 'parent',
            data: { $ref: '#/$defs/Self' },
          },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toEqual([]);
  });
});
