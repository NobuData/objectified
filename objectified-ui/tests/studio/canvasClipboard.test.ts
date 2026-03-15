/**
 * Unit tests for canvas copy/paste/duplicate (GitHub #97).
 */

import {
  getUniqueName,
  cloneClassesForPaste,
  PASTE_OFFSET,
} from '@lib/studio/canvasClipboard';
import type { StudioClass } from '@lib/studio/types';

describe('getUniqueName', () => {
  it('returns name when not in use', () => {
    expect(getUniqueName('User', new Set())).toBe('User');
    expect(getUniqueName('User', new Set(['other']))).toBe('User');
  });

  it('returns name (copy) when name is in use', () => {
    expect(getUniqueName('User', new Set(['user']))).toBe('User (copy)');
  });

  it('returns name (copy 2) when name and name (copy) are in use', () => {
    const used = new Set(['user', 'user (copy)']);
    expect(getUniqueName('User', used)).toBe('User (copy 2)');
  });

  it('is case-insensitive', () => {
    expect(getUniqueName('User', new Set(['user']))).toBe('User (copy)');
  });

  it('handles empty or whitespace base name', () => {
    expect(getUniqueName('', new Set())).toBe('Unnamed class');
    expect(getUniqueName('  ', new Set())).toBe('Unnamed class');
  });
});

describe('cloneClassesForPaste', () => {
  it('returns new classes with localId and offset position', () => {
    const clipboard: StudioClass[] = [
      {
        localId: 'orig-1',
        name: 'A',
        properties: [],
        canvas_metadata: { position: { x: 10, y: 20 } },
      },
    ];
    const result = cloneClassesForPaste(clipboard, [], PASTE_OFFSET);
    expect(result).toHaveLength(1);
    expect(result[0].localId).toBeDefined();
    expect(result[0].localId).not.toBe('orig-1');
    expect(result[0].id).toBeUndefined();
    expect(result[0].name).toBe('A');
    expect(result[0].canvas_metadata?.position).toEqual({
      x: 10 + PASTE_OFFSET.x,
      y: 20 + PASTE_OFFSET.y,
    });
  });

  it('assigns unique names when names collide', () => {
    const clipboard: StudioClass[] = [
      { localId: '1', name: 'User', properties: [], canvas_metadata: { position: { x: 0, y: 0 } } },
      { localId: '2', name: 'User', properties: [], canvas_metadata: { position: { x: 0, y: 0 } } },
    ];
    const result = cloneClassesForPaste(clipboard, ['User'], PASTE_OFFSET);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('User (copy)');
    expect(result[1].name).toBe('User (copy 2)');
  });

  it('remaps $ref in property data when target is in pasted set', () => {
    const clipboard: StudioClass[] = [
      { localId: 'c1', name: 'User', properties: [], canvas_metadata: { position: { x: 0, y: 0 } } },
      {
        localId: 'c2',
        name: 'Order',
        properties: [
          {
            name: 'customer',
            data: { $ref: '#/components/schemas/User' },
          },
        ],
        canvas_metadata: { position: { x: 100, y: 0 } },
      },
    ];
    const result = cloneClassesForPaste(clipboard, ['User'], PASTE_OFFSET);
    expect(result).toHaveLength(2);
    const orderCopy = result.find((c) => c.name === 'Order');
    expect(orderCopy).toBeDefined();
    expect(orderCopy!.properties[0].data).toEqual({
      $ref: '#/components/schemas/User (copy)',
    });
  });

  it('leaves $ref unchanged when target is not in pasted set', () => {
    const clipboard: StudioClass[] = [
      {
        localId: 'c1',
        name: 'Order',
        properties: [
          {
            name: 'customer',
            data: { $ref: '#/components/schemas/ExternalClass' },
          },
        ],
        canvas_metadata: { position: { x: 0, y: 0 } },
      },
    ];
    const result = cloneClassesForPaste(clipboard, ['ExternalClass'], PASTE_OFFSET);
    expect(result).toHaveLength(1);
    expect(result[0].properties[0].data).toEqual({
      $ref: '#/components/schemas/ExternalClass',
    });
  });

  it('preserves #/$defs/ prefix when remapping $ref in property data', () => {
    const clipboard: StudioClass[] = [
      { localId: 'c1', name: 'Address', properties: [], canvas_metadata: { position: { x: 0, y: 0 } } },
      {
        localId: 'c2',
        name: 'Person',
        properties: [
          {
            name: 'home',
            data: { $ref: '#/$defs/Address' },
          },
        ],
        canvas_metadata: { position: { x: 100, y: 0 } },
      },
    ];
    const result = cloneClassesForPaste(clipboard, ['Address'], PASTE_OFFSET);
    expect(result).toHaveLength(2);
    const personCopy = result.find((c) => c.name === 'Person');
    expect(personCopy).toBeDefined();
    // The $defs prefix must be preserved, not rewritten to #/components/schemas/
    expect(personCopy!.properties[0].data).toEqual({
      $ref: '#/$defs/Address (copy)',
    });
  });

  it('preserves #/components/schemas/ prefix when remapping $ref in property data', () => {
    const clipboard: StudioClass[] = [
      { localId: 'c1', name: 'Item', properties: [], canvas_metadata: { position: { x: 0, y: 0 } } },
      {
        localId: 'c2',
        name: 'Cart',
        properties: [
          {
            name: 'product',
            data: { $ref: '#/components/schemas/Item' },
          },
        ],
        canvas_metadata: { position: { x: 100, y: 0 } },
      },
    ];
    const result = cloneClassesForPaste(clipboard, ['Item'], PASTE_OFFSET);
    expect(result).toHaveLength(2);
    const cartCopy = result.find((c) => c.name === 'Cart');
    expect(cartCopy).toBeDefined();
    expect(cartCopy!.properties[0].data).toEqual({
      $ref: '#/components/schemas/Item (copy)',
    });
  });
});
