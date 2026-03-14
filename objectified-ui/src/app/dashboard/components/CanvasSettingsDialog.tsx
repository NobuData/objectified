'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import * as Switch from '@radix-ui/react-switch';
import { X } from 'lucide-react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasSettingsOptional } from '@/app/contexts/CanvasSettingsContext';
import { getCanvasSettings } from '@lib/studio/canvasSettings';
import type { CanvasSettings } from '@lib/studio/canvasSettings';

const PREVIEW_NODES = [
  { id: 'a', position: { x: 20, y: 20 }, data: { label: 'Class A' } },
  { id: 'b', position: { x: 220, y: 80 }, data: { label: 'Class B' } },
];

export interface CanvasSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CanvasSettingsDialog({
  open,
  onOpenChange,
}: CanvasSettingsDialogProps) {
  const context = useCanvasSettingsOptional();
  const settings = context?.settings ?? getCanvasSettings();
  const setSettings = context?.setSettings ?? (() => {});
  const [draft, setDraft] = useState<CanvasSettings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const [nodes] = useNodesState(PREVIEW_NODES);
  const [edges] = useEdgesState([]);

  const handleSave = () => {
    setSettings(draft);
    onOpenChange(false);
  };

  const updateDraft = (patch: Partial<CanvasSettings>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9998] animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-hidden z-[9999] animate-in focus:outline-none flex flex-col"
          aria-describedby="canvas-settings-description"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div>
              <Dialog.Title className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Canvas settings
              </Dialog.Title>
              <Dialog.Description
                id="canvas-settings-description"
                className="text-sm text-slate-500 dark:text-slate-400 mt-1"
              >
                Configure background, controls, minimap and viewport persistence.
                Changes below are reflected in the preview; save to apply to the
                design canvas.
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

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="w-56 shrink-0 flex flex-col gap-4 p-4 border-r border-slate-200 dark:border-slate-700 overflow-y-auto">
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  htmlFor="canvas-settings-background"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Background
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-background"
                  checked={draft.showBackground}
                  onCheckedChange={(checked) =>
                    updateDraft({ showBackground: checked })
                  }
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  htmlFor="canvas-settings-controls"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Controls
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-controls"
                  checked={draft.showControls}
                  onCheckedChange={(checked) =>
                    updateDraft({ showControls: checked })
                  }
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  htmlFor="canvas-settings-minimap"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  MiniMap
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-minimap"
                  checked={draft.showMiniMap}
                  onCheckedChange={(checked) =>
                    updateDraft({ showMiniMap: checked })
                  }
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  htmlFor="canvas-settings-viewport"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Viewport persistence
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-viewport"
                  checked={draft.viewportPersistence}
                  onCheckedChange={(checked) =>
                    updateDraft({ viewportPersistence: checked })
                  }
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
            </div>

            <div className="flex-1 min-w-0 p-4 flex flex-col">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Preview
              </p>
              <div className="flex-1 min-h-[240px] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-950">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  fitView
                  className="bg-slate-50 dark:bg-slate-900/50"
                  proOptions={{ hideAttribution: true }}
                >
                  {draft.showBackground && (
                    <Background
                      variant={BackgroundVariant.Dots}
                      gap={16}
                      size={1}
                    />
                  )}
                  {draft.showControls && (
                    <Controls
                      position="bottom-left"
                      className="!shadow-lg !rounded-lg !border-slate-200 dark:!border-slate-700"
                    />
                  )}
                  {draft.showMiniMap && (
                    <MiniMap
                      position="bottom-right"
                      className="!shadow-lg !rounded-lg !border-slate-200 dark:!border-slate-700 !bg-white dark:!bg-slate-900"
                    />
                  )}
                </ReactFlow>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
