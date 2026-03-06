'use client';

import { useState, useMemo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Search, Plus, LayoutGrid, Tag } from 'lucide-react';

const PLACEHOLDER_CLASSES = [
  'Account',
  'Address',
  'Contact',
  'Order',
  'Product',
  'User',
].sort((a, b) => a.localeCompare(b));

const PLACEHOLDER_PROPERTIES = [
  'createdAt',
  'email',
  'id',
  'name',
  'status',
  'updatedAt',
].sort((a, b) => a.localeCompare(b));

function SearchableList({
  items,
  emptyMessage,
  addLabel,
}: {
  items: string[];
  emptyMessage: string;
  addLabel: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((item) => item.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            aria-label="Search list"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <ul className="p-2 space-y-0.5">
          {filtered.map((item) => (
            <li
              key={item}
              className="px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-default"
            >
              {item}
            </li>
          ))}
        </ul>
        {filtered.length === 0 && (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
            {emptyMessage}
          </p>
        )}
      </div>
      <div className="p-2 border-t border-slate-200 dark:border-slate-700 shrink-0">
        <button
          type="button"
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </button>
      </div>
    </div>
  );
}

export default function DesignCanvasSidebar() {
  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col shrink-0">
      <Tabs.Root defaultValue="classes" className="flex flex-col flex-1 min-h-0">
        <Tabs.List className="flex shrink-0 border-b border-slate-200 dark:border-slate-700">
          <Tabs.Trigger
            value="classes"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-400 border-b-2 border-transparent hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <LayoutGrid className="h-4 w-4" />
            Classes
          </Tabs.Trigger>
          <Tabs.Trigger
            value="properties"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-400 border-b-2 border-transparent hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <Tag className="h-4 w-4" />
            Properties
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="classes" className="flex-1 min-h-0 mt-0">
          <SearchableList
            items={PLACEHOLDER_CLASSES}
            emptyMessage="No classes match your search."
            addLabel="Add class"
          />
        </Tabs.Content>
        <Tabs.Content value="properties" className="flex-1 min-h-0 mt-0">
          <SearchableList
            items={PLACEHOLDER_PROPERTIES}
            emptyMessage="No properties match your search."
            addLabel="Add property"
          />
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
