'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import * as Select from '@radix-ui/react-select';
import * as Switch from '@radix-ui/react-switch';
import { X, Clock, Trash2, ChevronDown } from 'lucide-react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  useCanvasSettingsOptional,
  CanvasSettingsContext,
} from '@/app/contexts/CanvasSettingsContext';
import {
  getCanvasSettings,
  saveCanvasSettings,
  type CanvasSettings,
  type CanvasGridStyle,
  type CanvasEdgePathType,
} from '@lib/studio/canvasSettings';
import { gridStyleToBackgroundVariant } from '@/app/dashboard/utils/canvasStyleUtils';
import { useSearchHistory } from '@/app/hooks/useSearchHistory';
import ClassRefEdge from './ClassRefEdge';

const PREVIEW_NODES = [
  { id: 'a', position: { x: 20, y: 20 }, data: { label: 'Class A' } },
  { id: 'b', position: { x: 220, y: 80 }, data: { label: 'Class B' } },
];

const PREVIEW_EDGES = [
  {
    id: 'preview-e1',
    source: 'a',
    target: 'b',
    type: 'classRef',
    data: { refType: 'direct' as const },
    markerEnd: { type: MarkerType.ArrowClosed },
  },
];

const GRID_SIZE_OPTIONS = [8, 16, 24] as const;
const GRID_STYLE_OPTIONS: { value: CanvasGridStyle; label: string }[] = [
  { value: 'dots', label: 'Dots' },
  { value: 'lines', label: 'Lines' },
  { value: 'cross', label: 'Cross' },
];
const EDGE_PATH_OPTIONS: { value: CanvasEdgePathType; label: string }[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'bezier', label: 'Bezier' },
  { value: 'orthogonal', label: 'Orthogonal' },
  { value: 'smoothstep', label: 'Smooth step' },
];
const UNDO_DEPTH_OPTIONS = [20, 50, 100, 200] as const;

