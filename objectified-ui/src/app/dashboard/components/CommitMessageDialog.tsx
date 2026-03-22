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
  onCommit: (payload: { message: string | null; externalId: string | null }) => void;
  loading?: boolean;
  suggestedMessage?: string | null;
  pendingChangesSummary?: string | null;
  validationErrors?: string[];
  validationWarnings?: string[];
  requireMessage?: boolean;
  onRequireMessageChange?: (required: boolean) => void;
}

export default function CommitMessageDialog({
  open,
  onOpenChange,
  onCommit,
  loading = false,
  suggestedMessage = null,
  pendingChangesSummary = null,
  validationErrors = [],
  validationWarnings = [],
  requireMessage = false,
  onRequireMessageChange,
}: CommitMessageDialogProps) {
  const [message, setMessage] = useState('');
  const [externalId, setExternalId] = useState('');
  const hasValidationIssues = validationErrors.length > 0 || validationWarnings.length > 0;
  const messageMissing = requireMessage && message.trim() === '';

  useEffect(() => {
    if (!open) return;
    setMessage((prev) =>
      prev.trim() === '' ? suggestedMessage ?? '' : prev
    );
  }, [open, suggestedMessage]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setMessage('');
        setExternalId('');
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleCommit = useCallback(() => {
    if (messageMissing) return;
    onCommit({
      message: message.trim() || null,
      externalId: externalId.trim() || null,
    });
    setMessage('');
    setExternalId('');
    onOpenChange(false);
  }, [message, externalId, messageMissing, onCommit, onOpenChange]);

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
            Snapshot local state to the server. Add an optional message and external id
            (for example ticket id or CI run id).
          </Dialog.Description>
          {hasValidationIssues && (
            <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/20 p-3 text-xs">
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Pre-commit validation summary
              </div>
              {validationErrors.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-red-700 dark:text-red-300">
                  {validationErrors.map((item) => (
                    <li key={`commit-error-${item}`}>Error: {item}</li>
                  ))}
                </ul>
              )}
              {validationWarnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-amber-800 dark:text-amber-200">
                  {validationWarnings.map((item) => (
                    <li key={`commit-warning-${item}`}>Warning: {item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {pendingChangesSummary && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              Pending changes: {pendingChangesSummary}
            </p>
          )}
          <label className="mb-3 inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={requireMessage}
              onChange={(e) => onRequireMessageChange?.(e.target.checked)}
              disabled={loading}
              aria-label="Require commit message"
            />
            Require commit message before committing
          </label>
          <label htmlFor="commit-message" className={labelClass}>
            Message {requireMessage ? '(required)' : '(optional)'}
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
          {messageMissing && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-300" role="alert">
              Commit message is required.
            </p>
          )}
          <label htmlFor="commit-external-id" className={`${labelClass} mt-3`}>
            External id (optional)
          </label>
          <input
            id="commit-external-id"
            type="text"
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder="ticket-212 / ci-12345"
            className={`${inputClass} mt-1`}
            disabled={loading}
            aria-label="Commit external id"
          />
          <div className="flex justify-end gap-2 mt-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {hasValidationIssues ? 'Fix issues' : 'Cancel'}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleCommit}
              disabled={loading || messageMissing}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Committing…' : hasValidationIssues ? 'Commit anyway' : 'Commit'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
