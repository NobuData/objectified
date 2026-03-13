'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface ClassDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** 'add' to create a new class; 'edit' to modify an existing one. */
  mode: 'add' | 'edit';
  /** Initial values to pre-populate when editing. */
  initial?: { name: string; description: string };
  /** Called with the form data when the user saves. */
  onSave: (data: { name: string; description: string }) => void;
  /** Called when the dialog is closed without saving. */
  onClose: () => void;
}

/**
 * Dialog for adding or editing a class.
 * Updates local state only — no REST call is made here.
 */
interface FormState {
  name: string;
  description: string;
  error: string;
}

export default function ClassDialog({
  open,
  mode,
  initial,
  onSave,
  onClose,
}: ClassDialogProps) {
  const [form, setForm] = useState<FormState>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    error: '',
  });

  // Reset form when dialog opens (single state update avoids cascading renders)
  useEffect(() => {
    if (open) {
      setForm({ name: initial?.name ?? '', description: initial?.description ?? '', error: '' });
    }
  }, [open, initial?.name, initial?.description]);

  const { name, description, error } = form;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setForm((f) => ({ ...f, error: 'Class name is required.' }));
      return;
    }
    setForm((f) => ({ ...f, error: '' }));
    onSave({ name: trimmed, description: description.trim() });
  };

  const title = mode === 'add' ? 'Add Class' : 'Edit Class';

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {title}
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

          {/* Body */}
          <div className="px-6 py-4 flex-1 overflow-auto space-y-4">
            {/* Class name */}
            <div className="space-y-1">
              <label
                htmlFor="class-name"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="class-name"
                type="text"
                value={name}
                onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value, error: '' })); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                placeholder="e.g. User, Product, Order"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                autoFocus
              />
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label
                htmlFor="class-description"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Description
              </label>
              <textarea
                id="class-description"
                value={description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description for this class"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {mode === 'add' ? 'Add Class' : 'Save Changes'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}