const edgeTypes = { classRef: ClassRefEdge };

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
  const setSettings = context?.setSettings ?? ((s: CanvasSettings) => saveCanvasSettings(s));
  const [draft, setDraft] = useState<CanvasSettings>(settings);
  const { entries: historyEntries, removeEntry, clearAll } = useSearchHistory();

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const [nodes] = useNodesState(PREVIEW_NODES);
  const [edges] = useEdgesState(PREVIEW_EDGES);

  const previewContextValue = useMemo(
    () => ({ settings: draft, setSettings: () => {} }),
    [draft]
  );

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
                Configure grid, background, edges, routing, animation, controls,
                minimap, and search history. Most visual changes are reflected
                in the preview; save to apply to the design canvas.
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
              {/* Grid — GitHub #94 */}
              <div className="space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Grid
                </span>
                <div className="flex items-center justify-between gap-3">
                  <Label.Root
                    htmlFor="canvas-settings-grid-visible"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Visible
                  </Label.Root>
                  <Switch.Root
                    id="canvas-settings-grid-visible"
                    checked={draft.showBackground}
                    onCheckedChange={(checked) =>
                      updateDraft({ showBackground: checked })
                    }
                    className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                  >
                    <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                  </Switch.Root>
                </div>
                <div className="space-y-1.5">
                  <Label.Root
                    htmlFor="canvas-settings-grid-size"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Size
                  </Label.Root>
                  <Select.Root
                    value={String(draft.gridSize)}
                    onValueChange={(v) =>
                      updateDraft({ gridSize: Number(v) })
                    }
                  >
                    <Select.Trigger
                      id="canvas-settings-grid-size"
                      className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
                    >
                      <Select.Value />
                      <Select.Icon>
                        <ChevronDown className="h-4 w-4" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                        <Select.Viewport>
                          {GRID_SIZE_OPTIONS.map((size) => (
                            <Select.Item
                              key={size}
                              value={String(size)}
                              className="rounded-md px-3 py-1.5 text-sm outline-none focus:bg-slate-100 dark:focus:bg-slate-700"
                            >
                              <Select.ItemText>{size}px</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
                <div className="space-y-1.5">
                  <Label.Root
                    htmlFor="canvas-settings-grid-style"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Style
                  </Label.Root>
                  <Select.Root
                    value={draft.gridStyle}
                    onValueChange={(v) =>
                      updateDraft({ gridStyle: v as CanvasGridStyle })
                    }
                  >
                    <Select.Trigger
                      id="canvas-settings-grid-style"
                      className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
                    >
                      <Select.Value />
                      <Select.Icon>
                        <ChevronDown className="h-4 w-4" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                        <Select.Viewport>
                          {GRID_STYLE_OPTIONS.map((opt) => (
                            <Select.Item
                              key={opt.value}
                              value={opt.value}
                              className="rounded-md px-3 py-1.5 text-sm outline-none focus:bg-slate-100 dark:focus:bg-slate-700"
                            >
                              <Select.ItemText>{opt.label}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label.Root
                    htmlFor="canvas-settings-snap"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Snap to grid
                  </Label.Root>
                  <Switch.Root
                    id="canvas-settings-snap"
                    checked={draft.snapToGrid}
                    onCheckedChange={(checked) =>
                      updateDraft({ snapToGrid: checked })
                    }
                    className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                  >
                    <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                  </Switch.Root>
                </div>
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
                  htmlFor="canvas-settings-minimap-legend"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  MiniMap legend
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-minimap-legend"
                  checked={draft.showMiniMapLegend}
                  onCheckedChange={(checked) =>
                    updateDraft({ showMiniMapLegend: checked })
                  }
                  disabled={!draft.showMiniMap}
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors disabled:opacity-50"
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
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  htmlFor="canvas-settings-layout-hints"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Layout hints
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-layout-hints"
                  checked={draft.showLayoutHints}
                  onCheckedChange={(checked) =>
                    updateDraft({ showLayoutHints: checked })
                  }
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  htmlFor="canvas-settings-dependency-overlay"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Dependency overlay
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-dependency-overlay"
                  checked={draft.showDependencyOverlay}
                  onCheckedChange={(checked) =>
                    updateDraft({ showDependencyOverlay: checked })
                  }
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  htmlFor="canvas-settings-schema-metrics"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Schema metrics
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-schema-metrics"
                  checked={draft.showSchemaMetricsPanel}
                  onCheckedChange={(checked) =>
                    updateDraft({ showSchemaMetricsPanel: checked })
                  }
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  htmlFor="canvas-settings-simplified-node-view"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Simplified node view
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-simplified-node-view"
                  checked={draft.simplifiedNodeView}
                  onCheckedChange={(checked) =>
                    updateDraft({ simplifiedNodeView: checked })
                  }
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  htmlFor="canvas-settings-high-contrast"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  High contrast canvas
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-high-contrast"
                  checked={draft.highContrastCanvas}
                  onCheckedChange={(checked) =>
                    updateDraft({ highContrastCanvas: checked })
                  }
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  htmlFor="canvas-settings-reduced-motion"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Reduced motion
                </Label.Root>
                <Switch.Root
                  id="canvas-settings-reduced-motion"
                  checked={draft.reducedMotion}
                  onCheckedChange={(checked) =>
                    updateDraft({ reducedMotion: checked })
                  }
                  className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                >
                  <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Undo history
                </span>
                <div className="flex items-center justify-between gap-3">
                  <Label.Root
                    htmlFor="canvas-settings-persist-undo-session"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Persist in session
                  </Label.Root>
                  <Switch.Root
                    id="canvas-settings-persist-undo-session"
                    checked={draft.persistUndoStackInSession}
                    onCheckedChange={(checked) =>
                      updateDraft({ persistUndoStackInSession: checked })
                    }
                    className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                  >
                    <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                  </Switch.Root>
                </div>
                <div className="space-y-1.5">
                  <Label.Root
                    htmlFor="canvas-settings-max-undo-depth"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Max undo depth
                  </Label.Root>
                  <Select.Root
                    value={String(draft.maxUndoDepth)}
                    onValueChange={(value) =>
                      updateDraft({ maxUndoDepth: Number(value) })
                    }
                  >
                    <Select.Trigger
                      id="canvas-settings-max-undo-depth"
                      className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
                    >
                      <Select.Value />
                      <Select.Icon>
                        <ChevronDown className="h-4 w-4" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                        <Select.Viewport>
                          {UNDO_DEPTH_OPTIONS.map((depth) => (
                            <Select.Item
                              key={depth}
                              value={String(depth)}
                              className="rounded-md px-3 py-1.5 text-sm outline-none focus:bg-slate-100 dark:focus:bg-slate-700"
                            >
                              <Select.ItemText>{depth} steps</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label.Root
                    htmlFor="canvas-settings-default-revision-readonly"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Open URL revision read-only
                  </Label.Root>
                  <Switch.Root
                    id="canvas-settings-default-revision-readonly"
                    checked={draft.defaultRevisionLoadReadOnly}
                    onCheckedChange={(checked) =>
                      updateDraft({ defaultRevisionLoadReadOnly: checked })
                    }
                    className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                  >
                    <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                  </Switch.Root>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
                  When a link includes <span className="font-mono">revision</span> but not{' '}
                  <span className="font-mono">view=1</span> or <span className="font-mono">edit=1</span>,
                  load that snapshot read-only (safer). Add <span className="font-mono">edit=1</span> to
                  force editing.
                </p>
                <div className="flex items-center justify-between gap-3">
                  <Label.Root
                    htmlFor="canvas-settings-clear-undo-revision"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Clear undo after revision load
                  </Label.Root>
                  <Switch.Root
                    id="canvas-settings-clear-undo-revision"
                    checked={draft.clearUndoStackOnRevisionLoad}
                    onCheckedChange={(checked) =>
                      updateDraft({ clearUndoStackOnRevisionLoad: checked })
                    }
                    className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                  >
                    <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                  </Switch.Root>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
                  After loading a specific revision, reset undo/redo instead of restoring a saved stack
                  that matches that revision.
                </p>
              </div>

              {/* Edge styling & routing — GitHub #94 */}
              <div className="space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Edges
                </span>
                <div className="space-y-1.5">
                  <Label.Root
                    htmlFor="canvas-settings-edge-path"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Path type
                  </Label.Root>
                  <Select.Root
                    value={draft.edgePathType}
                    onValueChange={(v) =>
                      updateDraft({ edgePathType: v as CanvasEdgePathType })
                    }
                  >
                    <Select.Trigger
                      id="canvas-settings-edge-path"
                      className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
                    >
                      <Select.Value />
                      <Select.Icon>
                        <ChevronDown className="h-4 w-4" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                        <Select.Viewport>
                          {EDGE_PATH_OPTIONS.map((opt) => (
                            <Select.Item
                              key={opt.value}
                              value={opt.value}
                              className="rounded-md px-3 py-1.5 text-sm outline-none focus:bg-slate-100 dark:focus:bg-slate-700"
                            >
                              <Select.ItemText>{opt.label}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
                <div className="space-y-1.5">
                  <Label.Root
                    htmlFor="canvas-settings-edge-color"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Color (empty = theme)
                  </Label.Root>
                  <input
                    id="canvas-settings-edge-color"
                    type="text"
                    value={draft.edgeStrokeColor}
                    onChange={(e) =>
                      updateDraft({ edgeStrokeColor: e.target.value })
                    }
                    placeholder="e.g. #64748b"
                    className="h-9 w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm placeholder:text-slate-400"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label.Root
                    htmlFor="canvas-settings-edge-animated"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Animated
                  </Label.Root>
                  <Switch.Root
                    id="canvas-settings-edge-animated"
                    checked={draft.edgeAnimated}
                    onCheckedChange={(checked) =>
                      updateDraft({ edgeAnimated: checked })
                    }
                    className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 transition-colors"
                  >
                    <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                  </Switch.Root>
                </div>
              </div>

              {/* Search history management — GitHub #86 */}
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    Search history
                  </span>
                  {historyEntries.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearAll()}
                      className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1"
                      aria-label="Clear all search history"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear all
                    </button>
                  )}
                </div>
                {historyEntries.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                    No search history yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1 max-h-[120px] overflow-y-auto" aria-label="Search history entries">
                    {historyEntries.map((entry) => (
                      <li
                        key={entry.query}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50"
                      >
                        <span className="truncate">{entry.query}</span>
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.query)}
                          className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 shrink-0"
                          aria-label={`Remove "${entry.query}" from search history`}
                        >
                          <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 p-4 flex flex-col">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Preview
              </p>
              <div className="flex-1 min-h-[240px] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-950">
                <CanvasSettingsContext.Provider value={previewContextValue}>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    fitView
                    snapToGrid={draft.snapToGrid}
                    snapGrid={[draft.gridSize, draft.gridSize]}
                    defaultEdgeOptions={{ animated: draft.edgeAnimated }}
                    edgeTypes={edgeTypes}
                    className="bg-slate-50 dark:bg-slate-900/50"
                    proOptions={{ hideAttribution: true }}
                  >
                    {draft.showBackground && (
                      <Background
                        variant={gridStyleToBackgroundVariant(draft.gridStyle)}
                        gap={draft.gridSize}
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
                </CanvasSettingsContext.Provider>
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
