'use client';

/**
 * Dialog for adding or editing a project-level property (name, description).
 * Reference: GitHub #99 — Properties tab add, edit, delete.
 */

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export interface ProjectPropertyFormData {
  name: string;
  description: string;
}

interface ProjectPropertyDialogProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial?: { name: string; description: string };
  existingNames?: string[];
  onSave: (data: ProjectPropertyFormData) => void;
  onClose: () => void;
}

export default function ProjectPropertyDialog({
  open,
  mode,
  initial,
  existingNames = [],
  onSave,
  onClose,
}: ProjectPropertyDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setError('');
    }
  }, [open, initial?.name, initial?.description]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required.');
      return;
    }
    const nameLower = trimmed.toLowerCase();
    const exists = existingNames.some(
      (n) => n.trim().toLowerCase() === nameLower
    );
    if (mode === 'add' && exists) {
      setError('A property with this name already exists.');
      return;
    }
    if (mode === 'edit' && initial?.name && initial.name.trim().toLowerCase() !== nameLower && exists) {
      setError('A property with this name already exists.');
      return;
    }
    onSave({ name: trimmed, description: description.trim() });
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10000]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10001] w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-6 focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              {mode === 'add' ? 'Add project property' : 'Edit project property'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="project-property-name"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Name
              </label>
              <input
                id="project-property-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={mode === 'edit'}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="Property name"
                aria-invalid={!!error}
              />
            </div>
            <div>
              <label
                htmlFor="project-property-description"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Description (optional)
              </label>
              <textarea
                id="project-property-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Description"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              >
                {mode === 'add' ? 'Add' : 'Save'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
