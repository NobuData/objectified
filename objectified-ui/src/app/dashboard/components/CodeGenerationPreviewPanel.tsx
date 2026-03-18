'use client';

/**
 * Docked code generation preview beside the schema canvas; refreshes with schema changes.
 * Reference: GitHub #120.
 */

import { Code2, Maximize2, X } from 'lucide-react';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import CodeGenerationPreviewForm from '@/app/dashboard/components/CodeGenerationPreviewForm';

export interface CodeGenerationPreviewPanelProps {
  onClose: () => void;
  onOpenFullDialog: () => void;
}

export default function CodeGenerationPreviewPanel({
  onClose,
  onOpenFullDialog,
}: CodeGenerationPreviewPanelProps) {
  const studio = useStudioOptional();
  const versionId = studio?.state?.versionId ?? '';

  return (
    <aside
      className="flex flex-col w-[min(100%,440px)] min-w-[300px] max-w-[min(100vw,520px)] shrink-0 border-l border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 h-full shadow-[inset_1px_0_0_rgba(0,0,0,0.04)] dark:shadow-none"
      aria-label="Code generation preview"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-600 shrink-0 bg-slate-50/80 dark:bg-slate-800/50">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            Code preview
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenFullDialog}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700"
            title="Open full generate code dialog"
            aria-label="Open full generate code dialog"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Full editor
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/80 dark:hover:bg-slate-700"
            aria-label="Close code preview panel"
            title="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col p-3 overflow-hidden">
        <CodeGenerationPreviewForm
          variant="panel"
          active
          resetVersionKey={versionId}
        />
      </div>
    </aside>
  );
}
