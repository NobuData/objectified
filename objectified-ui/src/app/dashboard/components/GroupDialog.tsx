'use client';

/**
 * Dialog to rename a group and set color/style (GitHub #83).
 */

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import { X } from 'lucide-react';
import type { StudioGroup } from '@lib/studio/types';

export interface GroupDialogProps {
  open: boolean;
  group: StudioGroup | null;
  onSave: (name: string, style: Record<string, string | number>) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const PRESET_COLORS = [
  { label: 'Default', bg: '', border: '' },
  { label: 'Blue', bg: 'rgb(219 234 254)', border: 'rgb(59 130 246)' },
  { label: 'Green', bg: 'rgb(220 252 231)', border: 'rgb(34 197 94)' },
  { label: 'Amber', bg: 'rgb(254 243 199)', border: 'rgb(245 158 11)' },
  { label: 'Violet', bg: 'rgb(237 233 254)', border: 'rgb(139 92 246)' },
];

export default function GroupDialog({
  open,
  group,
  onSave,
  onDelete,
  onClose,
}: GroupDialogProps) {
  const [name, setName] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('');
  const [borderColor, setBorderColor] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && group) {
      const style = (group.metadata?.style as Record<string, string> | undefined) ?? {};
      setName(group.name);
      setBackgroundColor(String(style.backgroundColor ?? ''));
      setBorderColor(String(style.border ?? ''));
      setError('');
    }
  }, [open, group]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Group name is required.');
      return;
    }
    setError('');
    const style: Record<string, string | number> = {};
    if (backgroundColor.trim()) style.backgroundColor = backgroundColor.trim();
    if (borderColor.trim()) style.border = borderColor.trim();
    onSave(trimmed, style);
  };

  if (!group) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Edit group
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-col gap-4 px-6 py-4 overflow-auto">
            <div className="grid gap-2">
              <Label.Root htmlFor="group-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Name
              </Label.Root>
              <input
                id="group-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                placeholder="Group name"
              />
            </div>
            <div className="grid gap-2">
              <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Color presets
              </Label.Root>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setBackgroundColor(preset.bg);
                      setBorderColor(preset.border);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    title={preset.label}
                    style={
                      preset.bg || preset.border
                        ? { backgroundColor: preset.bg || undefined, borderColor: preset.border || undefined }
                        : undefined
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label.Root htmlFor="group-bg" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Background color
              </Label.Root>
              <input
                id="group-bg"
                type="text"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono"
                placeholder="e.g. rgb(219 234 254)"
              />
            </div>
            <div className="grid gap-2">
              <Label.Root htmlFor="group-border" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Border color
              </Label.Root>
              <input
                id="group-border"
                type="text"
                value={borderColor}
                onChange={(e) => setBorderColor(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono"
                placeholder="e.g. rgb(59 130 246)"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <div>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    onClose();
                  }}
                  className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-sm font-medium"
                >
                  Delete group
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-sm font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
