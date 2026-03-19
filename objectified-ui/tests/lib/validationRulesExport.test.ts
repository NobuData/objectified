/**
 * Reference: GitHub #122 — validation rules export.
 */

import { describe, expect, it } from '@jest/globals';
import type { StudioClass } from '@lib/studio/types';
import {
  effectiveClassPropertyData,
  generateValidationRulesExport,
  formatValidationRulesJson,
} from '@lib/studio/validationRulesExport';

describe('effectiveClassPropertyData', () => {
  it('merges property_data with data override', () => {
    const merged = effectiveClassPropertyData({
      name: 'x',
      property_data: { type: 'string', format: 'email' },
      data: { minLength: 3 },
    });
    expect(merged.type).toBe('string');
    expect(merged.format).toBe('email');
    expect(merged.minLength).toBe(3);
  });
});

describe('generateValidationRulesExport', () => {
  it('includes exportKind and schemaVersion', () => {
    const doc = generateValidationRulesExport([], {
      versionId: 'vid',
      versionName: 'v1',
    });
    expect(doc.exportKind).toBe('objectified.validation-rules');
    expect(doc.schemaVersion).toBe('1.0.0');
    expect(doc.versionId).toBe('vid');
    expect(doc.classes).toEqual([]);
  });

  it('exports enum and format', () => {
    const classes: StudioClass[] = [
      {
        name: 'Order',
        properties: [
          {
            id: 'a',
            name: 'status',
            property_data: {
              type: 'string',
              enum: ['pending', 'done'],
            },
          },
        ],
      },
    ];
    const doc = generateValidationRulesExport(classes) as {
      classes: Array<{ properties: Record<string, { enum?: string[] }> }>;
    };
    expect(doc.classes[0].properties.status.enum).toEqual(['pending', 'done']);
  });

  it('nests object property rules', () => {
    const classes: StudioClass[] = [
      {
        name: 'Outer',
        properties: [
          { id: 'o1', name: 'addr', property_data: { type: 'object' } },
          {
            id: 'o2',
            name: 'street',
            parent_id: 'o1',
            property_data: { type: 'string' },
            data: { required: true },
          },
        ],
      },
    ];
    const doc = generateValidationRulesExport(classes) as {
      classes: Array<{
        properties: Record<
          string,
          { properties?: Record<string, { required?: boolean }> }
        >;
      }>;
    };
    const addr = doc.classes[0].properties.addr;
    expect(addr.properties?.street.required).toBe(true);
  });
});

describe('formatValidationRulesJson', () => {
  it('returns pretty-printed JSON', () => {
    const s = formatValidationRulesJson([]);
    expect(s.trim().startsWith('{')).toBe(true);
    expect(JSON.parse(s)).toHaveProperty('exportKind');
  });
});
