'use client';

/**
 * Canvas selection count and bulk actions (GitHub #234, #237).
 */

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { StudioGroup } from '@lib/studio/types';
import { ChevronDown } from 'lucide-react';
import type {
  FocusDirection,
  FocusDisplayMode,
  FocusModeState,
} from '@lib/studio/canvasFocusMode';

export interface CanvasSelectionToolbarProps {
  selectedClassIds: string[];
  /** How many selected classes are currently in a canvas group (GitHub #237). */
  selectedClassesInGroupsCount?: number;
  groups: StudioGroup[];
  availableTagNames: string[];
  mutationLocked: boolean;
  imageExportAvailable: boolean;
  onSelectAll: () => void;
  onSelectByGroup: (groupId: string) => void;
  onSelectByTag: (tagName: string) => void;
  onClearSelection: () => void;
  onBulkMoveToGroup: (groupId: string) => void;
  onCreateGroupFromSelection?: () => void;
  onBulkRemoveFromGroup?: () => void;
  onCreateGroupFromTag?: (tagName: string) => void;
  onBulkDelete: () => void;
  onBulkDuplicate: () => void;
  onBulkExportJson: () => void;
  onBulkExportImage: () => void;
  // --- Focus mode actions (GitHub #244) ---
  focusActive?: boolean;
  focusDegree?: number;
  focusDirection?: FocusDirection;
  focusDisplayMode?: FocusDisplayMode;
  onFocusSelectionNeighbors?: (opts: {
    degree: number;
    direction: FocusDirection;
  }) => void;
  onFocusPathBetweenSelected?: (opts: { mode: 'shortest' | 'all' }) => void;
  onFocusByGroup?: (groupId: string) => void;
  onFocusByTag?: (tagName: string) => void;
  onFocusSetDegree?: (degree: number) => void;
  onFocusSetDirection?: (direction: FocusDirection) => void;
  onFocusSetDisplayMode?: (mode: FocusDisplayMode) => void;
  onExitFocusMode?: () => void;
  /** GitHub #244 — saved focus views (localStorage) */
  focusStateSnapshot?: FocusModeState | null;
  onApplySavedFocusView?: (state: FocusModeState) => void;
}

const menuContentClass =
  'min-w-[200px] max-h-[min(60vh,420px)] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg z-[10003] p-1';
const menuItemClass =
  'flex cursor-pointer items-center rounded-md px-2 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800';
const submenuContentClass =
  'min-w-[180px] max-h-[min(50vh,360px)] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg z-[10004] p-1';
const subTriggerClass =
  `${menuItemClass} justify-between`;

