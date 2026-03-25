/**
 * Unit tests for class ref edge building (GitHub #81).
 */

import {
  buildClassRefEdges,
  buildDesignCanvasRefLayer,
  assignParallelOffsetsToRefEdges,
  getCardinalityLabel,
  isBrokenRefPlaceholderNodeId,
  parseClassNameFromRef,
  getRefClassIdFromData,
} from '@lib/studio/canvasClassRefEdges';
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
    expect(edges[0].data?.edit).toEqual({
      sourceClassId: 'c2',
      propertyName: 'customer',
    });
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

  it('builds edge using x-ref-class-id when present (stable id reference)', () => {
    const classes: StudioClass[] = [
      { id: 'id-user', name: 'User', properties: [] },
      {
        id: 'id-order',
        name: 'Order',
        properties: [
          {
            name: 'customer',
            data: {
              $ref: '#/components/schemas/User',
              'x-ref-class-id': 'id-user',
              refType: 'direct',
            },
          },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('id-order');
    expect(edges[0].target).toBe('id-user');
  });

  it('accepts all ref_type alias keys (refType, ref_type, linkType, link_type)', () => {
    // link_type
    const withLinkType: StudioClass[] = [
      { id: 'c1', name: 'X', properties: [] },
      {
        id: 'c2',
        name: 'Y',
        properties: [
          { name: 'r', data: { $ref: '#/components/schemas/X', link_type: 'weak' } },
        ],
      },
    ];
    expect(buildClassRefEdges(withLinkType)[0].data?.refType).toBe('weak');

    // refType
    const withRefType: StudioClass[] = [
      { id: 'c1', name: 'X', properties: [] },
      {
        id: 'c2',
        name: 'Y',
        properties: [
          { name: 'r', data: { $ref: '#/components/schemas/X', refType: 'optional' } },
        ],
      },
    ];
    expect(buildClassRefEdges(withRefType)[0].data?.refType).toBe('optional');

    // ref_type
    const withRefTypeSnake: StudioClass[] = [
      { id: 'c1', name: 'X', properties: [] },
      {
        id: 'c2',
        name: 'Y',
        properties: [
          { name: 'r', data: { $ref: '#/components/schemas/X', ref_type: 'bidirectional' } },
        ],
      },
    ];
    expect(buildClassRefEdges(withRefTypeSnake)[0].data?.refType).toBe('bidirectional');

    // linkType
    const withLinkTypeCamel: StudioClass[] = [
      { id: 'c1', name: 'X', properties: [] },
      {
        id: 'c2',
        name: 'Y',
        properties: [
          { name: 'r', data: { $ref: '#/components/schemas/X', linkType: 'weak' } },
        ],
      },
    ];
    expect(buildClassRefEdges(withLinkTypeCamel)[0].data?.refType).toBe('weak');
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

  it('matches $ref case-insensitively against class names', () => {
    const classes: StudioClass[] = [
      { id: 'c1', name: 'User', properties: [] },
      {
        id: 'c2',
        name: 'Order',
        properties: [
          { name: 'customer', data: { $ref: '#/components/schemas/user' } },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('c2');
    expect(edges[0].target).toBe('c1');
  });

  it('skips edges to duplicate normalized class names and warns', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const classes: StudioClass[] = [
      { id: 'a1', name: 'Widget', properties: [] },
      { id: 'a2', name: 'widget', properties: [] },
      {
        id: 'b1',
        name: 'Page',
        properties: [
          { name: 'w', data: { $ref: '#/components/schemas/Widget' } },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('widget')
    );
    warnSpy.mockRestore();
  });

  it('generates deterministic edge ids from source, target, and property name', () => {
    const classes: StudioClass[] = [
      { id: 'src', name: 'A', properties: [] },
      {
        id: 'tgt',
        name: 'B',
        properties: [
          { name: 'myProp', data: { $ref: '#/components/schemas/A' } },
        ],
      },
    ];
    const edges1 = buildClassRefEdges(classes);
    const edges2 = buildClassRefEdges([...classes]);
    expect(edges1[0].id).toBe('class-ref-tgt--src--myProp');
    expect(edges1[0].id).toBe(edges2[0].id);
  });

  it('uses target class name as fallback in edge id when property has no name', () => {
    const classes: StudioClass[] = [
      { id: 'src', name: 'Target', properties: [] },
      {
        id: 'tgt',
        name: 'Source',
        properties: [
          { name: '', data: { $ref: '#/components/schemas/Target' } },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(1);
    // Fallback: normalized target name ('target') is used when property name is empty
    expect(edges[0].id).toBe('class-ref-tgt--src--target');
    // Should be stable across repeated calls
    expect(buildClassRefEdges([...classes])[0].id).toBe(edges[0].id);
  });

  it('sets markerEnd on all edges and markerStart only for bidirectional', () => {
    const classes: StudioClass[] = [
      { id: 'c1', name: 'A', properties: [] },
      {
        id: 'c2',
        name: 'B',
        properties: [
          { name: 'toA', data: { $ref: '#/components/schemas/A', refType: 'direct' } },
        ],
      },
      {
        id: 'c3',
        name: 'C',
        properties: [
          { name: 'toA', data: { $ref: '#/components/schemas/A', refType: 'bidirectional' } },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    const direct = edges.find((e) => e.source === 'c2');
    const bidir = edges.find((e) => e.source === 'c3');
    expect(direct?.markerEnd).toBeDefined();
    expect(direct?.markerStart).toBeUndefined();
    expect(bidir?.markerEnd).toBeDefined();
    expect(bidir?.markerStart).toBeDefined();
  });

  it('resolves x-ref-class-id for target class with duplicate normalized name (skipped in nameToId)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Two classes with duplicate normalized names – neither appears in nameToId.
    // But the source can still use x-ref-class-id to resolve the target by stable id.
    const classes: StudioClass[] = [
      { id: 'dup-1', name: 'Widget', properties: [] },
      { id: 'dup-2', name: 'widget', properties: [] },
      {
        id: 'src',
        name: 'Page',
        properties: [
          {
            name: 'myWidget',
            data: {
              $ref: '#/components/schemas/Widget',
              'x-ref-class-id': 'dup-1',
            },
          },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    // x-ref-class-id 'dup-1' is in validIds (built from ALL classes), so the edge is created.
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('src');
    expect(edges[0].target).toBe('dup-1');
    warnSpy.mockRestore();
  });

  it('marks id-based storage as refBinding idRef (GitHub #232)', () => {
    const classes: StudioClass[] = [
      { id: 'c1', name: 'User', properties: [] },
      {
        id: 'c2',
        name: 'Order',
        properties: [
          {
            name: 'buyer_id',
            data: {
              'x-ref-storage': 'id',
              'x-ref-class-name': 'User',
              'x-ref-class-id': 'c1',
            },
          },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(1);
    expect(edges[0].data?.refBinding).toBe('idRef');
    expect(edges[0].data?.relationshipKind).toBe('association');
  });

  it('assigns parallel offsets for multiple edges between the same nodes (GitHub #233)', () => {
    const classes: StudioClass[] = [
      { id: 'a', name: 'A', properties: [] },
      {
        id: 'b',
        name: 'B',
        properties: [
          { name: 'r1', data: { $ref: '#/components/schemas/A' } },
          { name: 'r2', data: { $ref: '#/components/schemas/A', refType: 'optional' } },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(2);
    const offsets = edges.map((e) => e.data?.parallelOffset ?? 0).sort((x, y) => x - y);
    expect(offsets).toEqual([-8, 8]);
  });

  it('assignParallelOffsetsToRefEdges is stable for a single edge', () => {
    const { canvasEdges } = buildDesignCanvasRefLayer([
      { id: 'a', name: 'A', properties: [] },
      {
        id: 'b',
        name: 'B',
        properties: [{ name: 'x', data: { $ref: '#/components/schemas/A' } }],
      },
    ]);
    const again = assignParallelOffsetsToRefEdges(canvasEdges);
    expect(again[0]?.data?.parallelOffset).toBeUndefined();
  });

  it('adds inheritance edge from class schema allOf $ref (GitHub #232)', () => {
    const classes: StudioClass[] = [
      { id: 'parent', name: 'Animal', properties: [] },
      {
        id: 'child',
        name: 'Dog',
        schema: {
          allOf: [{ $ref: '#/components/schemas/Animal' }],
        },
        properties: [],
      },
    ];
    const edges = buildClassRefEdges(classes);
    const inherit = edges.find((e) => e.data?.relationshipKind === 'inheritance');
    expect(inherit).toBeDefined();
    expect(inherit!.source).toBe('child');
    expect(inherit!.target).toBe('parent');
    expect(inherit!.data?.label).toBe('extends');
  });

  it('creates broken-ref placeholder and canvas edge; buildClassRefEdges omits them (GitHub #232)', () => {
    const classes: StudioClass[] = [
      { id: 'c1', name: 'User', properties: [] },
      {
        id: 'c2',
        name: 'Order',
        properties: [
          {
            name: 'buyer_id',
            data: {
              'x-ref-storage': 'id',
              'x-ref-class-name': 'Ghost',
            },
          },
        ],
      },
    ];
    const layer = buildDesignCanvasRefLayer(classes);
    expect(layer.brokenRefPlaceholders).toHaveLength(1);
    expect(isBrokenRefPlaceholderNodeId(layer.brokenRefPlaceholders[0]!.id)).toBe(true);
    expect(layer.canvasEdges.some((e) => e.data?.brokenRef)).toBe(true);
    const exportEdges = buildClassRefEdges(classes);
    expect(exportEdges).toHaveLength(0);
  });

  it('builds edges from a source class with a blank name using x-ref-class-id', () => {
    // Source class has no name but a valid id; it should still generate edges via x-ref-class-id.
    const classes: StudioClass[] = [
      { id: 'target-id', name: 'Target', properties: [] },
      {
        id: 'source-id',
        name: '',
        properties: [
          {
            name: 'ref',
            data: {
              'x-ref-class-id': 'target-id',
            },
          },
        ],
      },
    ];
    const edges = buildClassRefEdges(classes);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('source-id');
    expect(edges[0].target).toBe('target-id');
  });
});

describe('getRefClassIdFromData', () => {
  it('returns null for undefined or empty data', () => {
    expect(getRefClassIdFromData(undefined)).toBeNull();
    expect(getRefClassIdFromData({})).toBeNull();
  });

  it('reads x-ref-class-id', () => {
    expect(getRefClassIdFromData({ 'x-ref-class-id': 'abc' })).toBe('abc');
  });

  it('reads refClassId (camelCase alias)', () => {
    expect(getRefClassIdFromData({ refClassId: 'xyz' })).toBe('xyz');
  });

  it('reads ref_class_id (snake_case alias)', () => {
    expect(getRefClassIdFromData({ ref_class_id: 'def' })).toBe('def');
  });

  it('returns null for empty string values', () => {
    expect(getRefClassIdFromData({ 'x-ref-class-id': '  ' })).toBeNull();
  });

  it('trims whitespace from the value', () => {
    expect(getRefClassIdFromData({ 'x-ref-class-id': '  id-123  ' })).toBe('id-123');
  });
});

describe('getCardinalityLabel', () => {
  it('returns 0..1 vs 1 for optional vs required scalar refs', () => {
    const cls: StudioClass = {
      id: 'x',
      name: 'A',
      schema: { required: ['req'] },
      properties: [],
    };
    expect(
      getCardinalityLabel({ type: 'string' }, 'opt', cls)
    ).toBe('0..1');
    expect(
      getCardinalityLabel({ type: 'string' }, 'req', cls)
    ).toBe('1');
  });

  it('returns 1..* for required array without maxItems', () => {
    const cls: StudioClass = {
      id: 'x',
      name: 'A',
      schema: { required: ['tags'] },
      properties: [],
    };
    expect(
      getCardinalityLabel({ type: 'array', items: { type: 'string' } }, 'tags', cls)
    ).toBe('1..*');
  });
});

describe('parseClassNameFromRef', () => {
  it('returns class name for #/components/schemas/ refs', () => {
    expect(parseClassNameFromRef('#/components/schemas/User')).toBe('User');
    expect(parseClassNameFromRef('#/components/schemas/OrderItem')).toBe('OrderItem');
  });

  it('returns class name for #/$defs/ refs', () => {
    expect(parseClassNameFromRef('#/$defs/Product')).toBe('Product');
  });

  it('returns undefined for non-standard ref formats (no fallback)', () => {
    expect(parseClassNameFromRef('https://example.com/schemas/User')).toBeUndefined();
    expect(parseClassNameFromRef('SomeName')).toBeUndefined();
    expect(parseClassNameFromRef('path/to/SomeName')).toBeUndefined();
  });

  it('returns undefined for empty or non-string values', () => {
    expect(parseClassNameFromRef('')).toBeUndefined();
    expect(parseClassNameFromRef('   ')).toBeUndefined();
    // @ts-expect-error testing invalid input
    expect(parseClassNameFromRef(null)).toBeUndefined();
    // @ts-expect-error testing invalid input
    expect(parseClassNameFromRef(undefined)).toBeUndefined();
  });

  it('trims whitespace from parsed class name', () => {
    expect(parseClassNameFromRef('#/components/schemas/  MyClass  ')).toBe('MyClass');
  });
});
