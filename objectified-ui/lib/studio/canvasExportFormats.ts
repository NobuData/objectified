/**
 * Serialize canvas graph (classes + ref edges) to Mermaid, PlantUML, DOT, GraphML, JSON.
 * Reference: GitHub #92 — export dialog and export functions for the Canvas.
 */

import type { StudioClass } from './types';
import { getStableClassId } from './types';
import { buildClassRefEdges } from './canvasClassRefEdges';

export interface ExportGraphNode {
  id: string;
  name: string;
}

export interface ExportGraphEdge {
  sourceId: string;
  targetId: string;
  label?: string;
}

/** Build minimal graph from classes for export (node names + edges). */
function buildExportGraph(classes: StudioClass[]): {
  nodes: ExportGraphNode[];
  edges: ExportGraphEdge[];
} {
  const nodes: ExportGraphNode[] = classes.map((c) => ({
    id: getStableClassId(c),
    name: c.name ?? '',
  }));
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
export function exportAsMermaid(classes: StudioClass[]): string {
  const { nodes, edges } = buildExportGraph(classes);
  const lines = ['classDiagram'];
  for (const n of nodes) {
    if (!n.name) continue;
    lines.push(`  class ${escapeLabel(n.name)}`);
  }
  for (const e of edges) {
    const src = nodes.find((x) => x.id === e.sourceId)?.name ?? e.sourceId;
    const tgt = nodes.find((x) => x.id === e.targetId)?.name ?? e.targetId;
    const label = e.label ? ` : ${escapeLabel(e.label)}` : '';
    lines.push(`  ${escapeLabel(src)} --> ${escapeLabel(tgt)}${label}`);
  }
  return lines.join('\n');
}

/** Export as PlantUML class diagram. */
export function exportAsPlantUML(classes: StudioClass[]): string {
  const { nodes, edges } = buildExportGraph(classes);
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
export function exportAsDot(classes: StudioClass[]): string {
  const { nodes, edges } = buildExportGraph(classes);
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
export function exportAsGraphML(classes: StudioClass[]): string {
  const { nodes, edges } = buildExportGraph(classes);
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <graph id="G" edgedefault="directed">`;
  const nodeLines = nodes
    .filter((n) => n.name)
    .map((n) => {
      const label = n.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return `    <node id="${n.id}"><data key="label">${label}</data></node>`;
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
export function exportAsJson(classes: StudioClass[]): string {
  const { nodes, edges } = buildExportGraph(classes);
  return JSON.stringify(
    {
      nodes: nodes.filter((n) => n.name),
      edges,
    },
    null,
    2
  );
}
