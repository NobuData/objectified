'use client';

import { memo, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AlertTriangle } from 'lucide-react';

export interface BrokenRefNodeData extends Record<string, unknown> {
  sourceClassId: string;
  propertyName: string;
  hint: string;
  onFixReference?: (sourceClassId: string, propertyName: string) => void;
  /** GitHub #236 — roving tabindex and keyboard navigation on the node shell. */
  canvasNavShellTabIndex?: 0 | -1;
  onCanvasNavShellFocus?: () => void;
  onNavigateCanvasNav?: (delta: 1 | -1) => void;
}

function BrokenRefNodeComponent({
  id,
  data,
  selected,
}: NodeProps<Node<BrokenRefNodeData>>) {
  const {
    canvasNavShellTabIndex = -1,
    onCanvasNavShellFocus,
    onNavigateCanvasNav,
  } = data;

  const invokeFix = useCallback(() => {
    if (data.onFixReference && data.sourceClassId) {
      data.onFixReference(data.sourceClassId, data.propertyName ?? '');
    }
  }, [data.onFixReference, data.sourceClassId, data.propertyName]);

  const handleNavShellKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        onNavigateCanvasNav?.(1);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        onNavigateCanvasNav?.(-1);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        invokeFix();
      }
    },
    [onNavigateCanvasNav, invokeFix]
  );

  return (
    <div
      data-canvas-nav-node={id}
      tabIndex={canvasNavShellTabIndex}
      role="group"
      aria-label={`Broken reference: ${data.hint}. Property ${data.propertyName || 'unnamed'}. Press Enter or Space to open the editor.`}
      className={`rounded-md border border-red-400/90 bg-red-50/95 px-2 py-1.5 shadow-sm dark:border-red-500/60 dark:bg-red-950/50 max-w-[160px] cursor-pointer outline-none ${
        selected ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''
      } focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600 dark:focus-visible:ring-red-400 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900`}
      onClick={(e) => {
        e.stopPropagation();
        invokeFix();
      }}
      onFocus={() => onCanvasNavShellFocus?.()}
      onKeyDown={handleNavShellKeyDown}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!opacity-0 !size-1 !border-0 !bg-transparent"
      />
      <div className="flex items-start gap-1.5 text-[10px] leading-tight text-red-900 dark:text-red-100">
        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold">Missing reference</p>
          <p className="truncate opacity-95" title={data.hint}>
            {data.hint}
          </p>
          {data.propertyName ? (
            <p className="truncate text-red-800/90 dark:text-red-200/90 font-mono text-[9px]">
              {data.propertyName}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const BrokenRefNode = memo(BrokenRefNodeComponent);
export default BrokenRefNode;
