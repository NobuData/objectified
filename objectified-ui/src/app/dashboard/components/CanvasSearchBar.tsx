'use client';

import { useMemo } from 'react';
import * as Select from '@radix-ui/react-select';
import * as Label from '@radix-ui/react-label';
import * as Switch from '@radix-ui/react-switch';
import { Search, ChevronDown } from 'lucide-react';
import { useCanvasSearchOptional } from '@/app/contexts/CanvasSearchContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import type { SearchFilterType } from '@lib/studio/canvasSearch';

const triggerClass =
  'inline-flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-200 min-w-0 max-w-[140px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const contentClass =
  'overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg z-[10001]';
const itemClass =
  'px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800';

export default function CanvasSearchBar() {
  const search = useCanvasSearchOptional();
  const studio = useStudioOptional();
  const groups = useMemo(() => studio?.state?.groups ?? [], [studio?.state?.groups]);

  if (!search) return null;

  const { state, setQuery, setUseRegex, setFilterType, setFilterGroup, setHasProperties, setPropertyNameFilter } = search;

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
      <div className="relative flex-1 min-w-[120px] max-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
        <input
          type="search"
          placeholder="Search canvas..."
          value={state.canvasSearchQuery}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          aria-label="Canvas search query"
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch.Root
          id="canvas-search-regex"
          checked={state.useRegex}
          onCheckedChange={setUseRegex}
          className="w-9 h-5 rounded-full border border-slate-200 dark:border-slate-600 bg-slate-200 dark:bg-slate-700 data-[state=checked]:bg-indigo-600 dark:data-[state=checked]:bg-indigo-600 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          <Switch.Thumb className="block w-4 h-4 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-4" />
        </Switch.Root>
        <Label.Root htmlFor="canvas-search-regex" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
          Regex
        </Label.Root>
      </div>

      <Select.Root
        value={state.searchFilterType}
        onValueChange={(v) => setFilterType(v as SearchFilterType)}
      >
        <Select.Trigger className={triggerClass} aria-label="Filter by type">
          <Select.Value />
          <Select.Icon>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className={contentClass} position="popper" sideOffset={4}>
            <Select.Viewport>
              {(['all', 'class', 'allOf', 'oneOf', 'anyOf'] as const).map((t) => (
                <Select.Item key={t} value={t} className={itemClass}>
                  <Select.ItemText>{t === 'all' ? 'All types' : t}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <Select.Root
        value={state.searchFilterGroup ?? '__all__'}
        onValueChange={(v) => setFilterGroup(v === '__all__' ? null : v)}
      >
        <Select.Trigger className={triggerClass} aria-label="Filter by group">
          <Select.Value placeholder="All groups" />
          <Select.Icon>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className={contentClass} position="popper" sideOffset={4}>
            <Select.Viewport>
              <Select.Item value="__all__" className={itemClass}>
                <Select.ItemText>All groups</Select.ItemText>
              </Select.Item>
              {groups.map((g) => (
                <Select.Item key={g.id} value={g.id} className={itemClass}>
                  <Select.ItemText>{g.name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <Select.Root
        value={
          state.hasProperties === null
            ? '__any__'
            : state.hasProperties
              ? 'yes'
              : 'no'
        }
        onValueChange={(v) =>
          setHasProperties(v === '__any__' ? null : v === 'yes')
        }
      >
        <Select.Trigger className={triggerClass} aria-label="Has properties">
          <Select.Value placeholder="Has properties" />
          <Select.Icon>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className={contentClass} position="popper" sideOffset={4}>
            <Select.Viewport>
              <Select.Item value="__any__" className={itemClass}>
                <Select.ItemText>Any</Select.ItemText>
              </Select.Item>
              <Select.Item value="yes" className={itemClass}>
                <Select.ItemText>Has properties</Select.ItemText>
              </Select.Item>
              <Select.Item value="no" className={itemClass}>
                <Select.ItemText>No properties</Select.ItemText>
              </Select.Item>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <div className="min-w-[100px] max-w-[140px]">
        <input
          type="text"
          placeholder="Property name"
          value={state.propertyNameFilter}
          onChange={(e) => setPropertyNameFilter(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          aria-label="Filter by property name"
        />
      </div>
    </div>
  );
}
