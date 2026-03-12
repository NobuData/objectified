'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, GitCompare } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  pullVersion,
  listVersionSnapshots,
  type VersionPullDiff,
  type VersionSnapshotSchema,
  type RestClientOptions,
} from '@lib/api/rest-client';

const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';

export interface VersionDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionId: string;
  versionName: string;
  options: RestClientOptions;
}

function formatSnapshotLabel(snap: VersionSnapshotSchema): string {
  const rev = snap.revision;
  const label = snap.label ? ` ${snap.label}` : '';
  const date = snap.created_at
    ? new Date(snap.created_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  return `Revision ${rev}${label}${date ? ` (${date})` : ''}`;
}

export default function VersionDiffDialog({
  open,
  onOpenChange,
  versionId,
  versionName,
  options,
}: VersionDiffDialogProps) {
  const [snapshots, setSnapshots] = useState<VersionSnapshotSchema[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<number | ''>('');
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diff, setDiff] = useState<VersionPullDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    if (!versionId || !open) return;
    setLoadingSnapshots(true);
    setError(null);
    try {
      const list = await listVersionSnapshots(versionId, options);
      setSnapshots(list);
      if (list.length > 0 && selectedRevision === '') {
        setSelectedRevision(list[list.length - 1].revision);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load snapshots');
      setSnapshots([]);
    } finally {
      setLoadingSnapshots(false);
    }
  }, [versionId, open, options, selectedRevision]);

  useEffect(() => {
    if (open) {
      fetchSnapshots();
      setDiff(null);
      setError(null);
    }
  }, [open, fetchSnapshots]);

  const loadDiff = async () => {
    if (selectedRevision === '') return;
    setLoadingDiff(true);
    setError(null);
    try {
      const res = await pullVersion(versionId, options, undefined, selectedRevision);
      setDiff(res.diff ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load diff');
      setDiff(null);
    } finally {
      setLoadingDiff(false);
    }
  };

  const hasDiff =
    diff &&
    ((diff.added_class_names?.length ?? 0) > 0 ||
      (diff.removed_class_names?.length ?? 0) > 0 ||
      (diff.modified_classes?.length ?? 0) > 0);

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
              <GitCompare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Version diff
              </Dialog.Title>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                {versionName}
              </p>
            </div>
          </div>

          <div className="p-4 space-y-4 flex-1 overflow-auto">
            {error && (
              <div
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
                role="alert"
              >
                {error}
              </div>
            )}

            <div>
              <label htmlFor="version-diff-base" className={labelClass}>
                Compare current with revision
              </label>
              <div className="mt-1 flex gap-2">
                <select
                  id="version-diff-base"
                  value={selectedRevision === '' ? '' : String(selectedRevision)}
                  onChange={(e) =>
                    setSelectedRevision(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  disabled={loadingSnapshots || snapshots.length === 0}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">
                    {loadingSnapshots
                      ? 'Loading…'
                      : snapshots.length === 0
                        ? 'No snapshots (commit to create revisions)'
                        : 'Select revision'}
                  </option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.revision}>
                      {formatSnapshotLabel(s)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={loadDiff}
                  disabled={loadingDiff || selectedRevision === ''}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {loadingDiff ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GitCompare className="h-4 w-4" />
                  )}
                  Load diff
                </button>
              </div>
            </div>

            {diff && !hasDiff && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No changes since the selected revision.
              </p>
            )}

            {diff && hasDiff && (
              <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/30">
                {(diff.added_class_names?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-400 mb-2">
                      Added classes
                    </h4>
                    <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-300 space-y-0.5">
                      {diff.added_class_names!.map((name) => (
                        <li key={name} className="font-mono">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(diff.removed_class_names?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400 mb-2">
                      Removed classes
                    </h4>
                    <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-300 space-y-0.5">
                      {diff.removed_class_names!.map((name) => (
                        <li key={name} className="font-mono">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(diff.modified_classes?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">
                      Modified classes
                    </h4>
                    <ul className="space-y-3">
                      {diff.modified_classes!.map((mc) => (
                        <li
                          key={mc.class_name}
                          className="text-sm border-l-2 border-amber-400 dark:border-amber-500 pl-3"
                        >
                          <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                            {mc.class_name}
                          </span>
                          <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
                            {(mc.added_property_names?.length ?? 0) > 0 &&
                              mc.added_property_names!.map((p) => (
                                <li key={p} className="font-mono">
                                  + {p}
                                </li>
                              ))}
                            {(mc.removed_property_names?.length ?? 0) > 0 &&
                              mc.removed_property_names!.map((p) => (
                                <li key={p} className="font-mono">
                                  − {p}
                                </li>
                              ))}
                            {(mc.modified_property_names?.length ?? 0) > 0 &&
                              mc.modified_property_names!.map((p) => (
                                <li key={p} className="font-mono">
                                  ~ {p}
                                </li>
                              ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
