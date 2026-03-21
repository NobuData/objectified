'use client';

import React from 'react';
import * as Select from '@radix-ui/react-select';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Checkbox from '@radix-ui/react-checkbox';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Check,
} from 'lucide-react';

const toolbarSelectTriggerClass =
  'inline-flex items-center justify-between gap-2 min-w-[120px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const toolbarSelectContentClass =
  'overflow-hidden rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-[10003]';
const toolbarSelectItemClass =
  'px-3 py-2 text-sm text-slate-900 dark:text-slate-100 cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-700';

export interface ListTableColumnOption {
  id: string;
  label: string;
}

export interface ListTableToolbarProps {
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  page: number;
  onPageChange: (p: number) => void;
  totalItems: number;
  columnOptions: ListTableColumnOption[];
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (id: string, visible: boolean) => void;
  onExportCsv?: () => void;
  exportLabel?: string;
  /** Accessible name for the pagination region */
  label?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function escapeCsvCell(value: string): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsvContent(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadCsvFile(filename: string, content: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ListTableToolbar({
  pageSize,
  onPageSizeChange,
  page,
  onPageChange,
  totalItems,
  columnOptions,
  columnVisibility,
  onColumnVisibilityChange,
  onExportCsv,
  exportLabel = 'Export CSV',
  label = 'Table',
}: ListTableToolbarProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = totalItems === 0 ? 0 : Math.min(totalItems, safePage * pageSize);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40">
      <p className="text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
        {totalItems === 0 ? (
          <>No rows</>
        ) : (
          <>
            Showing {start}–{end} of {totalItems}
          </>
        )}
      </p>
      <div
        className="flex flex-wrap items-center gap-2"
        role="navigation"
        aria-label={`${label} pagination and options`}
      >
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            disabled={safePage <= 1 || totalItems === 0}
            className="inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums px-1 min-w-[4.5rem] text-center">
            {totalItems === 0 ? '0 / 0' : `${safePage} / ${totalPages}`}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
            disabled={safePage >= totalPages || totalItems === 0}
            className="inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <Select.Root
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <Select.Trigger
            className={toolbarSelectTriggerClass}
            aria-label="Rows per page"
          >
            <Select.Value placeholder="Page size" />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              className={toolbarSelectContentClass}
              position="popper"
              sideOffset={4}
            >
              <Select.Viewport>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <Select.Item
                    key={n}
                    value={String(n)}
                    className={toolbarSelectItemClass}
                  >
                    <Select.ItemText>{n} per page</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        {columnOptions.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Column visibility"
              >
                <Columns3 className="h-4 w-4" aria-hidden />
                Columns
                <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-[10003] p-2"
                sideOffset={4}
                align="end"
              >
                <p className="px-2 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Visible columns
                </p>
                {columnOptions.map((col) => (
                  <DropdownMenu.Item
                    key={col.id}
                    className="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-slate-900 dark:text-slate-100 cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-700"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <Checkbox.Root
                      id={`col-vis-${col.id}`}
                      checked={columnVisibility[col.id] !== false}
                      onCheckedChange={(checked) =>
                        onColumnVisibilityChange(col.id, checked === true)
                      }
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    >
                      <Checkbox.Indicator className="flex items-center justify-center text-white">
                        <Check className="h-3 w-3" />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                    <label
                      htmlFor={`col-vis-${col.id}`}
                      className="cursor-pointer flex-1"
                    >
                      {col.label}
                    </label>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}

        {onExportCsv && (
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Download className="h-4 w-4" aria-hidden />
            {exportLabel}
          </button>
        )}
      </div>
    </div>
  );
}
