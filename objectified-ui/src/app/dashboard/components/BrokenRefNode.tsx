'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AlertTriangle } from 'lucide-react';

export interface BrokenRefNodeData extends Record<string, unknown> {
  sourceClassId: string;
  propertyName: string;
  hint: string;
  onFixReference?: (sourceClassId: string, propertyName: string) => void;
}

function BrokenRefNodeComponent({
  data,
  selected,
}: NodeProps<Node<BrokenRefNodeData>>) {
  const invokeFix = () => {
    if (data.onFixReference && data.sourceClassId) {
      data.onFixReference(data.sourceClassId, data.propertyName ?? '');
    }
  };

  return (
    <div
      className={`rounded-md border border-red-400/90 bg-red-50/95 px-2 py-1.5 shadow-sm dark:border-red-500/60 dark:bg-red-950/50 max-w-[160px] cursor-pointer ${
        selected ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''
      }`}
      role="button"
      tabIndex={0}
      aria-label={`Broken reference: ${data.hint}. Property ${data.propertyName || 'unnamed'}. Activate to fix.`}
      onClick={(e) => {
        e.stopPropagation();
        invokeFix();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          invokeFix();
        }
      }}
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
