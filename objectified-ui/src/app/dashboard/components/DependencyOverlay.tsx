/**
 * Dependency overlay: upstream/downstream/path from selected node; circular ref warning.
 * Reference: GitHub #90 — Add dependency overlay to the Canvas.
 */
'use client';

import { GitBranch, AlertTriangle } from 'lucide-react';

export interface DependencyOverlayProps {
  /** Single selected class node id, or null. */
  selectedNodeId: string | null;
  /** When exactly two class nodes are selected, the second (for path). */
  selectedNodeId2: string | null;
  /** Number of nodes that depend on the selected node (upstream: can reach selected). */
  upstreamCount: number;
  /** Number of nodes the selected node depends on (downstream: reachable from selected). */
  downstreamCount: number;
  /** Path from selected to selectedNodeId2 (node count), or null if no path or not two selections. */
  pathLength: number | null;
  /** Number of edges that participate in a circular dependency. */
  circularEdgeCount: number;
  /** Class names for the selected node(s), for display. */
  selectedNodeName?: string;
  selectedNodeName2?: string;
}

export default function DependencyOverlay({
  selectedNodeId,
  selectedNodeId2,
  upstreamCount,
  downstreamCount,
  pathLength,
  circularEdgeCount,
  selectedNodeName,
  selectedNodeName2,
}: DependencyOverlayProps) {
  const hasSelection = selectedNodeId != null;
  const hasPath = selectedNodeId2 != null && pathLength != null && pathLength > 0;
  const hasCircular = circularEdgeCount > 0;

  return (
    <div
      className="absolute top-2 right-2 z-10 flex flex-col gap-1.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white/95 dark:bg-slate-900/95 shadow-lg text-xs text-slate-700 dark:text-slate-300 max-w-[240px]"
      role="status"
      aria-label="Dependency overlay"
    >
      <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
        <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Dependencies</span>
      </div>
      {hasSelection ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          <dt className="text-slate-500 dark:text-slate-400">Upstream</dt>
          <dd>{upstreamCount}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Downstream</dt>
          <dd>{downstreamCount}</dd>
          {hasPath && (
            <>
              <dt className="text-slate-500 dark:text-slate-400">Path</dt>
              <dd>
                {pathLength} step{pathLength !== 1 ? 's' : ''}
                {selectedNodeName2 && ` → ${selectedNodeName2}`}
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-slate-500 dark:text-slate-400">
          Select a class node to see upstream/downstream counts.
        </p>
      )}
      {hasCircular && (
        <div className="flex items-start gap-1.5 mt-0.5 p-1.5 rounded border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>
            Circular reference: {circularEdgeCount} edge{circularEdgeCount !== 1 ? 's' : ''} in cycle
            {circularEdgeCount !== 1 ? 's' : ''}.
          </span>
        </div>
      )}
    </div>
  );
}
