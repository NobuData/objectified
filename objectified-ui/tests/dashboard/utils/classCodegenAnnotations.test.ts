/**
 * Reference: GitHub #123 — class schema codegen annotations.
 */

import { describe, expect, it } from '@jest/globals';
import {
  buildCodegenAnnotationsObject,
  classSchemaToCodegenRows,
  isValidCodegenAnnotationKey,
  mergeClassSchemaForSave,
} from '@/app/dashboard/utils/classCodegenAnnotations';

describe('classCodegenAnnotations', () => {
  it('validates x-* keys', () => {
    expect(isValidCodegenAnnotationKey('x-db-table')).toBe(true);
    expect(isValidCodegenAnnotationKey('x-orm-model')).toBe(true);
    expect(isValidCodegenAnnotationKey('bad')).toBe(false);
    expect(isValidCodegenAnnotationKey('x-')).toBe(false);
  });

  it('round-trips rows to object', () => {
    const obj = buildCodegenAnnotationsObject([
      { key: 'x-db-table', value: 'users' },
      { key: 'x-orm-hint', value: '{"a":1}' },
    ]);
    expect(obj['x-db-table']).toBe('users');
    expect(obj['x-orm-hint']).toEqual({ a: 1 });
  });

  it('extracts x-* rows from class schema', () => {
    const rows = classSchemaToCodegenRows({
      allOf: [],
      'x-db-table': 't1',
      'x-flag': true,
    } as Record<string, unknown>);
    expect(rows.some((r) => r.key === 'x-db-table' && r.value === 't1')).toBe(true);
    expect(rows.some((r) => r.key === 'x-flag' && r.value === 'true')).toBe(true);
  });

  it('mergeClassSchemaForSave combines openapi structural and annotations', () => {
    const merged = mergeClassSchemaForSave({
      initialSchema: { 'x-old': 'gone', foo: 'bar' },
      structural: { deprecated: true },
      schemaMode: 'openapi',
      codegenRows: [{ key: 'x-db-table', value: 'accounts' }],
    });
    expect(merged?.deprecated).toBe(true);
    expect(merged?.foo).toBe('bar');
    expect(merged?.['x-db-table']).toBe('accounts');
    expect(merged?.['x-old']).toBeUndefined();
  });

  it('mergeClassSchemaForSave sql mode keeps non-structural keys and annotations', () => {
    const merged = mergeClassSchemaForSave({
      initialSchema: { allOf: [{ $ref: '#/components/schemas/X' }], keep: 1 },
      structural: undefined,
      schemaMode: 'sql',
      codegenRows: [{ key: 'x-db-table', value: 'sql_users' }],
    });
    expect(merged?.['x-db-table']).toBe('sql_users');
    expect(merged?.keep).toBe(1);
    expect(Array.isArray(merged?.allOf)).toBe(true);
  });
});
