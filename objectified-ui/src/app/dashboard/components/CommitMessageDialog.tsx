'use client';

import { useState, useCallback, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { GitCommit } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400';
const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';

export interface CommitMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: (message: string | null) => void;
  loading?: boolean;
  suggestedMessage?: string | null;
  pendingChangesSummary?: string | null;
}

export default function CommitMessageDialog({
  open,
  onOpenChange,
  onCommit,
  loading = false,
  suggestedMessage = null,
  pendingChangesSummary = null,
}: CommitMessageDialogProps) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setMessage((prev) =>
      prev.trim() === '' ? suggestedMessage ?? '' : prev
    );
  }, [open, suggestedMessage]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setMessage('');
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleCommit = useCallback(() => {
    onCommit(message.trim() || null);
    setMessage('');
    onOpenChange(false);
  }, [message, onCommit, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700 p-4"
          onEscapeKeyDown={() => handleOpenChange(false)}
          onPointerDownOutside={() => handleOpenChange(false)}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center">
              <GitCommit className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Commit
            </Dialog.Title>
          </div>
          <Dialog.Description className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Snapshot local state to the server. Optional message below.
          </Dialog.Description>
          {pendingChangesSummary && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              Pending changes: {pendingChangesSummary}
            </p>
          )}
          <label htmlFor="commit-message" className={labelClass}>
            Message (optional)
          </label>
          <input
            id="commit-message"
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe this commit..."
            className={`${inputClass} mt-1`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCommit();
            }}
            disabled={loading}
            aria-label="Commit message"
          />
          <div className="flex justify-end gap-2 mt-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleCommit}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Committing…' : 'Commit'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
