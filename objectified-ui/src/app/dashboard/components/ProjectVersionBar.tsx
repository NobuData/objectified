'use client';

import * as Select from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';

const projects = [
  { value: 'default', label: 'Default Project' },
];
const versions = [
  { value: '1', label: 'Version 1' },
];

export default function ProjectVersionBar() {
  return (
    <div className="flex items-center gap-4 h-12 px-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
      <Select.Root defaultValue="default">
        <Select.Trigger
          className="inline-flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 min-w-[180px] hover:bg-slate-50 dark:hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          aria-label="Select project"
        >
          <Select.Value placeholder="Select project" />
          <Select.Icon>
            <ChevronDown className="h-4 w-4" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg z-50"
            position="popper"
            sideOffset={4}
          >
            <Select.Viewport>
              {projects.map((p) => (
                <Select.Item
                  key={p.value}
                  value={p.value}
                  className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800"
                >
                  <Select.ItemText>{p.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <Select.Root defaultValue="1">
        <Select.Trigger
          className="inline-flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 min-w-[140px] hover:bg-slate-50 dark:hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          aria-label="Select version"
        >
          <Select.Value placeholder="Select version" />
          <Select.Icon>
            <ChevronDown className="h-4 w-4" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg z-50"
            position="popper"
            sideOffset={4}
          >
            <Select.Viewport>
              {versions.map((v) => (
                <Select.Item
                  key={v.value}
                  value={v.value}
                  className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800"
                >
                  <Select.ItemText>{v.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
