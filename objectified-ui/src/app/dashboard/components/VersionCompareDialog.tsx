'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, GitCompare, ArrowLeftRight } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  mergePreview,
  type MergeConflict,
  type RestClientOptions,
  type VersionSchema,
} from '@lib/api/rest-client';

const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';

export interface VersionCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: VersionSchema[];
  /** Version shown as merge target (ours); preview merges *into* this version. */
  initialBaseVersionId: string;
  options: RestClientOptions;
}

export default function VersionCompareDialog({
  open,
  onOpenChange,
  versions,
  initialBaseVersionId,
  options,
}: VersionCompareDialogProps) {
  const [baseId, setBaseId] = useState(initialBaseVersionId);
  const [otherId, setOtherId] = useState('');
  const [strategy, setStrategy] = useState<'additive' | 'override'>('additive');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<MergeConflict[]>([]);
  const [mergedClassCount, setMergedClassCount] = useState<number | null>(null);

  const versionById = useMemo(() => new Map(versions.map((v) => [v.id, v])), [versions]);

  useEffect(() => {
    if (!open) return;
    setBaseId(initialBaseVersionId);
    setOtherId('');
    setStrategy('additive');
    setError(null);
    setConflicts([]);
    setMergedClassCount(null);
  }, [open, initialBaseVersionId]);

  const swapBaseAndOther = () => {
    if (!otherId) return;
    const nextBase = otherId;
    const nextOther = baseId;
    setBaseId(nextBase);
    setOtherId(nextOther);
  };

  const runCompare = async () => {
    if (!baseId || !otherId || baseId === otherId) return;
    setLoading(true);
    setError(null);
    setConflicts([]);
    setMergedClassCount(null);
    try {
      const res = await mergePreview(
        baseId,
        { source_version_id: otherId, strategy },
        options
      );
      const classes = (res.merged_state?.classes as unknown[] | undefined) ?? [];
      setMergedClassCount(Array.isArray(classes) ? classes.length : 0);
      setConflicts(res.conflicts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compare failed');
    } finally {
      setLoading(false);
    }
  };

  const baseName = versionById.get(baseId)?.name ?? baseId;
  const otherName = versionById.get(otherId)?.name ?? otherId;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-3xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700"
          aria-describedby="version-compare-desc"
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center">
              <GitCompare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Compare versions
              </Dialog.Title>
              <p id="version-compare-desc" className="text-sm text-slate-500 dark:text-slate-400">
                Merge preview without saving: see conflicts when merging the compare version into the
                base version (same strategies as merge).
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="compare-base" className={labelClass}>
                  Base (merge target)
                </label>
                <select
                  id="compare-base"
                  value={baseId}
                  onChange={(e) => setBaseId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="compare-other" className={labelClass}>
                  Compare with
                </label>
                <select
                  id="compare-other"
                  value={otherId}
                  onChange={(e) => setOtherId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select version</option>
                  {versions
                    .filter((v) => v.id !== baseId)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label htmlFor="compare-strategy" className={`${labelClass} mr-2`}>
                  Strategy
                </label>
                <select
                  id="compare-strategy"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as 'additive' | 'override')}
                  className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="additive">Additive</option>
                  <option value="override">Override</option>
                </select>
              </div>
              <button
                type="button"
                onClick={swapBaseAndOther}
                disabled={!otherId}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Swap
              </button>
              <button
                type="button"
                onClick={() => void runCompare()}
                disabled={loading || !otherId || baseId === otherId}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompare className="h-4 w-4" />}
                Run compare
              </button>
            </div>

            {mergedClassCount !== null && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-medium">{otherName}</span> →{' '}
                  <span className="font-medium">{baseName}</span>
                  {conflicts.length === 0 ? (
                    <span className="text-slate-600 dark:text-slate-400">
                      {' '}
                      — no merge conflicts for this strategy ({mergedClassCount} classes in merged
                      preview).
                    </span>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-400">
                      {' '}
                      — {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} (
                      {mergedClassCount} classes in merged preview).
                    </span>
                  )}
                </p>
                {conflicts.length > 0 && (
                  <ul className="space-y-2 max-h-48 overflow-auto text-sm">
                    {conflicts.map((c, i) => (
                      <li
                        key={`${c.path}-${i}`}
                        className="border-l-2 border-amber-400 dark:border-amber-500 pl-3 text-slate-700 dark:text-slate-300"
                      >
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {c.path}
                        </span>
                        {c.description && (
                          <p className="mt-0.5 text-slate-600 dark:text-slate-400">{c.description}</p>
                        )}
                      </li>
                    ))}
                  </ul>
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
