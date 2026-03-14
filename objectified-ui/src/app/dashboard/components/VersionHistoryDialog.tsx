'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Pencil, Eye, RotateCcw } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  listVersionSnapshotsMetadata,
  rollbackVersion,
  type VersionSnapshotMetadataSchema,
  type RestClientOptions,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';

export interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionId: string;
  versionName?: string;
  options: RestClientOptions;
  /** Called when user chooses to load a revision. If not provided, Load/View actions are hidden. */
  onLoadRevision?: (revision: number, readOnly: boolean) => void;
  /** Called after successful rollback so parent can reload version state. If provided, Rollback button is shown. */
  onRollbackSuccess?: () => void;
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMessage(snap: VersionSnapshotMetadataSchema): string {
  if (snap.label?.trim()) return snap.label.trim();
  if (snap.description?.trim()) return snap.description.trim();
  return '—';
}

export default function VersionHistoryDialog({
  open,
  onOpenChange,
  versionId,
  versionName,
  options,
  onLoadRevision,
  onRollbackSuccess,
}: VersionHistoryDialogProps) {
  const { confirm } = useDialog();
  const [snapshots, setSnapshots] = useState<VersionSnapshotMetadataSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    if (!versionId || !open) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listVersionSnapshotsMetadata(versionId, options);
      setSnapshots(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load version history');
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [versionId, open, options]);

  useEffect(() => {
    if (open) {
      setSnapshots([]);
      setError(null);
      fetchSnapshots();
    }
  }, [open, versionId, fetchSnapshots]);

  const handleRollback = useCallback(
    async (revision: number) => {
      if (!versionId || !onRollbackSuccess) return;
      const ok = await confirm({
        title: 'Rollback to this revision?',
        message:
          'Version state will be set to this revision and a new snapshot will be appended to history. Continue?',
        variant: 'warning',
        confirmLabel: 'Rollback',
        cancelLabel: 'Cancel',
      });
      if (!ok) return;
      setRollbackSubmitting(true);
      setError(null);
      try {
        await rollbackVersion(versionId, { revision }, options);
        await fetchSnapshots();
        onRollbackSuccess();
        onOpenChange(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Rollback failed');
      } finally {
        setRollbackSubmitting(false);
      }
    },
    [versionId, options, onRollbackSuccess, onOpenChange, confirm, fetchSnapshots]
  );

  const showActions = Boolean(onLoadRevision || onRollbackSuccess);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700"
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center">
              <History className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Version history
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                List of revisions (id, date, message) for this version.
              </Dialog.Description>
              {versionName && (
                <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                  {versionName}
                </p>
              )}
            </div>
          </div>

          <div className="p-4 flex-1 overflow-auto min-h-0">
            {error && (
              <div
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
                role="alert"
              >
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
              </div>
            ) : snapshots.length === 0 && !error ? (
              <p className="py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                No revisions yet. Commit to create version history.
              </p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Revision
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Message
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        ID
                      </th>
                      {showActions && (
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {snapshots.map((snap) => (
                      <tr
                        key={snap.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-2.5 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                          {snap.revision}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {formatDateTime(snap.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate">
                          {formatMessage(snap)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-400 dark:text-slate-500">
                          {snap.id.slice(0, 8)}…
                        </td>
                        {showActions && (
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {onLoadRevision && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onLoadRevision(snap.revision, true);
                                      onOpenChange(false);
                                    }}
                                    disabled={rollbackSubmitting}
                                    className="p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50"
                                    title="View this revision (read-only)"
                                    aria-label={`View revision ${snap.revision} read-only`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onLoadRevision(snap.revision, false);
                                      onOpenChange(false);
                                    }}
                                    disabled={rollbackSubmitting}
                                    className="p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50"
                                    title="Load this revision to edit"
                                    aria-label={`Load revision ${snap.revision} to edit`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                              {onRollbackSuccess && (
                                <button
                                  type="button"
                                  onClick={() => handleRollback(snap.revision)}
                                  disabled={rollbackSubmitting}
                                  className="p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50"
                                  title="Rollback version to this revision"
                                  aria-label={`Rollback to revision ${snap.revision}`}
                                >
                                  {rollbackSubmitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
