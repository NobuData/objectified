'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Upload } from 'lucide-react';
import { listVersions, type VersionSchema, type RestClientOptions } from '@lib/api/rest-client';

const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';

export interface PushTargetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  projectId: string;
  currentVersionId: string;
  options: RestClientOptions;
  onPush: (targetVersionId: string) => void;
  loading?: boolean;
}

export default function PushTargetDialog({
  open,
  onOpenChange,
  tenantId,
  projectId,
  currentVersionId,
  options,
  onPush,
  loading = false,
}: PushTargetDialogProps) {
  const [versions, setVersions] = useState<VersionSchema[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tenantId || !projectId) return;
    setLoadingVersions(true);
    setError(null);
    listVersions(tenantId, projectId, options)
      .then((list) => {
        setVersions(list);
        setSelectedId('');
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load versions');
        setVersions([]);
      })
      .finally(() => setLoadingVersions(false));
  }, [open, tenantId, projectId, options.jwt, options.apiKey]);

  const handlePush = useCallback(() => {
    if (!selectedId) return;
    onPush(selectedId);
    onOpenChange(false);
  }, [selectedId, onPush, onOpenChange]);

  const targets = versions.filter((v) => v.id !== currentVersionId);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700 p-4"
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center">
              <Upload className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Push to version
            </Dialog.Title>
          </div>
          <Dialog.Description className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Push current state to another version in this project.
          </Dialog.Description>
          {error && (
            <div
              className="mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
              role="alert"
            >
              {error}
            </div>
          )}
          <label htmlFor="push-target" className={labelClass}>
            Target version
          </label>
          <select
            id="push-target"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={loadingVersions || loading || targets.length === 0}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Select target version"
          >
            <option value="">
              {loadingVersions
                ? 'Loading…'
                : targets.length === 0
                  ? 'No other versions'
                  : 'Select version'}
            </option>
            {targets.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
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
              onClick={handlePush}
              disabled={loading || !selectedId}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                  Pushing…
                </>
              ) : (
                'Push'
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
