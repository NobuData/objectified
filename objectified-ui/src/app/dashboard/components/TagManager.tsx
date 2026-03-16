'use client';

import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export type TagDefinitions = Record<string, { color?: string }>;

const DEFAULT_TAG_COLOR = '#94a3b8';

const PRESET_COLORS = [
  '#64748b',
  '#94a3b8',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
];

interface TagManagerProps {
  /** All tag names used in the project (from classes) and/or defined in tagDefinitions. */
  tagNames: string[];
  /** Current tag name -> color. Updated when user changes color. */
  tagDefinitions: TagDefinitions;
  onUpdateTagDefinitions: (next: TagDefinitions) => void;
  canEdit: boolean;
}

export default function TagManager({
  tagNames,
  tagDefinitions,
  onUpdateTagDefinitions,
  canEdit,
}: TagManagerProps) {
  const [editingColorFor, setEditingColorFor] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');

  const sortedNames = useMemo(
    () => Array.from(new Set(tagNames)).sort((a, b) => a.localeCompare(b)),
    [tagNames]
  );

  const setTagColor = (name: string, color: string) => {
    onUpdateTagDefinitions({
      ...tagDefinitions,
      [name]: { ...tagDefinitions[name], color },
    });
    setEditingColorFor(null);
  };

  const removeTagDefinition = (name: string) => {
    const next = { ...tagDefinitions };
    delete next[name];
    onUpdateTagDefinitions(next);
  };

  const addTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed || tagDefinitions[trimmed] || sortedNames.includes(trimmed)) {
      return;
    }
    onUpdateTagDefinitions({
      ...tagDefinitions,
      [trimmed]: { color: DEFAULT_TAG_COLOR },
    });
    setNewTagName('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto min-h-0 p-2">
        {sortedNames.length === 0 && !canEdit && (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
            No tags in this project yet. Add tags when editing a class.
          </p>
        )}
        {sortedNames.length === 0 && canEdit && (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
            No tags yet. Add a tag below or assign tags to a class when editing it.
          </p>
        )}
        {sortedNames.length > 0 && (
          <ul className="space-y-1">
            {sortedNames.map((name) => {
              const color =
                tagDefinitions[name]?.color ?? DEFAULT_TAG_COLOR;
              const isEditing = editingColorFor === name;
              return (
                <li
                  key={name}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 group"
                >
                  <span
                    className="w-4 h-4 rounded shrink-0 border border-slate-300 dark:border-slate-600"
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">
                    {name}
                  </span>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Popover.Root
                        open={isEditing}
                        onOpenChange={(open) => setEditingColorFor(open ? name : null)}
                      >
                        <Popover.Trigger asChild>
                          <button
                            type="button"
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                            aria-label={`Edit color for ${name}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            className="relative z-[10010] w-52 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg p-3 focus:outline-none"
                            sideOffset={6}
                            align="end"
                          >
                            {/* Arrow at top-right corner pointing up toward trigger */}
                            <span
                              className="absolute -top-2 right-3 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-slate-200 dark:border-b-slate-600"
                              aria-hidden
                            />
                            <span
                              className="absolute -top-1.5 right-3 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[7px] border-b-white dark:border-b-slate-900"
                              aria-hidden
                            />
                            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                              Tag color
                            </p>
                            <div className="grid grid-cols-6 gap-1.5 mb-3">
                              {PRESET_COLORS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setTagColor(name, c)}
                                  className="w-6 h-6 rounded border-2 border-slate-300 dark:border-slate-600 hover:scale-110 transition-transform"
                                  style={{ backgroundColor: c }}
                                  aria-label={`Set color to ${c}`}
                                />
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-600 dark:text-slate-400 shrink-0">
                                Custom:
                              </label>
                              <input
                                type="color"
                                value={color}
                                onChange={(e) =>
                                  setTagColor(name, e.target.value)
                                }
                                className="h-7 w-10 rounded cursor-pointer border border-slate-200 dark:border-slate-600 bg-transparent"
                                aria-label={`Custom color for ${name}`}
                              />
                              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                {color}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                removeTagDefinition(name);
                                setEditingColorFor(null);
                              }}
                              className="mt-2 w-full py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-t border-slate-200 dark:border-slate-700"
                            >
                              Reset to default color
                            </button>
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                      <button
                        type="button"
                        onClick={() => removeTagDefinition(name)}
                        className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        aria-label={`Remove color for ${name}`}
                        title="Remove custom color (tag will use default in classes)"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canEdit && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTag();
              }}
              placeholder="New tag name"
              className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="New tag name"
            />
            <button
              type="button"
              onClick={addTag}
              disabled={!newTagName.trim()}
              className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-1"
              aria-label="Add tag"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
