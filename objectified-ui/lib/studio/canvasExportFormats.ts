/**
 * Serialize canvas graph (classes + ref edges) to Mermaid, PlantUML, DOT, GraphML, JSON.
 * Reference: GitHub #92, #93 — export dialog and export wizard (include groups).
 */

import type { StudioClass, StudioClassProperty, StudioGroup } from './types';
import { getStableClassId } from './types';
import { buildClassRefEdges, parseClassNameFromRef } from './canvasClassRefEdges';
import { collectGroupDescendants } from './canvasGroupLayout';

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
  /** When set, only classes whose canvas group is one of these ids (including nested under them when studioGroups is provided). GitHub #240. */
  restrictToGroupIds?: string[];
  /** Studio groups (needed to expand nested groups for restrictToGroupIds). */
  studioGroups?: StudioGroup[];
}

export interface ExportOpenApiOptions {
  title?: string;
  version?: string;
}

export interface ExportDocsBrandingOptions {
  /** Product or tenant display name shown in docs header. */
  brandName?: string;
  /** Optional logo image URL. */
  logoUrl?: string;
  /** Primary theme color (CSS color string, e.g. #4f46e5). */
  primaryColor?: string;
}

export interface ExportDocsOptions extends ExportOpenApiOptions, ExportDocsBrandingOptions {
  /** Optional intro text shown near the top of the docs. */
  description?: string;
}

