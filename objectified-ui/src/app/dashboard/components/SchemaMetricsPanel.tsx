/**
 * Schema metrics panel: optional depth, circular edge count, affected (nodes in cycles) count.
 * Reference: GitHub #91 — Add schema metrics panel to the canvas.
 */
'use client';

import { BarChart3 } from 'lucide-react';

export interface SchemaMetricsPanelProps {
  /** Maximum dependency depth in the schema (longest path). Optional. */
  depth?: number;
  /** Number of edges participating in circular dependencies. */
  circularEdgeCount: number;
  /** Number of nodes incident to circular dependency edges (affected count). Optional. */
  affectedCount?: number;
}

export default function SchemaMetricsPanel({
  depth,
  circularEdgeCount,
  affectedCount,
}: SchemaMetricsPanelProps) {
  const hasCircular = circularEdgeCount > 0;
  const hasDepth = depth !== undefined;
  const hasAffected = affectedCount !== undefined;

  return (
    <div
      className="absolute bottom-2 left-2 z-10 flex flex-col gap-1.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white/95 dark:bg-slate-900/95 shadow-lg text-xs text-slate-700 dark:text-slate-300 max-w-[220px]"
      role="status"
      aria-label="Schema metrics"
    >
      <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
        <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Schema metrics</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {hasDepth && (
          <>
            <dt className="text-slate-500 dark:text-slate-400">Depth</dt>
            <dd>{depth}</dd>
          </>
        )}
        <dt className="text-slate-500 dark:text-slate-400">Circular</dt>
        <dd>{circularEdgeCount}</dd>
        {hasAffected && (
          <>
            <dt className="text-slate-500 dark:text-slate-400">Affected</dt>
            <dd>{affectedCount}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
