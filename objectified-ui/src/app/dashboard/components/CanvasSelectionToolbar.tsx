'use client';

/**
 * Canvas selection count and bulk actions (GitHub #234, #237).
 */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { StudioGroup } from '@lib/studio/types';
import { ChevronDown } from 'lucide-react';

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
}: CanvasSelectionToolbarProps) {
  const n = selectedClassIds.length;

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
