'use client';

import type { Edge } from '@xyflow/react';
import type { ClassRefEdgeData } from '@lib/studio/canvasClassRefEdges';
import { isBrokenRefPlaceholderNodeId } from '@lib/studio/canvasClassRefEdges';
import { getStableClassId } from '@lib/studio/types';
import type { StudioClass } from '@lib/studio/types';
import type { SchemaMode } from '@lib/studio/schemaMode';

export interface SelectedRefEdgePanelProps {
  edge: Edge<ClassRefEdgeData>;
  classes: StudioClass[];
  schemaMode: SchemaMode;
  mutationLocked: boolean;
  onEditProperty: (classId: string, propertyName: string) => void;
  onEditClass: (classId: string) => void;
  onDismiss: () => void;
}

function classNameForId(classes: StudioClass[], id: string): string {
  const cls = classes.find((c) => getStableClassId(c) === id);
  return (cls?.name ?? '').trim() || id;
}

/**
 * Detail card for a selected class-reference edge (GitHub #233).
 */
export default function SelectedRefEdgePanel({
  edge,
  classes,
  schemaMode,
  mutationLocked,
  onEditProperty,
  onEditClass,
  onDismiss,
}: SelectedRefEdgePanelProps) {
  const data = edge.data;
  const sourceName = classNameForId(classes, edge.source);
  const targetIsPlaceholder = isBrokenRefPlaceholderNodeId(edge.target);
  const targetName = targetIsPlaceholder ? 'Unresolved target' : classNameForId(classes, edge.target);

  const isInheritance = data?.relationshipKind === 'inheritance';
  const refBindingLabel =
    data?.refBinding === 'idRef'
      ? schemaMode === 'sql'
        ? 'SQL / ID storage (FK-style)'
        : 'ID-style metadata (same as $ref stroke in OpenAPI mode)'
      : 'Schema $ref';

  const title = isInheritance ? 'Inheritance' : data?.brokenRef ? 'Broken reference' : 'Reference';

  return (
    <div
      className="canvas-selected-ref-edge-panel pointer-events-auto z-[10001] w-[min(280px,calc(100vw-2rem))] rounded-md border border-slate-200 bg-white/97 px-3 py-2.5 text-[11px] leading-snug text-slate-800 shadow-lg dark:border-slate-600 dark:bg-slate-900/97 dark:text-slate-100"
      role="region"
      aria-label="Selected edge details"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-slate-900 dark:text-slate-50 m-0">{title}</p>
        <button
          type="button"
          className="canvas-edge-detail-dismiss shrink-0 rounded px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
      <dl className="space-y-1 m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        <dt className="text-slate-500 dark:text-slate-400">From</dt>
        <dd className="m-0 font-medium">{sourceName}</dd>
        <dt className="text-slate-500 dark:text-slate-400">To</dt>
        <dd className="m-0 font-medium">{targetName}</dd>
        {data?.label ? (
          <>
            <dt className="text-slate-500 dark:text-slate-400">Label</dt>
            <dd className="m-0 font-mono text-[10px]">{data.label}</dd>
          </>
        ) : null}
        {!isInheritance ? (
          <>
            <dt className="text-slate-500 dark:text-slate-400">Binding</dt>
            <dd className="m-0">{refBindingLabel}</dd>
          </>
        ) : null}
        <dt className="text-slate-500 dark:text-slate-400">Kind</dt>
        <dd className="m-0 capitalize">{data?.relationshipKind ?? 'association'}</dd>
        {data?.refType && data.refType !== 'direct' ? (
          <>
            <dt className="text-slate-500 dark:text-slate-400">Link type</dt>
            <dd className="m-0 capitalize">{data.refType}</dd>
          </>
        ) : null}
        {data?.cardinalityLabel ? (
          <>
            <dt className="text-slate-500 dark:text-slate-400">Cardinality</dt>
            <dd className="m-0">{data.cardinalityLabel}</dd>
          </>
        ) : null}
      </dl>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {!mutationLocked && data?.brokenRef && data.fix ? (
          <button
            type="button"
            className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
            onClick={() =>
              onEditProperty(data.fix!.sourceClassId, (data.fix!.propertyName ?? '').trim())
            }
          >
            Fix reference…
          </button>
        ) : null}
        {!mutationLocked && !data?.brokenRef && data?.edit?.propertyName?.trim() ? (
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            onClick={() =>
              onEditProperty(data.edit!.sourceClassId, data.edit!.propertyName.trim())
            }
          >
            Edit reference…
          </button>
        ) : null}
        {!mutationLocked && isInheritance ? (
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/80"
            onClick={() => onEditClass(edge.source)}
          >
            Edit source class
          </button>
        ) : null}
      </div>
      <p className="mt-2 mb-0 text-[10px] text-slate-500 dark:text-slate-400">
        Double-click the edge to open the editor when a property is linked.
      </p>
    </div>
  );
}
