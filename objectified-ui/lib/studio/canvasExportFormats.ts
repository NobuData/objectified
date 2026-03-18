/**
 * Serialize canvas graph (classes + ref edges) to Mermaid, PlantUML, DOT, GraphML, JSON.
 * Reference: GitHub #92, #93 — export dialog and export wizard (include groups).
 */

import type { StudioClass, StudioClassProperty } from './types';
import { getStableClassId } from './types';
import { buildClassRefEdges, parseClassNameFromRef } from './canvasClassRefEdges';

export interface ExportGraphNode {
  id: string;
  name: string;
  /** Present when includeGroupInfo is true and class belongs to a group (GitHub #93). */
  groupId?: string;
}

export interface ExportGraphEdge {
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface ExportGraphOptions {
  /** When true, include group id on nodes that belong to a group. */
  includeGroupInfo?: boolean;
}

export interface ExportOpenApiOptions {
  title?: string;
  version?: string;
}

/** Build minimal graph from classes for export (node names + edges, optional groupId). */
function buildExportGraph(
  classes: StudioClass[],
  options?: ExportGraphOptions
): {
  nodes: ExportGraphNode[];
  edges: ExportGraphEdge[];
} {
  const includeGroupInfo = options?.includeGroupInfo ?? false;
  const nodes: ExportGraphNode[] = classes.map((c) => {
    const meta = c.canvas_metadata as { group?: string } | undefined;
    const node: ExportGraphNode = {
      id: getStableClassId(c),
      name: c.name ?? '',
    };
    if (includeGroupInfo && meta?.group) node.groupId = meta.group;
    return node;
  });
  const rfEdges = buildClassRefEdges(classes);
  const edges: ExportGraphEdge[] = rfEdges.map((e) => ({
    sourceId: e.source,
    targetId: e.target,
    label: (e.data as { label?: string })?.label,
  }));
  return { nodes, edges };
}

/** Escape string for use inside Mermaid/PlantUML/DOT labels. */
function escapeLabel(s: string): string {
  return s.replace(/[\]\["]/g, '\\$&').replace(/\n/g, ' ');
}

/** Export as Mermaid classDiagram. */
export function exportAsMermaid(
  classes: StudioClass[],
  options?: ExportGraphOptions
): string {
  const { nodes, edges } = buildExportGraph(classes, options);
  const nameById = new Map<string, string>(nodes.map((n) => [n.id, n.name]));
  const lines = ['classDiagram'];
  for (const n of nodes) {
    if (!n.name) continue;
    lines.push(`  class ${escapeLabel(n.name)}`);
  }
  for (const e of edges) {
    const src = nameById.get(e.sourceId) ?? e.sourceId;
    const tgt = nameById.get(e.targetId) ?? e.targetId;
    const label = e.label ? ` : ${escapeLabel(e.label)}` : '';
    lines.push(`  ${escapeLabel(src)} --> ${escapeLabel(tgt)}${label}`);
  }
  return lines.join('\n');
}

/** Export as PlantUML class diagram. */
export function exportAsPlantUML(
  classes: StudioClass[],
  options?: ExportGraphOptions
): string {
  const { nodes, edges } = buildExportGraph(classes, options);
  const lines = ['@startuml', 'skinparam classAttributeIconSize 0'];
  for (const n of nodes) {
    if (!n.name) continue;
    lines.push(`class "${n.name.replace(/"/g, '\\"')}" as ${n.id}`);
  }
  for (const e of edges) {
    const label = e.label ? ` : ${e.label.replace(/"/g, '\\"')}` : '';
    lines.push(`${e.sourceId} --> ${e.targetId}${label}`);
  }
  lines.push('@enduml');
  return lines.join('\n');
}

/** Export as DOT (Graphviz). */
export function exportAsDot(
  classes: StudioClass[],
  options?: ExportGraphOptions
): string {
  const { nodes, edges } = buildExportGraph(classes, options);
  const lines = ['digraph G {', '  rankdir=TB;'];
  for (const n of nodes) {
    if (!n.name) continue;
    const label = n.name.replace(/"/g, '\\"');
    lines.push(`  "${n.id}" [label="${label}"];`);
  }
  for (const e of edges) {
    const label = e.label ? ` [label="${e.label.replace(/"/g, '\\"')}"]` : '';
    lines.push(`  "${e.sourceId}" -> "${e.targetId}"${label};`);
  }
  lines.push('}');
  return lines.join('\n');
}

/** Export as GraphML. */
export function exportAsGraphML(
  classes: StudioClass[],
  options?: ExportGraphOptions
): string {
  const { nodes, edges } = buildExportGraph(classes, options);
  const hasGroupId = nodes.some((n) => n.groupId != null);
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">
  <key id="label" for="node" attr.name="label" attr.type="string"/>${hasGroupId ? '\n  <key id="groupId" for="node" attr.name="groupId" attr.type="string"/>' : ''}
  <graph id="G" edgedefault="directed">`;
  const nodeLines = nodes
    .filter((n) => n.name)
    .map((n) => {
      const label = n.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const groupData =
        n.groupId != null
          ? `<data key="groupId">${String(n.groupId).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</data>`
          : '';
      return `    <node id="${n.id}"><data key="label">${label}</data>${groupData}</node>`;
    });
  const edgeLines = edges.map(
    (e, i) => `    <edge id="e${i}" source="${e.sourceId}" target="${e.targetId}"/>`
  );
  const footer = `
  </graph>
</graphml>`;
  return [header, ...nodeLines, ...edgeLines, footer].join('\n');
}

/** Export as JSON (nodes + edges). */
export function exportAsJson(
  classes: StudioClass[],
  options?: ExportGraphOptions
): string {
  const { nodes, edges } = buildExportGraph(classes, options);
  return JSON.stringify(
    {
      nodes: nodes.filter((n) => n.name),
      edges,
    },
    null,
    2
  );
}

function toSnakeCase(input: string): string {
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

function getRefTarget(propSchema: Record<string, unknown>): { refClassId?: string; refClassName?: string } {
  const refClassId = typeof propSchema['x-ref-class-id'] === 'string' ? propSchema['x-ref-class-id'].trim() : '';
  const refClassName =
    typeof propSchema['x-ref-class-name'] === 'string' ? propSchema['x-ref-class-name'].trim() : '';
  const refStr = typeof propSchema.$ref === 'string' ? propSchema.$ref.trim() : '';
  const parsedName = refStr ? parseClassNameFromRef(refStr) : undefined;
  return {
    ...(refClassId ? { refClassId } : {}),
    ...(refClassName ? { refClassName } : parsedName ? { refClassName: parsedName } : {}),
  };
}

function stripNonOpenApiPropertyKeys(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...schema };
  delete out['x-order'];
  delete out['x-ref-class-id'];
  delete out['x-ref-class-name'];
  delete out['x-ref-storage'];
  // used only for property->required list conversion
  delete out['x-required'];
  // only remove 'required' when it is the internal boolean form; the array form is
  // a valid JSON Schema / OpenAPI keyword and must be preserved on object sub-schemas
  if (typeof out.required === 'boolean') delete out.required;
  return out;
}

/**
 * Export as an OpenAPI 3.1 document (JSON) using class/property schemas.
 * In OpenAPI mode, class `schema` (if present) is used as the base schema; otherwise
 * a basic object schema is synthesized from class properties.
 *
 * Reference: GitHub #117 — mode-specific export.
 */
export function exportAsOpenApi(
  classes: StudioClass[],
  options?: ExportOpenApiOptions
): string {
  const title = options?.title?.trim() || 'Objectified API';
  const version = options?.version?.trim() || '0.1.0';

  const schemas: Record<string, unknown> = {};
  const classNames = new Set<string>();
  const seenSchemaNames = new Map<string, boolean>(); // exact (case-sensitive) name → already emitted
  for (const c of classes) {
    const name = (c.name ?? '').trim();
    if (name) classNames.add(name.toLowerCase());
  }

  for (const cls of classes) {
    const name = (cls.name ?? '').trim();
    if (!name) continue;
    if (seenSchemaNames.has(name)) {
      console.warn(`[exportAsOpenApi] Duplicate schema name "${name}" – skipping second occurrence.`);
      continue;
    }
    seenSchemaNames.set(name, true);

    const baseSchema =
      (cls.schema as Record<string, unknown> | undefined) ?? ({ type: 'object' } as Record<string, unknown>);

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const prop of (cls.properties ?? []) as StudioClassProperty[]) {
      const propName = (prop.name ?? '').trim();
      if (!propName) continue;
      const propSchemaRaw = getPropertySchema(prop);
      if (isPropertyRequired(propSchemaRaw)) required.push(propName);
      const cleaned = stripNonOpenApiPropertyKeys(propSchemaRaw);
      // If the property schema is a reference to a class schema name that exists, keep it;
      // otherwise keep whatever schema is present (it may reference a project property).
      const refStr = typeof cleaned.$ref === 'string' ? cleaned.$ref.trim() : '';
      const refName = refStr ? parseClassNameFromRef(refStr) : undefined;
      if (refName && !classNames.has(refName.toLowerCase())) {
        // leave as-is; still a valid $ref target in some contexts
      }
      properties[propName] = cleaned;
    }

    const nextSchema: Record<string, unknown> = {
      ...baseSchema,
      title: (baseSchema.title as string | undefined) ?? name,
      ...(typeof baseSchema.type === 'undefined' ? { type: 'object' } : {}),
      properties: {
        ...((baseSchema.properties as Record<string, unknown> | undefined) ?? {}),
        ...properties,
      },
    };
    if (required.length > 0) {
      const existing = Array.isArray(baseSchema.required) ? (baseSchema.required as unknown[]) : [];
      const merged = new Set<string>(existing.filter((x) => typeof x === 'string') as string[]);
      required.forEach((r) => merged.add(r));
      nextSchema.required = Array.from(merged);
    }

    schemas[name] = nextSchema;
  }

  const doc = {
    openapi: '3.1.0',
    info: {
      title,
      version,
    },
    paths: {},
    components: {
      schemas,
    },
  };

  return JSON.stringify(doc, null, 2);
}

/** Double-quote a PostgreSQL identifier, escaping embedded double quotes. */
function quoteSqlIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function mapJsonSchemaTypeToSql(typeVal: unknown): string {
  if (Array.isArray(typeVal)) {
    const nonNull = typeVal.filter((t) => t !== 'null');
    if (nonNull.length === 1) return mapJsonSchemaTypeToSql(nonNull[0]);
    return 'jsonb';
  }
  switch (typeVal) {
    case 'string':
      return 'text';
    case 'integer':
      return 'integer';
    case 'number':
      return 'double precision';
    case 'boolean':
      return 'boolean';
    case 'array':
    case 'object':
      return 'jsonb';
    default:
      return 'jsonb';
  }
}

/**
 * Export as Postgres-flavored DDL from the class/property graph.
 *
 * - Each class becomes a table with `id uuid primary key`.
 * - Properties become columns (basic JSON Schema type mapping).
 * - References become `<prop>_id uuid references <target>(id)` when the reference is stored by id.
 *
 * Reference: GitHub #117 — mode-specific export.
 */
export function exportAsSqlDdl(classes: StudioClass[]): string {
  const idToTable = new Map<string, string>();
  const nameToTable = new Map<string, string>();
  const seenTableNames = new Set<string>();

  for (const cls of classes) {
    const clsId = getStableClassId(cls);
    const clsName = (cls.name ?? '').trim();
    if (!clsName) continue;
    const table = toSnakeCase(clsName) || clsName.toLowerCase();
    if (seenTableNames.has(table)) {
      console.warn(`[exportAsSqlDdl] Duplicate table name "${table}" derived from class "${clsName}" – skipping.`);
      continue;
    }
    seenTableNames.add(table);
    if (clsId) idToTable.set(clsId, table);
    nameToTable.set(clsName.toLowerCase(), table);
  }

  const lines: string[] = [];
  lines.push('-- Generated by Objectified (SQL mode)');
  lines.push('-- Dialect: PostgreSQL');
  lines.push('');

  for (const cls of classes) {
    const clsName = (cls.name ?? '').trim();
    if (!clsName) continue;
    const table = nameToTable.get(clsName.toLowerCase());
    if (!table) continue; // skipped as duplicate during index-build pass

    const columnLines: string[] = [];
    const fkLines: string[] = [];

    columnLines.push(`  ${quoteSqlIdent('id')} uuid primary key`);

    for (const prop of (cls.properties ?? []) as StudioClassProperty[]) {
      const propName = (prop.name ?? '').trim();
      if (!propName) continue;
      const propSchema = getPropertySchema(prop);

      const { refClassId, refClassName } = getRefTarget(propSchema);
      const refStorage = typeof propSchema['x-ref-storage'] === 'string' ? propSchema['x-ref-storage'] : '';
      const isIdRef = refStorage === 'id' || (refStorage === '' && (refClassId || refClassName));

      const required = isPropertyRequired(propSchema);

      if (isIdRef && (refClassId || refClassName)) {
        const targetTable =
          (refClassId ? idToTable.get(refClassId) : undefined) ??
          (refClassName ? nameToTable.get(refClassName.toLowerCase()) : undefined);
        const baseCol = toSnakeCase(propName) || propName.toLowerCase();
        const colName = baseCol.endsWith('_id') ? baseCol : `${baseCol}_id`;
        columnLines.push(`  ${quoteSqlIdent(colName)} uuid${required ? ' not null' : ''}`);
        if (targetTable) {
          fkLines.push(`  foreign key (${quoteSqlIdent(colName)}) references ${quoteSqlIdent(targetTable)}(${quoteSqlIdent('id')})`);
        }
      } else {
        const baseCol = toSnakeCase(propName) || propName.toLowerCase();
        const sqlType = mapJsonSchemaTypeToSql(propSchema.type);
        columnLines.push(`  ${quoteSqlIdent(baseCol)} ${sqlType}${required ? ' not null' : ''}`);
      }
    }

    const allConstraints = [...columnLines, ...fkLines];
    lines.push(`create table if not exists ${quoteSqlIdent(table)} (`);
    lines.push(allConstraints.join(',\n'));
    lines.push(');');
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
