'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import type { ClassNodeData } from '@lib/studio/types';

/** Node type for react-flow; data satisfies Record<string, unknown>. */
export type ClassNodeType = Node<ClassNodeData & Record<string, unknown>, 'class'>;

/**
 * Custom react-flow node for a class: header with class name, body with property members.
 * Renders from local state; position, dimensions, style are driven by canvas_metadata on the node.
 * Reference: GitHub #79.
 */
function ClassNodeComponent({ data, selected }: NodeProps<ClassNodeType>) {
  const { name, properties } = data;
  const hasProperties = properties.length > 0;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !border-2 !border-slate-300 dark:!border-slate-600 !bg-white dark:!bg-slate-800" />
      <div
        className={[
          'rounded-lg border-2 shadow-md min-w-[180px] max-w-[280px] overflow-hidden',
          'bg-white dark:bg-slate-900',
          'border-slate-200 dark:border-slate-700',
          selected
            ? 'ring-2 ring-indigo-500 dark:ring-indigo-400 border-indigo-500 dark:border-indigo-400'
            : 'hover:border-slate-300 dark:hover:border-slate-600',
        ].join(' ')}
      >
        <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate block">
            {name || 'Unnamed class'}
          </span>
        </div>
        <ScrollArea.Root className="max-h-[240px]">
          <ScrollArea.Viewport className="w-full">
            <div className="px-3 py-2">
              {hasProperties ? (
                <ul className="space-y-1 text-left">
                  {properties.map((prop, idx) => (
                    <li
                      key={prop.id ?? prop.localId ?? idx}
                      className="text-xs text-slate-600 dark:text-slate-400 truncate font-mono"
                    >
                      {prop.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No properties</p>
              )}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            className="flex w-1.5 touch-none select-none p-0.5 transition-colors"
            orientation="vertical"
          >
            <ScrollArea.Thumb className="relative flex-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !border-2 !border-slate-300 dark:!border-slate-600 !bg-white dark:!bg-slate-800" />
    </>
  );
}

const ClassNode = memo(ClassNodeComponent);
export default ClassNode;
