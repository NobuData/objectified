/**
 * Code generation from studio class/property graph (TypeScript, Prisma, GraphQL, Go, Pydantic).
 * Custom Mustache templates receive the view from buildCodegenMustacheView().
 *
 * Reference: GitHub #119 — configurable code generation templates.
 * Reference: GitHub #123 — class/property x-* annotations (table, column, serialization, Mustache).
 */

import type { StudioClass, StudioClassProperty } from './types';
import { getStableClassId } from './types';
import { parseClassNameFromRef } from './canvasClassRefEdges';
import { exportAsSqlDdl } from './canvasExportFormats';

/**
 * Convert a string to a safe identifier by replacing invalid characters with
 * underscores and prepending an underscore if the first character is a digit.
 * Retains alphanumerics, `_`, and `$`.
 */
export function toSafeIdentifier(name: string): string {
  const s = (name ?? '').trim();
  if (!s) return '_';
  let safe = s.replace(/[^a-zA-Z0-9_$]/g, '_');
  if (/^[0-9]/.test(safe)) safe = `_${safe}`;
  return safe;
}

export function toSnakeCase(input: string): string {
  const s = (input ?? '').trim();
  if (!s) return '';
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function getPropertySchema(prop: StudioClassProperty): Record<string, unknown> {
  const base = (prop.property_data ?? {}) as Record<string, unknown>;
  const overlay = (prop.data ?? {}) as Record<string, unknown>;
  return { ...base, ...overlay };
}

function isPropertyRequired(propSchema: Record<string, unknown>): boolean {
  return propSchema['x-required'] === true;
}

/** x-* keys reserved for canvas/refs; excluded from public annotation maps. */
const INTERNAL_PROP_X_KEYS = new Set([
  'x-order',
  'x-ref-class-id',
  'x-ref-class-name',
  'x-ref-storage',
  'x-required',
  'x-ref-class-ref',
]);

function firstString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function collectPublicXAnnotations(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith('x-')) continue;
    if (INTERNAL_PROP_X_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function annotationsToMustacheList(obj: Record<string, unknown>): { key: string; value: string }[] {
  return Object.entries(obj)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
}

function getRefTarget(propSchema: Record<string, unknown>): {
  refClassId?: string;
  refClassName?: string;
} {
  const refClassId =
    typeof propSchema['x-ref-class-id'] === 'string' ? propSchema['x-ref-class-id'].trim() : '';
  const refClassName =
    typeof propSchema['x-ref-class-name'] === 'string' ? propSchema['x-ref-class-name'].trim() : '';
  const refStr = typeof propSchema.$ref === 'string' ? propSchema.$ref.trim() : '';
  const parsedName = refStr ? parseClassNameFromRef(refStr) : undefined;
  return {
    ...(refClassId ? { refClassId } : {}),
    ...(refClassName ? { refClassName } : parsedName ? { refClassName: parsedName } : {}),
  };
}

function mapJsonSchemaTypeToBase(
  typeVal: unknown
): 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object' | 'unknown' {
  if (Array.isArray(typeVal)) {
    const nonNull = typeVal.filter((t) => t !== 'null');
    if (nonNull.length === 1) return mapJsonSchemaTypeToBase(nonNull[0]);
    return 'unknown';
  }
  switch (typeVal) {
    case 'string':
      return 'string';
    case 'integer':
      return 'integer';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return 'unknown';
  }
}

export interface CodegenField {
  /** Original property name */
  name: string;
  snake: string;
  optional: boolean;
  description?: string;
  isRefId: boolean;
  refModelName?: string;
  refModelSafeName?: string;
  refModelSnake?: string;
  baseType: ReturnType<typeof mapJsonSchemaTypeToBase>;
  /** Physical DB column (respects x-db-column / x-column-name). */
  dbColumn: string;
  /** JSON / API name (x-serialization-name / x-json-name or default). */
  jsonName: string;
  /** Public x-* annotations on the merged property schema. */
  annotations: Record<string, unknown>;
}

export interface CodegenClassModel {
  name: string;
  /** Safe identifier version of name (invalid chars replaced with underscores). */
  safeName: string;
  snake: string;
  id: string;
  fields: CodegenField[];
  /** DB table from x-db-table / x-table-name when set. */
  dbTable: string;
  annotations: Record<string, unknown>;
}

function buildClassModels(classes: StudioClass[]): CodegenClassModel[] {
  const nameById = new Map<string, string>();
  const nameByLower = new Map<string, string>();
  const seenLower = new Set<string>();
  const duplicateLower = new Set<string>();

  for (const c of classes) {
    const n = (c.name ?? '').trim();
    if (!n) continue;
    const lower = n.toLowerCase();
    if (seenLower.has(lower)) {
      duplicateLower.add(lower);
      console.warn(`[codeGenerationEngine] Duplicate class name (case-insensitive): "${n}" — skipping for ref resolution`);
    } else {
      seenLower.add(lower);
    }
    const id = getStableClassId(c);
    if (id) nameById.set(id, n);
    if (!duplicateLower.has(lower)) {
      nameByLower.set(lower, n);
    }
  }

  const models: CodegenClassModel[] = [];
  for (const cls of classes) {
    const clsName = (cls.name ?? '').trim();
    if (!clsName) continue;
    const clsId = getStableClassId(cls);
    const classSchema = (cls.schema ?? {}) as Record<string, unknown>;
    const dbTable = firstString(classSchema, 'x-db-table', 'x-table-name');
    const classAnnotations = collectPublicXAnnotations(classSchema);
    const fields: CodegenField[] = [];

    for (const prop of cls.properties ?? []) {
      const propName = (prop.name ?? '').trim();
      if (!propName) continue;
      const schema = getPropertySchema(prop);
      const required = isPropertyRequired(schema);
      const { refClassId, refClassName } = getRefTarget(schema);
      const refStorage =
        typeof schema['x-ref-storage'] === 'string' ? schema['x-ref-storage'] : '';
      const isIdRef =
        refStorage === 'id' || (refStorage === '' && (refClassId || refClassName));

      let refModelName: string | undefined;
      if (isIdRef && (refClassId || refClassName)) {
        refModelName =
          (refClassId ? nameById.get(refClassId) : undefined) ??
          (refClassName ? nameByLower.get(refClassName.toLowerCase()) ?? refClassName : undefined);
      }

      const propSnake = toSnakeCase(propName) || propName.toLowerCase();
      const refCol = propSnake.endsWith('_id') ? propSnake : `${propSnake}_id`;
      const defaultDbCol = isIdRef && refModelName ? refCol : propSnake;
      const dbColumn =
        firstString(schema, 'x-db-column', 'x-column-name') || defaultDbCol;
      const jsonName =
        firstString(schema, 'x-serialization-name', 'x-json-name') || defaultDbCol;

      fields.push({
        name: propName,
        snake: propSnake,
        optional: !required,
        description: typeof prop.description === 'string' ? prop.description : undefined,
        isRefId: Boolean(isIdRef && refModelName),
        refModelName,
        refModelSafeName: refModelName ? toSafeIdentifier(refModelName) : undefined,
        refModelSnake: refModelName ? toSnakeCase(refModelName) : undefined,
        baseType: mapJsonSchemaTypeToBase(schema.type),
        dbColumn,
        jsonName,
        annotations: collectPublicXAnnotations(schema),
      });
    }

    models.push({
      name: clsName,
      safeName: toSafeIdentifier(clsName),
      snake: toSnakeCase(clsName) || clsName.toLowerCase(),
      id: clsId,
      fields,
      dbTable,
      annotations: classAnnotations,
    });
  }
  return models;
}

function escapeTsComment(s: string): string {
  return s.replace(/\*\//g, '*\\/');
}

/** TypeScript interfaces from the schema graph. */
export function generateTypeScript(classes: StudioClass[]): string {
  const models = buildClassModels(classes);
  const lines: string[] = [
    '// Generated by Objectified — TypeScript interfaces',
    '',
  ];
  for (const m of models) {
    const safeName = m.safeName;
    const nameComment = safeName !== m.name ? ` // original: ${m.name}` : '';
    lines.push(`export interface ${safeName} {${nameComment}`);
    lines.push('  id: string;');
    for (const f of m.fields) {
      const propIdent = toSafeIdentifier(f.jsonName.replace(/[^a-zA-Z0-9_$]/g, '_'));
      if (f.isRefId && f.refModelName) {
        const opt = f.optional ? '?' : '';
        lines.push(`  ${propIdent}${opt}: string;`);
      } else {
        let ts: string;
        switch (f.baseType) {
          case 'string':
            ts = 'string';
            break;
          case 'integer':
          case 'number':
            ts = 'number';
            break;
          case 'boolean':
            ts = 'boolean';
            break;
          case 'array':
            ts = 'unknown[]';
            break;
          case 'object':
            ts = 'Record<string, unknown>';
            break;
          default:
            ts = 'unknown';
        }
        const opt = f.optional ? '?' : '';
        const comment = f.description ? ` /** ${escapeTsComment(f.description)} */` : '';
        lines.push(`  ${propIdent}${opt}: ${ts};${comment}`);
      }
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function relationFieldName(refModel: string, propSnake: string): string {
  const base = refModel.charAt(0).toLowerCase() + refModel.slice(1);
  return `${base}_${propSnake}`;
}

/** Prisma schema fragment (models only). */
export function generatePrisma(classes: StudioClass[]): string {
  const models = buildClassModels(classes);
  const lines: string[] = [
    '// Generated by Objectified — Prisma models (merge into schema.prisma)',
    '',
  ];
  for (const m of models) {
    const safeName = m.safeName;
    const nameComment = safeName !== m.name ? ` // original: ${m.name}` : '';
    const refCounts = new Map<string, number>();
    for (const f of m.fields) {
      if (f.isRefId && f.refModelSafeName) {
        refCounts.set(f.refModelSafeName, (refCounts.get(f.refModelSafeName) ?? 0) + 1);
      }
    }
    lines.push(`model ${safeName} {${nameComment}`);
    lines.push('  id String @id @default(uuid())');
    for (const f of m.fields) {
      if (f.isRefId && f.refModelName && f.refModelSafeName) {
        const fieldName = f.snake.endsWith('_id') ? f.snake : `${f.snake}_id`;
        const mapCol = f.dbColumn !== fieldName ? ` @map("${f.dbColumn.replace(/"/g, '\\"')}")` : '';
        const opt = f.optional ? '?' : '';
        const multi = (refCounts.get(f.refModelSafeName) ?? 0) > 1;
        const relName = multi ? `"${safeName}_${f.snake}_to_${f.refModelSafeName}", ` : '';
        const relField = relationFieldName(f.refModelSafeName, f.snake);
        lines.push(`  ${fieldName} String${opt}${mapCol}`);
        lines.push(
          `  ${relField} ${f.refModelSafeName}${f.optional ? '?' : ''} @relation(${relName}fields: [${fieldName}], references: [id])`
        );
      } else {
        let prismaT: string;
        switch (f.baseType) {
          case 'string':
            prismaT = 'String';
            break;
          case 'integer':
            prismaT = 'Int';
            break;
          case 'number':
            prismaT = 'Float';
            break;
          case 'boolean':
            prismaT = 'Boolean';
            break;
          case 'array':
          case 'object':
          default:
            prismaT = 'Json';
        }
        const opt = f.optional ? '?' : '';
        const mapCol = f.dbColumn !== f.snake ? ` @map("${f.dbColumn.replace(/"/g, '\\"')}")` : '';
        lines.push(`  ${f.snake} ${prismaT}${opt}${mapCol}`);
      }
    }
    if (m.dbTable) {
      lines.push(`  @@map("${m.dbTable.replace(/"/g, '\\"')}")`);
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** GraphQL object types (SDL). */
export function generateGraphQL(classes: StudioClass[]): string {
  const models = buildClassModels(classes);
  const needsJsonScalar = models.some((m) =>
    m.fields.some(
      (f) => !f.isRefId && (f.baseType === 'array' || f.baseType === 'object' || f.baseType === 'unknown')
    )
  );
  const lines: string[] = ['# Generated by Objectified — GraphQL SDL', ''];
  if (needsJsonScalar) {
    lines.push('scalar JSON', '');
  }
  for (const m of models) {
    const safeName = m.safeName;
    const nameComment = safeName !== m.name ? ` # original: ${m.name}` : '';
    lines.push(`type ${safeName} {${nameComment}`);
    lines.push('  id: ID!');
    for (const f of m.fields) {
      const gqlField = sanitizeIdentifier(f.jsonName);
      if (f.isRefId && f.refModelName && f.refModelSafeName) {
        const bang = f.optional ? '' : '!';
        lines.push(`  ${gqlField}: ID${bang}`);
      } else {
        let g: string;
        switch (f.baseType) {
          case 'string':
            g = 'String';
            break;
          case 'integer':
            g = 'Int';
            break;
          case 'number':
            g = 'Float';
            break;
          case 'boolean':
            g = 'Boolean';
            break;
          case 'array':
            g = 'JSON';
            break;
          case 'object':
            g = 'JSON';
            break;
          default:
            g = 'JSON';
        }
        const bang = f.optional ? '' : '!';
        lines.push(`  ${gqlField}: ${g}${bang}`);
      }
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Sanitize an arbitrary string into a safe identifier (no `$`, no leading digit).
 * Used for both GraphQL field names and Go identifier segments derived from
 * user-supplied column/serialization overrides.
 */
function sanitizeIdentifier(value: string): string {
  let safe = (value ?? '').replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(safe)) safe = `_${safe}`;
  return safe || '_';
}

function goExportedField(snake: string): string {
  const parts = snake.split('_').filter(Boolean);
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/** Go structs (uuid uses github.com/google/uuid). */
export function generateGo(classes: StudioClass[]): string {
  const models = buildClassModels(classes);
  const needsRawMessage = models.some((m) =>
    m.fields.some(
      (f) => !f.isRefId && (f.baseType === 'array' || f.baseType === 'object' || f.baseType === 'unknown')
    )
  );
  const lines: string[] = [
    '// Generated by Objectified — Go structs',
    '// import "github.com/google/uuid"',
  ];
  if (needsRawMessage) {
    lines.push('// import "encoding/json"');
  }
  lines.push('');
  for (const m of models) {
    const safeName = m.safeName;
    const nameComment = safeName !== m.name ? ` // original: ${m.name}` : '';
    lines.push(`type ${safeName} struct {${nameComment}`);
    lines.push('\tID uuid.UUID `json:"id"`');
    for (const f of m.fields) {
      const jkey = f.jsonName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      if (f.isRefId && f.refModelName) {
        const goName = goExportedField(sanitizeIdentifier(f.dbColumn));
        const ptr = f.optional ? '*' : '';
        lines.push(`\t${goName} ${ptr}uuid.UUID \`json:"${jkey}"\``);
      } else {
        let goT: string;
        switch (f.baseType) {
          case 'string':
            goT = 'string';
            break;
          case 'integer':
            goT = 'int64';
            break;
          case 'number':
            goT = 'float64';
            break;
          case 'boolean':
            goT = 'bool';
            break;
          case 'array':
          case 'object':
          default:
            goT = 'json.RawMessage';
        }
        const goName = goExportedField(sanitizeIdentifier(f.dbColumn));
        if (f.optional && goT !== 'json.RawMessage') {
          lines.push(`\t${goName} *${goT} \`json:"${jkey}"\``);
        } else {
          const optJson = f.optional ? ',omitempty' : '';
          lines.push(`\t${goName} ${goT} \`json:"${jkey}${optJson}"\``);
        }
      }
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** Pydantic v2 models. */
export function generatePydantic(classes: StudioClass[]): string {
  const models = buildClassModels(classes);
  const lines: string[] = [
    '# Generated by Objectified — Pydantic v2',
    'from __future__ import annotations',
    'from uuid import UUID',
    'from typing import Any, Optional',
    'from pydantic import BaseModel',
    '',
  ];
  for (const m of models) {
    const safeName = m.safeName;
    const nameComment = safeName !== m.name ? `  # original: ${m.name}` : '';
    lines.push(`class ${safeName}(BaseModel):${nameComment}`);
    lines.push('    id: UUID');
    for (const f of m.fields) {
      if (f.isRefId && f.refModelName && f.refModelSafeName) {
        const col = f.snake.endsWith('_id') ? f.snake : `${f.snake}_id`;
        const opt = f.optional ? 'Optional[UUID]' : 'UUID';
        const defaultPart = f.optional ? ' = None' : '';
        lines.push(`    ${col}: ${opt}${defaultPart}`);
      } else {
        let py: string;
        switch (f.baseType) {
          case 'string':
            py = 'str';
            break;
          case 'integer':
            py = 'int';
            break;
          case 'number':
            py = 'float';
            break;
          case 'boolean':
            py = 'bool';
            break;
          case 'array':
          case 'object':
          default:
            py = 'Any';
        }
        if (f.optional) {
          lines.push(`    ${f.snake}: Optional[${py}] = None`);
        } else {
          lines.push(`    ${f.snake}: ${py}`);
        }
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** PostgreSQL DDL from the same graph as canvas SQL export. */
export function generateSqlDdl(classes: StudioClass[]): string {
  return exportAsSqlDdl(classes);
}

/** View for Mustache custom templates. */
export function buildCodegenMustacheView(classes: StudioClass[]): Record<string, unknown> {
  const models = buildClassModels(classes);
  return {
    classes: models.map((m) => ({
      name: m.name,
      snake: m.snake,
      id: m.id,
      dbTable: m.dbTable,
      annotations: m.annotations,
      annotationRows: annotationsToMustacheList(m.annotations),
      properties: m.fields.map((f) => {
        const col = f.dbColumn;
        return {
          name: f.name,
          snake: f.snake,
          column: col,
          dbColumn: f.dbColumn,
          jsonName: f.jsonName,
          annotations: f.annotations,
          annotationRows: annotationsToMustacheList(f.annotations),
          optional: f.optional,
          required: !f.optional,
          description: f.description ?? '',
          isRefId: f.isRefId,
          refModel: f.refModelName ?? '',
          refSnake: f.refModelSnake ?? '',
          tsType:
            f.isRefId && f.refModelName
              ? 'string'
              : f.baseType === 'string'
                ? 'string'
                : f.baseType === 'integer' || f.baseType === 'number'
                  ? 'number'
                  : f.baseType === 'boolean'
                    ? 'boolean'
                    : f.baseType === 'array'
                      ? 'unknown[]'
                      : f.baseType === 'object'
                        ? 'Record<string, unknown>'
                        : 'unknown',
          prismaType:
            f.isRefId && f.refModelName
              ? 'String'
              : f.baseType === 'string'
                ? 'String'
                : f.baseType === 'integer'
                  ? 'Int'
                  : f.baseType === 'number'
                    ? 'Float'
                    : f.baseType === 'boolean'
                      ? 'Boolean'
                      : 'Json',
          graphqlType:
            f.isRefId && f.refModelName
              ? 'ID'
              : f.baseType === 'string'
                ? 'String'
                : f.baseType === 'integer'
                  ? 'Int'
                  : f.baseType === 'number'
                    ? 'Float'
                    : f.baseType === 'boolean'
                      ? 'Boolean'
                      : 'JSON',
          goType:
            f.isRefId && f.refModelName
              ? 'uuid.UUID'
              : f.baseType === 'string'
                ? 'string'
                : f.baseType === 'integer'
                  ? 'int64'
                  : f.baseType === 'number'
                    ? 'float64'
                    : f.baseType === 'boolean'
                      ? 'bool'
                      : 'json.RawMessage',
          pydanticType:
            f.isRefId && f.refModelName
              ? 'UUID'
              : f.baseType === 'string'
                ? 'str'
                : f.baseType === 'integer'
                  ? 'int'
                  : f.baseType === 'number'
                    ? 'float'
                    : f.baseType === 'boolean'
                      ? 'bool'
                      : 'Any',
        };
      }),
    })),
  };
}
