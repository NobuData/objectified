/**
 * Class-level x-* annotations for code generation (table names, ORM hints, etc.).
 * Reference: GitHub #123.
 */

import type { SchemaMode } from '@lib/studio/schemaMode';

/** OpenAPI / JSON Schema keywords managed by the class schema form (not codegen x-*). */
export const CLASS_SCHEMA_STRUCTURE_KEYS = new Set([
  'allOf',
  'oneOf',
  'anyOf',
  'discriminator',
  'additionalProperties',
  'unevaluatedProperties',
  'deprecated',
  'deprecationMessage',
  'minProperties',
  'maxProperties',
  'examples',
  'externalDocs',
]);

export interface ClassCodegenAnnotationRow {
  key: string;
  /** Raw value (JSON or plain string). */
  value: string;
}

export function isValidCodegenAnnotationKey(key: string): boolean {
  const k = key.trim();
  return /^x-[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(k);
}

export function parseCodegenAnnotationValue(raw: string): unknown {
  const s = raw.trim();
  if (!s) return '';
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/**
 * Extract x-* entries from a persisted class schema for the codegen annotations editor.
 */
export function classSchemaToCodegenRows(
  schema: Record<string, unknown> | undefined
): ClassCodegenAnnotationRow[] {
  if (!schema) return [];
  const rows: ClassCodegenAnnotationRow[] = [];
  for (const [k, v] of Object.entries(schema)) {
    if (!k.startsWith('x-')) continue;
    if (typeof v === 'string') {
      rows.push({ key: k, value: v });
    } else {
      rows.push({ key: k, value: JSON.stringify(v) });
    }
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

export function buildCodegenAnnotationsObject(
  rows: ClassCodegenAnnotationRow[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { key, value } of rows) {
    const k = key.trim();
    if (!isValidCodegenAnnotationKey(k)) continue;
    out[k] = parseCodegenAnnotationValue(value);
  }
  return out;
}

/**
 * Merge structural OpenAPI fields, codegen x-* rows, and preserve other keys from the initial schema.
 */
export function mergeClassSchemaForSave(options: {
  initialSchema?: Record<string, unknown>;
  structural: Record<string, unknown> | undefined | null;
  schemaMode: SchemaMode;
  codegenRows: ClassCodegenAnnotationRow[];
}): Record<string, unknown> | undefined {
  const struct = options.structural && Object.keys(options.structural).length > 0
    ? options.structural
    : {};
  const { initialSchema = {}, schemaMode, codegenRows } = options;
  const ann = buildCodegenAnnotationsObject(codegenRows);
  const base: Record<string, unknown> = { ...initialSchema };

  for (const k of Object.keys(base)) {
    if (k.startsWith('x-')) {
      delete base[k];
    }
  }

  if (schemaMode === 'openapi') {
    for (const sk of CLASS_SCHEMA_STRUCTURE_KEYS) {
      delete base[sk];
    }
    const merged: Record<string, unknown> = { ...base, ...struct, ...ann };
    if (Object.keys(merged).length === 0) {
      return undefined;
    }
    return merged;
  }

  const sqlMerged: Record<string, unknown> = { ...base, ...ann };
  if (Object.keys(sqlMerged).length === 0) {
    return undefined;
  }
  return sqlMerged;
}
