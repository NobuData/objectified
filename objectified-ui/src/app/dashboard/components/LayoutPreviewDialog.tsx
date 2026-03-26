'use client';

/**
 * Layout preview dialog: shows auto-layout (dagre) result with Apply / Cancel.
 * Reference: GitHub #88 — layout preview then apply.
 * Reference: GitHub #240 — optional layout-by-group strategy.
 */

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import { ReactFlow, Background, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X, Check, RotateCcw } from 'lucide-react';
import type { Node, Edge } from '@xyflow/react';
import {
  getLayoutedNodes,
  getLayoutedNodesByGroup,
  type LayoutDirection,
} from '@lib/studio/canvasAutoLayout';

export interface LayoutPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: Node[];
  edges: Edge[];
  direction?: LayoutDirection;
  onApply: (layoutedNodes: Node[]) => void;
}

/** Minimal nodes for preview: default shape with label. */
function previewNodes(nodes: Node[]): Node[] {
  return nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      label:
        typeof (n.data as { name?: string; label?: string })?.name === 'string'
          ? (n.data as { name: string }).name
          : (n.data as { label?: string })?.label ?? n.id,
    },
  }));
}

export default function LayoutPreviewDialog({
  open,
  onOpenChange,
  nodes,
  edges,
  direction = 'TB',
  onApply,
}: LayoutPreviewDialogProps) {
  const [layoutByGroup, setLayoutByGroup] = useState(false);

  useEffect(() => {
    if (open) setLayoutByGroup(false);
  }, [open]);

  const layoutedNodes = useMemo(() => {
    if (layoutByGroup) {
      return getLayoutedNodesByGroup(nodes, edges, direction);
    }
    return getLayoutedNodes(nodes, edges, direction);
  }, [nodes, edges, direction, layoutByGroup]);
  const preview = useMemo(
    () => previewNodes(layoutedNodes),
    [layoutedNodes]
  );

  const handleApply = () => {
    onApply(layoutedNodes);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9998] animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[85vh] overflow-hidden z-[9999] animate-in focus:outline-none flex flex-col"
          aria-describedby="layout-preview-description"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div>
              <Dialog.Title className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Auto layout preview
              </Dialog.Title>
              <Dialog.Description
                id="layout-preview-description"
                className="text-sm text-slate-500 dark:text-slate-400 mt-1"
              >
                Preview auto-layout. Apply updates class positions (and group
                frames when using layout by group) and saves the default layout
                for this version.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={layoutByGroup}
                onChange={(e) => setLayoutByGroup(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <Label.Root asChild>
                  <span>Layout by group</span>
                </Label.Root>
                <span className="block text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  Arrange top-level groups and ungrouped nodes, then dagre inside each group.
                </span>
              </span>
            </label>
          </div>

          <div className="flex-1 min-h-[320px] bg-slate-50 dark:bg-slate-900/50 rounded-b-xl overflow-hidden">
            <ReactFlow
              nodes={preview}
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag={true}
              zoomOnScroll={true}
              zoomOnPinch={true}
              proOptions={{ hideAttribution: true }}
              className="rounded-b-xl"
            >
              <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            </ReactFlow>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-sm font-medium"
            >
              <RotateCcw className="h-4 w-4" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-sm font-medium"
            >
              <Check className="h-4 w-4" />
              Apply layout
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