/** Build minimal graph from classes for export (node names + edges, optional groupId). */
function buildExportGraph(
  classes: StudioClass[],
  options?: ExportGraphOptions
): {
  nodes: ExportGraphNode[];
  edges: ExportGraphEdge[];
} {
  let clsList = classes;
  const rIds = options?.restrictToGroupIds;
  const sg = options?.studioGroups;
  if (rIds && rIds.length > 0) {
    if (sg && sg.length > 0) {
      const allowed = new Set<string>();
      for (const gid of rIds) {
        for (const d of collectGroupDescendants(sg, gid)) {
          allowed.add(d);
        }
      }
      clsList = classes.filter((c) => {
        const g = (c.canvas_metadata as { group?: string } | undefined)?.group;
        return g != null && allowed.has(g);
      });
    } else {
      const allow = new Set(rIds);
      clsList = classes.filter((c) => {
        const g = (c.canvas_metadata as { group?: string } | undefined)?.group;
        return g != null && allow.has(g);
      });
    }
  }

  const includeGroupInfo = options?.includeGroupInfo ?? false;
  const nodes: ExportGraphNode[] = clsList.map((c) => {
    const meta = c.canvas_metadata as { group?: string } | undefined;
    const node: ExportGraphNode = {
      id: getStableClassId(c),
      name: c.name ?? '',
    };
    if (includeGroupInfo && meta?.group) node.groupId = meta.group;
    return node;
  });
  const rfEdges = buildClassRefEdges(clsList);
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

function escapeMarkdown(s: string): string {
  return (s ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('*', '\\*')
    .replaceAll('_', '\\_')
    .replaceAll('`', '\\`')
    .replaceAll('|', '\\|')
    .replace(/[\r\n]+/g, ' ');
}

function safeText(v: unknown): string {
  if (v == null) return '';
  return JSON.stringify(v, null, 2);
}

function readOpenApiSchemas(openapiJson: string): Record<string, any> {
  const doc = JSON.parse(openapiJson) as any;
  const schemas = doc?.components?.schemas;
  if (!schemas || typeof schemas !== 'object') return {};
  return schemas as Record<string, any>;
}

function schemaSummary(schema: any): string {
  const desc = typeof schema?.description === 'string' ? schema.description.trim() : '';
  if (desc) return desc;
  const title = typeof schema?.title === 'string' ? schema.title.trim() : '';
  return title;
}

function propertyTypeString(propSchema: any): string {
  if (!propSchema || typeof propSchema !== 'object') return '';
  if (typeof propSchema.$ref === 'string') return propSchema.$ref;
  if (typeof propSchema.type === 'string') return propSchema.type;
  if (Array.isArray(propSchema.type)) return propSchema.type.join(' | ');
  if (propSchema.oneOf && Array.isArray(propSchema.oneOf)) return 'oneOf';
  if (propSchema.anyOf && Array.isArray(propSchema.anyOf)) return 'anyOf';
  if (propSchema.allOf && Array.isArray(propSchema.allOf)) return 'allOf';
  return '';
}

/**
 * Export a Markdown API document from the OpenAPI component schemas.
 * This is intentionally schema-focused (components/schemas); paths are left empty by the canvas exporter.
 */
export function exportAsDocsMarkdown(
  classes: StudioClass[],
  options?: ExportDocsOptions
): string {
  const title = options?.title?.trim() || 'API Documentation';
  const version = options?.version?.trim() || '0.1.0';
  const brandName = options?.brandName?.trim() || '';
  const description = options?.description?.trim() || '';

  const openapiJson = exportAsOpenApi(classes, { title, version });
  const schemas = readOpenApiSchemas(openapiJson);
  const schemaNames = Object.keys(schemas).sort((a, b) => a.localeCompare(b));

  const lines: string[] = [];
  lines.push(`# ${escapeMarkdown(title)}`);
  lines.push('');
  if (brandName) {
    lines.push(`**Brand**: ${escapeMarkdown(brandName)}`);
    lines.push('');
  }
  lines.push(`**Version**: ${escapeMarkdown(version)}`);
  lines.push('');
  if (description) {
    lines.push(description);
    lines.push('');
  }
  lines.push('## Schemas');
  lines.push('');
  if (schemaNames.length === 0) {
    lines.push('_No schemas to document._');
    lines.push('');
    return lines.join('\n');
  }

  for (const name of schemaNames) {
    const schema = schemas[name];
    lines.push(`### ${escapeMarkdown(name)}`);
    lines.push('');
    const summary = schemaSummary(schema);
    if (summary) {
      lines.push(escapeMarkdown(summary));
      lines.push('');
    }

    const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const requiredArr = Array.isArray(schema?.required) ? (schema.required as string[]) : [];
    const required = new Set(requiredArr.filter((x) => typeof x === 'string'));
    const propNames = Object.keys(props).sort((a, b) => a.localeCompare(b));
    if (propNames.length === 0) {
      lines.push('_No properties._');
      lines.push('');
    } else {
      lines.push('| Property | Type | Required | Description |');
      lines.push('| --- | --- | --- | --- |');
      for (const pn of propNames) {
        const ps = props[pn];
        const ty = propertyTypeString(ps);
        const req = required.has(pn) ? 'yes' : 'no';
        const pd = typeof ps?.description === 'string' ? ps.description : '';
        lines.push(
          `| \`${escapeMarkdown(pn)}\` | \`${escapeMarkdown(ty || '-')}\` | ${req} | ${escapeMarkdown(pd || '')} |`
        );
      }
      lines.push('');
    }

    const exampleValue =
      schema?.example != null
        ? schema.example
        : Array.isArray(schema?.examples) && schema.examples.length > 0
          ? schema.examples[0]
          : null;
    if (exampleValue != null) {
      lines.push('#### Example');
      lines.push('');
      lines.push('```json');
      lines.push(safeText(exampleValue));
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return (s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Export a single-file static HTML document documenting the OpenAPI component schemas.
 * Tenant branding is applied via CSS variables and an optional logo.
 */
export function exportAsDocsHtml(
  classes: StudioClass[],
  options?: ExportDocsOptions
): string {
  const title = options?.title?.trim() || 'API Documentation';
  const version = options?.version?.trim() || '0.1.0';
  const brandName = options?.brandName?.trim() || '';
  const logoUrl = options?.logoUrl?.trim() || '';
  const primaryColor = options?.primaryColor?.trim() || '#4f46e5';
  const description = options?.description?.trim() || '';

  const openapiJson = exportAsOpenApi(classes, { title, version });
  const schemas = readOpenApiSchemas(openapiJson);
  const schemaNames = Object.keys(schemas).sort((a, b) => a.localeCompare(b));

  const navLinks = schemaNames
    .map((n) => `<a class="nav-link" href="#schema-${encodeURIComponent(n)}">${escapeHtml(n)}</a>`)
    .join('');

  const sections = schemaNames
    .map((name) => {
      const schema = schemas[name];
      const summary = schemaSummary(schema);
      const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
      const requiredArr = Array.isArray(schema?.required) ? (schema.required as string[]) : [];
      const required = new Set(requiredArr.filter((x) => typeof x === 'string'));
      const propNames = Object.keys(props).sort((a, b) => a.localeCompare(b));
      const rows =
        propNames.length === 0
          ? `<div class="empty">No properties.</div>`
          : `<table class="table">
  <thead><tr><th>Property</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
  <tbody>
    ${propNames
      .map((pn) => {
        const ps = props[pn];
        const ty = propertyTypeString(ps) || '-';
        const req = required.has(pn) ? 'yes' : 'no';
        const pd = typeof ps?.description === 'string' ? ps.description : '';
        return `<tr>
  <td class="mono">${escapeHtml(pn)}</td>
  <td class="mono">${escapeHtml(ty)}</td>
  <td>${escapeHtml(req)}</td>
  <td>${escapeHtml(pd)}</td>
</tr>`;
      })
      .join('\n')}
  </tbody>
</table>`;
      return `<section class="schema" id="schema-${encodeURIComponent(name)}">
  <h2>${escapeHtml(name)}</h2>
  ${summary ? `<p class="muted">${escapeHtml(summary)}</p>` : ''}
  ${rows}
</section>`;
    })
    .join('\n');

  const safeLogoUrl = /^https?:\/\//i.test(logoUrl) ? logoUrl : '';
  const headerBrand = safeLogoUrl
    ? `<img class="logo" src="${escapeHtml(safeLogoUrl)}" alt="${escapeHtml(brandName || title)} logo" />`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} — ${escapeHtml(version)}</title>
    <style>
      :root {
        --bg: #0b1220;
        --panel: #0f1a2e;
        --text: #e5e7eb;
        --muted: #9ca3af;
        --border: rgba(255, 255, 255, 0.12);
        --primary: ${escapeHtml(primaryColor)};
      }
      @media (prefers-color-scheme: light) {
        :root {
          --bg: #ffffff;
          --panel: #f8fafc;
          --text: #0f172a;
          --muted: #475569;
          --border: rgba(15, 23, 42, 0.12);
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
        background: var(--bg);
        color: var(--text);
      }
      a { color: var(--primary); text-decoration: none; }
      a:hover { text-decoration: underline; }
      .layout { display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }
      .sidebar {
        border-right: 1px solid var(--border);
        padding: 16px 12px;
        position: sticky;
        top: 0;
        align-self: start;
        height: 100vh;
        overflow: auto;
        background: color-mix(in oklab, var(--panel) 75%, transparent);
      }
      .brand { display: flex; align-items: center; gap: 10px; padding: 8px 8px 12px; }
      .logo { width: 28px; height: 28px; object-fit: contain; border-radius: 6px; }
      .brand h1 { font-size: 14px; margin: 0; }
      .brand .muted { font-size: 12px; margin-top: 2px; }
      .nav { display: flex; flex-direction: column; gap: 6px; padding: 8px; }
      .nav-link { padding: 8px 10px; border-radius: 10px; border: 1px solid transparent; }
      .nav-link:hover { background: color-mix(in oklab, var(--primary) 14%, transparent); border-color: color-mix(in oklab, var(--primary) 30%, transparent); }
      .content { padding: 24px 22px 64px; }
      .hero { margin-bottom: 18px; }
      .hero h2 { font-size: 24px; margin: 0 0 6px; }
      .hero p { margin: 0; color: var(--muted); }
      .schema { padding: 18px 18px; border: 1px solid var(--border); border-radius: 16px; background: color-mix(in oklab, var(--panel) 85%, transparent); margin-top: 14px; }
      .schema h2 { margin: 0 0 8px; font-size: 18px; }
      .muted { color: var(--muted); }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .table th, .table td { text-align: left; padding: 10px 10px; border-top: 1px solid var(--border); vertical-align: top; font-size: 13px; }
      .table th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); border-top: none; }
      .empty { color: var(--muted); font-size: 13px; margin-top: 6px; }
      @media (max-width: 900px) {
        .layout { grid-template-columns: 1fr; }
        .sidebar { position: relative; height: auto; border-right: none; border-bottom: 1px solid var(--border); }
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          ${headerBrand}
          <div>
            <h1>${escapeHtml(brandName || title)}</h1>
            <div class="muted">${escapeHtml(version)}</div>
          </div>
        </div>
        <nav class="nav">
          ${navLinks || '<div class="muted">No schemas</div>'}
        </nav>
      </aside>
      <main class="content">
        <div class="hero">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(description || 'Generated from Objectified schema components.')}</p>
        </div>
        ${sections || '<div class="muted">No schemas to document.</div>'}
      </main>
    </div>
  </body>
</html>`;
}

/** Double-quote a PostgreSQL identifier, escaping embedded double quotes. */
function quoteSqlIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Quote a PostgreSQL identifier that may be schema-qualified (e.g. "public.users").
 * Each dot-separated segment is quoted independently so that schema and table
 * names are treated as separate identifiers.
 */
function quoteSqlQualifiedIdent(name: string): string {
  return name
    .split('.')
    .map((seg) => quoteSqlIdent(seg))
    .join('.');
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
    const sch = (cls.schema ?? {}) as Record<string, unknown>;
    const customTable =
      (typeof sch['x-db-table'] === 'string' && sch['x-db-table'].trim()
        ? sch['x-db-table'].trim()
        : typeof sch['x-table-name'] === 'string' && sch['x-table-name'].trim()
          ? sch['x-table-name'].trim()
          : '') || '';
    const table = customTable || toSnakeCase(clsName) || clsName.toLowerCase();
    const tableKey = table.toLowerCase();
    if (seenTableNames.has(tableKey)) {
      console.warn(
        `[exportAsSqlDdl] Duplicate table name "${table}" for class "${clsName}" – skipping.`
      );
      continue;
    }
    seenTableNames.add(tableKey);
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
        const defaultFk = baseCol.endsWith('_id') ? baseCol : `${baseCol}_id`;
        const colOverride =
          typeof propSchema['x-db-column'] === 'string' && propSchema['x-db-column'].trim()
            ? propSchema['x-db-column'].trim()
            : typeof propSchema['x-column-name'] === 'string' && propSchema['x-column-name'].trim()
              ? propSchema['x-column-name'].trim()
              : '';
        const colName = colOverride || defaultFk;
        columnLines.push(`  ${quoteSqlIdent(colName)} uuid${required ? ' not null' : ''}`);
        if (targetTable) {
          fkLines.push(`  foreign key (${quoteSqlIdent(colName)}) references ${quoteSqlQualifiedIdent(targetTable)}(${quoteSqlIdent('id')})`);
        }
      } else {
        const baseCol = toSnakeCase(propName) || propName.toLowerCase();
        const colOverride =
          typeof propSchema['x-db-column'] === 'string' && propSchema['x-db-column'].trim()
            ? propSchema['x-db-column'].trim()
            : typeof propSchema['x-column-name'] === 'string' && propSchema['x-column-name'].trim()
              ? propSchema['x-column-name'].trim()
              : '';
        const colName = colOverride || baseCol;
        const sqlType = mapJsonSchemaTypeToSql(propSchema.type);
        columnLines.push(`  ${quoteSqlIdent(colName)} ${sqlType}${required ? ' not null' : ''}`);
      }
    }

    const allConstraints = [...columnLines, ...fkLines];
    lines.push(`create table if not exists ${quoteSqlQualifiedIdent(table)} (`);
    lines.push(allConstraints.join(',\n'));
    lines.push(');');
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