export default function CanvasSelectionToolbar({
  selectedClassIds,
  selectedClassesInGroupsCount = 0,
  groups,
  availableTagNames,
  mutationLocked,
  imageExportAvailable,
  onSelectAll,
  onSelectByGroup,
  onSelectByTag,
  onClearSelection,
  onBulkMoveToGroup,
  onCreateGroupFromSelection,
  onBulkRemoveFromGroup,
  onCreateGroupFromTag,
  onBulkDelete,
  onBulkDuplicate,
  onBulkExportJson,
  onBulkExportImage,
  focusActive = false,
  focusDegree = 1,
  focusDirection = 'both',
  focusDisplayMode = 'hide',
  onFocusSelectionNeighbors,
  onFocusPathBetweenSelected,
  onFocusByGroup,
  onFocusByTag,
  onFocusSetDegree,
  onFocusSetDirection,
  onFocusSetDisplayMode,
  onExitFocusMode,
  focusStateSnapshot = null,
  onApplySavedFocusView,
}: CanvasSelectionToolbarProps) {
  const n = selectedClassIds.length;

  type SavedFocusView = {
    id: string;
    name: string;
    state: FocusModeState;
    createdAt: number;
  };
  const storageKey = 'objectified.canvas.focusViews.v1';
  const [savedViews, setSavedViews] = useState<SavedFocusView[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    try {
      const raw = globalThis.localStorage?.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedFocusView[];
      if (Array.isArray(parsed)) setSavedViews(parsed);
    } catch {
      // Ignore corrupted storage; user can recreate views.
      setSavedViews([]);
    }
  }, []);

  const savedViewsSorted = useMemo(() => {
    return [...savedViews].sort((a, b) => b.createdAt - a.createdAt);
  }, [savedViews]);

  const persistSavedViews = (next: SavedFocusView[]) => {
    setSavedViews(next);
    try {
      globalThis.localStorage?.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore write failures (private mode/quota).
    }
  };

  const canSaveFocusView = Boolean(focusStateSnapshot);
  const canApplySavedViews = Boolean(onApplySavedFocusView);

  return (
    <div className="pointer-events-auto nodrag nopan flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white/95 dark:bg-slate-900/95 px-2 py-1.5 text-[11px] shadow-md">
      <span className="px-1 font-medium tabular-nums text-slate-800 dark:text-slate-100">
        {n === 0 ? 'No selection' : `${n} selected`}
      </span>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Selection actions"
          >
            Selection
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuContentClass} sideOffset={6} align="start">
            <DropdownMenu.Item className={menuItemClass} onSelect={() => onSelectAll()}>
              Select all visible
            </DropdownMenu.Item>
            {groups.length > 0 ? (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={subTriggerClass}>
                  Select by group
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                    {groups.map((g) => (
                      <DropdownMenu.Item
                        key={g.id}
                        className={menuItemClass}
                        onSelect={() => onSelectByGroup(g.id)}
                      >
                        {g.name}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ) : null}
            {availableTagNames.length > 0 ? (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={subTriggerClass}>
                  Select by tag
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                    {availableTagNames.map((tagName) => (
                      <DropdownMenu.Item
                        key={tagName}
                        className={menuItemClass}
                        onSelect={() => onSelectByTag(tagName)}
                      >
                        {tagName}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ) : null}
            <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
            <DropdownMenu.Item
              className={menuItemClass}
              disabled={n === 0}
              onSelect={() => onClearSelection()}
            >
              Clear selection
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Focus mode actions"
          >
            Focus
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuContentClass} sideOffset={6} align="start">
            <DropdownMenu.Label className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Focus mode
            </DropdownMenu.Label>

            <DropdownMenu.Item
              className={menuItemClass}
              disabled={!onExitFocusMode || !focusActive}
              onSelect={() => onExitFocusMode?.()}
            >
              Show all (exit)
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={menuItemClass}
              disabled={!canSaveFocusView}
              onSelect={() => {
                setSaveName('');
                setSaveDialogOpen(true);
              }}
            >
              Save current view…
            </DropdownMenu.Item>

            {savedViewsSorted.length > 0 ? (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={subTriggerClass} disabled={!canApplySavedViews}>
                  Saved views
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                    {savedViewsSorted.map((v) => (
                      <DropdownMenu.Item
                        key={v.id}
                        className={menuItemClass}
                        disabled={!canApplySavedViews}
                        onSelect={() => onApplySavedFocusView?.(v.state)}
                      >
                        {v.name}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ) : null}

            <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />

            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={subTriggerClass}>
                Focus on selection neighbors
                <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                  {(['downstream', 'upstream', 'both'] as FocusDirection[]).map((dir) => (
                    <DropdownMenu.Sub key={dir}>
                      <DropdownMenu.SubTrigger
                        className={subTriggerClass}
                        disabled={!onFocusSelectionNeighbors || n === 0}
                      >
                        {dir === 'downstream'
                          ? 'Downstream'
                          : dir === 'upstream'
                            ? 'Upstream'
                            : 'Both'}
                        <ChevronDown
                          className="h-3.5 w-3.5 -rotate-90 opacity-70"
                          aria-hidden
                        />
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                          {[1, 2, 3, 4, 5].map((deg) => (
                            <DropdownMenu.Item
                              key={`${dir}-${deg}`}
                              className={menuItemClass}
                              disabled={!onFocusSelectionNeighbors || n === 0}
                              onSelect={() => onFocusSelectionNeighbors?.({ degree: deg, direction: dir })}
                            >
                              {deg}-degree
                            </DropdownMenu.Item>
                          ))}
                        </DropdownMenu.SubContent>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Sub>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>

            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={subTriggerClass} disabled={!onFocusPathBetweenSelected || n !== 2}>
                Focus on path (2 selected)
                <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                  <DropdownMenu.Item
                    className={menuItemClass}
                    disabled={!onFocusPathBetweenSelected || n !== 2}
                    onSelect={() => onFocusPathBetweenSelected?.({ mode: 'shortest' })}
                  >
                    Shortest path
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={menuItemClass}
                    disabled={!onFocusPathBetweenSelected || n !== 2}
                    onSelect={() => onFocusPathBetweenSelected?.({ mode: 'all' })}
                  >
                    All paths (capped)
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>

            {groups.length > 0 ? (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={subTriggerClass} disabled={!onFocusByGroup}>
                  Focus by group
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                    {groups.map((g) => (
                      <DropdownMenu.Item
                        key={g.id}
                        className={menuItemClass}
                        disabled={!onFocusByGroup}
                        onSelect={() => onFocusByGroup?.(g.id)}
                      >
                        {g.name}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ) : null}

            {availableTagNames.length > 0 ? (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={subTriggerClass} disabled={!onFocusByTag}>
                  Focus by tag
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                    {availableTagNames.map((tagName) => (
                      <DropdownMenu.Item
                        key={tagName}
                        className={menuItemClass}
                        disabled={!onFocusByTag}
                        onSelect={() => onFocusByTag?.(tagName)}
                      >
                        {tagName}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ) : null}

            <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />

            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={subTriggerClass} disabled={!onFocusSetDisplayMode}>
                Non-focus display: {focusDisplayMode === 'fade' ? 'fade' : 'hide'}
                <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                  <DropdownMenu.Item
                    className={menuItemClass}
                    disabled={!onFocusSetDisplayMode}
                    onSelect={() => onFocusSetDisplayMode?.('hide')}
                  >
                    Hide non-focus
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={menuItemClass}
                    disabled={!onFocusSetDisplayMode}
                    onSelect={() => onFocusSetDisplayMode?.('fade')}
                  >
                    Fade non-focus
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>

            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={subTriggerClass} disabled={!onFocusSetDirection}>
                Direction: {focusDirection}
                <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                  {(['downstream', 'upstream', 'both'] as FocusDirection[]).map((dir) => (
                    <DropdownMenu.Item
                      key={dir}
                      className={menuItemClass}
                      disabled={!onFocusSetDirection}
                      onSelect={() => onFocusSetDirection?.(dir)}
                    >
                      {dir === 'downstream'
                        ? 'Downstream'
                        : dir === 'upstream'
                          ? 'Upstream'
                          : 'Both'}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>

            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={subTriggerClass} disabled={!onFocusSetDegree}>
                Degree: {Math.max(0, focusDegree)}
                <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                  {[0, 1, 2, 3, 4, 5].map((deg) => (
                    <DropdownMenu.Item
                      key={deg}
                      className={menuItemClass}
                      disabled={!onFocusSetDegree}
                      onSelect={() => onFocusSetDegree?.(deg)}
                    >
                      {deg === 0 ? '0 (anchors only)' : `${deg}-degree`}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[10020] bg-slate-900/40 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[10021] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Saved focus views
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Save the current focus configuration (anchors, degree, direction, and display).
            </Dialog.Description>

            <div className="mt-3 flex items-center gap-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="View name (e.g. Payments core)"
                className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Saved focus view name"
              />
              <button
                type="button"
                disabled={!focusStateSnapshot || !saveName.trim()}
                className="rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 text-sm font-medium"
                onClick={() => {
                  if (!focusStateSnapshot) return;
                  const name = saveName.trim();
                  if (!name) return;
                  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                  const next: SavedFocusView[] = [
                    { id, name, state: focusStateSnapshot, createdAt: Date.now() },
                    ...savedViews,
                  ];
                  persistSavedViews(next);
                  setSaveDialogOpen(false);
                }}
              >
                Save
              </button>
            </div>

            {savedViewsSorted.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  Existing views
                </p>
                <div className="mt-2 max-h-[240px] overflow-auto rounded-md border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                  {savedViewsSorted.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between gap-2 px-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-900 dark:text-slate-100">
                          {v.name}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          Degree {v.state.focusModeDegree} · {v.state.focusDirection} ·{' '}
                          {v.state.focusDisplayMode}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={!onApplySavedFocusView}
                          className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                          onClick={() => onApplySavedFocusView?.(v.state)}
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-red-200 dark:border-red-800/60 bg-white dark:bg-slate-950 px-2 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                          onClick={() => {
                            const next = savedViews.filter((x) => x.id !== v.id);
                            persistSavedViews(next);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                No saved views yet.
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            disabled={n === 0}
            aria-label="Bulk actions"
          >
            Bulk
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuContentClass} sideOffset={6} align="start">
            {!mutationLocked && groups.length > 0 ? (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={subTriggerClass}>
                  Move to group
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                    {groups.map((g) => (
                      <DropdownMenu.Item
                        key={g.id}
                        className={menuItemClass}
                        onSelect={() => onBulkMoveToGroup(g.id)}
                      >
                        {g.name}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ) : null}
            {!mutationLocked && onCreateGroupFromSelection ? (
              <DropdownMenu.Item
                className={menuItemClass}
                disabled={n === 0}
                onSelect={() => onCreateGroupFromSelection()}
              >
                Create group from selection
              </DropdownMenu.Item>
            ) : null}
            {!mutationLocked && onBulkRemoveFromGroup ? (
              <DropdownMenu.Item
                className={menuItemClass}
                disabled={selectedClassesInGroupsCount === 0}
                onSelect={() => onBulkRemoveFromGroup()}
              >
                Remove from group
              </DropdownMenu.Item>
            ) : null}
            {!mutationLocked && onCreateGroupFromTag && availableTagNames.length > 0 ? (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={subTriggerClass}>
                  Create group from tag
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" aria-hidden />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className={submenuContentClass} sideOffset={4}>
                    {availableTagNames.map((tagName) => (
                      <DropdownMenu.Item
                        key={tagName}
                        className={menuItemClass}
                        onSelect={() => onCreateGroupFromTag(tagName)}
                      >
                        {tagName}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ) : null}
            {!mutationLocked ? (
              <DropdownMenu.Item className={menuItemClass} onSelect={() => onBulkDuplicate()}>
                Duplicate
              </DropdownMenu.Item>
            ) : null}
            {!mutationLocked ? (
              <DropdownMenu.Item
                className={`${menuItemClass} text-red-600 dark:text-red-400`}
                onSelect={() => onBulkDelete()}
              >
                Delete…
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
            <DropdownMenu.Item className={menuItemClass} onSelect={() => onBulkExportJson()}>
              Export selection as JSON
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={menuItemClass}
              disabled={!imageExportAvailable}
              onSelect={() => onBulkExportImage()}
            >
              Export selection image (PNG)
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
