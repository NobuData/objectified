'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { GitMerge, Loader2, Check, ArrowRight, Pencil } from 'lucide-react';
import {
  listVersions,
  mergePreview,
  mergeResolve,
  type VersionSchema,
  type RestClientOptions,
  type MergeConflict,
  type MergePreviewResponse,
  type ConflictResolutionChoice,
} from '@lib/api/rest-client';
import { useStudio } from '@/app/contexts/StudioContext';
import { stateToCommitPayload } from '@lib/studio/stateAdapter';

const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';
const inputClass =
  'w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';

type ResolutionUse = 'ours' | 'theirs' | 'custom';

interface ResolutionChoice {
  use: ResolutionUse;
  custom_value?: unknown;
}

export interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionId: string;
  /** When provided (e.g. from Push 409), use this as merge source (theirs). */
  initialSourceVersionId?: string | null;
  options: RestClientOptions;
  tenantId: string;
  projectId: string;
  onApplied: () => void;
}

function formatConflictValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseCustomValue(str: string, original: unknown): unknown {
  const trimmed = str.trim();
  if (trimmed === '') return original;
  if (typeof original === 'number') {
    const n = Number(trimmed);
    if (!Number.isNaN(n)) return n;
  }
  if (typeof original === 'boolean') {
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

export default function MergeDialog({
  open,
  onOpenChange,
  versionId,
  initialSourceVersionId,
  options,
  tenantId,
  projectId,
  onApplied,
}: MergeDialogProps) {
  const studio = useStudio();
  const [versions, setVersions] = useState<VersionSchema[]>([]);
  const [sourceVersionId, setSourceVersionId] = useState<string>(initialSourceVersionId ?? '');
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<MergePreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ResolutionChoice>>({});
  const [customEditPath, setCustomEditPath] = useState<string | null>(null);
  const [customEditValue, setCustomEditValue] = useState('');

  const state = studio.state;
  const isDirty = studio.isDirty;

  const effectiveSourceId = sourceVersionId || initialSourceVersionId || '';

  const fetchVersions = useCallback(async () => {
    if (!tenantId || !projectId) return;
    setLoadingVersions(true);
    setError(null);
    try {
      const list = await listVersions(tenantId, projectId, options);
      setVersions(list.filter((v) => v.id !== versionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load versions');
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  }, [tenantId, projectId, versionId, options.jwt, options.apiKey]);

  const fetchPreview = useCallback(async () => {
    if (!effectiveSourceId || !state) return;
    setLoadingPreview(true);
    setError(null);
    setPreview(null);
    setResolutions({});
    try {
      const ours_state =
        isDirty && state
          ? {
              classes: stateToCommitPayload(state).classes,
              canvas_metadata: state.canvas_metadata ?? null,
            }
          : undefined;
      const body = {
        source_version_id: effectiveSourceId,
        strategy: 'override' as const,
        ours_state: ours_state ?? undefined,
      };
      const res = await mergePreview(versionId, body, options);
      setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load merge preview');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [versionId, effectiveSourceId, state, isDirty, options.jwt, options.apiKey]);

  useEffect(() => {
    if (open) {
      fetchVersions();
    }
  }, [open, fetchVersions]);

  useEffect(() => {
    if (open && effectiveSourceId && state) {
      fetchPreview();
    }
  }, [open, effectiveSourceId, state?.versionId, fetchPreview]);

  useEffect(() => {
    if (open) {
      setSourceVersionId(initialSourceVersionId ?? '');
    }
  }, [open, initialSourceVersionId]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setPreview(null);
        setResolutions({});
        setCustomEditPath(null);
        setCustomEditValue('');
        setError(null);
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const setResolution = useCallback((path: string, choice: ResolutionChoice) => {
    setResolutions((prev) => ({ ...prev, [path]: choice }));
    if (choice.use !== 'custom') {
      setCustomEditPath((p) => (p === path ? null : p));
    } else {
      setCustomEditPath(path);
    }
  }, []);

  const startCustomEdit = useCallback((conflict: MergeConflict) => {
    setResolutions((prev) => ({
      ...prev,
      [conflict.path]: { use: 'custom', custom_value: conflict.local_value },
    }));
    setCustomEditPath(conflict.path);
    setCustomEditValue(formatConflictValue(conflict.local_value));
  }, []);

  const commitCustomValue = useCallback(
    (path: string) => {
      const conflict = preview?.conflicts?.find((c) => c.path === path);
      if (!conflict) return;
      const value = parseCustomValue(customEditValue, conflict.local_value);
      setResolutions((prev) => ({
        ...prev,
        [path]: { use: 'custom', custom_value: value },
      }));
      setCustomEditPath(null);
      setCustomEditValue('');
    },
    [preview?.conflicts, customEditValue]
  );

  const handleApply = useCallback(async () => {
    if (!preview || !effectiveSourceId) return;
    setApplying(true);
    setError(null);
    try {
      const conflict_resolutions: ConflictResolutionChoice[] = preview.conflicts.map((c) => {
        const r = resolutions[c.path];
        if (r?.use === 'ours')
          return { path: c.path, use: 'ours' as const };
        if (r?.use === 'theirs')
          return { path: c.path, use: 'theirs' as const };
        if (r?.use === 'custom' && r.custom_value !== undefined)
          return { path: c.path, use: 'custom' as const, custom_value: r.custom_value };
        return { path: c.path, use: 'ours' as const };
      });
      const ours_state =
        isDirty && state
          ? {
              classes: stateToCommitPayload(state).classes,
              canvas_metadata: state.canvas_metadata ?? null,
            }
          : undefined;
      await mergeResolve(
        versionId,
        {
          source_version_id: effectiveSourceId,
          strategy: 'override',
          conflict_resolutions,
          apply: true,
          ours_state: ours_state ?? undefined,
        },
        options
      );
      studio.clearPushConflict409();
      await studio.loadFromServer(versionId, options, {
        tenantId: tenantId || undefined,
        projectId: projectId || undefined,
      });
      onApplied();
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply merge');
    } finally {
      setApplying(false);
    }
  }, [
    preview,
    effectiveSourceId,
    resolutions,
    isDirty,
    state,
    versionId,
    options,
    tenantId,
    projectId,
    studio,
    onApplied,
    handleOpenChange,
  ]);

  const sourceVersionName =
    versions.find((v) => v.id === effectiveSourceId)?.name ??
    (initialSourceVersionId ? 'Selected version' : '');

  const hasConflicts = (preview?.conflicts?.length ?? 0) > 0;
  const allResolved =
    !hasConflicts ||
    preview!.conflicts.every((c) => {
      const r = resolutions[c.path];
      return r?.use === 'ours' || r?.use === 'theirs' || (r?.use === 'custom' && r.custom_value !== undefined);
    });

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700 p-4"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center">
              <GitMerge className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Merge versions
            </Dialog.Title>
          </div>
          <Dialog.Description className="text-sm text-slate-500 dark:text-slate-400 mb-3 shrink-0">
            Merge changes from another version into the current version. Resolve any conflicts below, then apply.
          </Dialog.Description>

          {!effectiveSourceId ? (
            <div className="space-y-2">
              <label htmlFor="merge-source" className={labelClass}>
                Source version (theirs)
              </label>
              <select
                id="merge-source"
                value={sourceVersionId}
                onChange={(e) => setSourceVersionId(e.target.value)}
                disabled={loadingVersions}
                className={`${inputClass} mt-1`}
                aria-label="Select source version"
              >
                <option value="">
                  {loadingVersions ? 'Loading…' : 'Select version to merge from'}
                </option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {sourceVersionId && (
                <button
                  type="button"
                  onClick={fetchPreview}
                  disabled={loadingPreview || !state}
                  className="mt-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {loadingPreview ? 'Loading preview…' : 'Preview merge'}
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 shrink-0">
                Merging from: <strong className="text-slate-800 dark:text-slate-200">{sourceVersionName}</strong>
              </p>
              {loadingPreview && (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading merge preview…
                </div>
              )}
              {error && (
                <div
                  className="mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
                  role="alert"
                >
                  {error}
                </div>
              )}
              {preview && !loadingPreview && (
                <div className="flex flex-col min-h-0 flex-1">
                  {hasConflicts ? (
                    <div className="flex-1 min-h-0 overflow-auto space-y-3 mb-4">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Conflicts — choose “Use mine”, “Use theirs”, or “Edit manually” for each:
                      </p>
                      {preview.conflicts.map((conflict) => (
                        <div
                          key={conflict.path}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50 space-y-2"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            {(conflict.class_name || conflict.path) && (
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {conflict.class_name}
                                {conflict.property_name ? `.${conflict.property_name}` : ''}
                                {conflict.field && conflict.field !== conflict.class_name
                                  ? ` — ${conflict.field}`
                                  : ''}
                              </span>
                            )}
                            {conflict.description && (
                              <span className="text-slate-600 dark:text-slate-400">{conflict.description}</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">Mine: </span>
                              <span className="text-slate-800 dark:text-slate-200 break-all">
                                {formatConflictValue(conflict.local_value)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">Theirs: </span>
                              <span className="text-slate-800 dark:text-slate-200 break-all">
                                {formatConflictValue(conflict.remote_value)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <button
                              type="button"
                              onClick={() => setResolution(conflict.path, { use: 'ours' })}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium ${
                                resolutions[conflict.path]?.use === 'ours'
                                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                              }`}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Use mine
                            </button>
                            <button
                              type="button"
                              onClick={() => setResolution(conflict.path, { use: 'theirs' })}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium ${
                                resolutions[conflict.path]?.use === 'theirs'
                                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                              }`}
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              Use theirs
                            </button>
                            <button
                              type="button"
                              onClick={() => startCustomEdit(conflict)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium ${
                                resolutions[conflict.path]?.use === 'custom'
                                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                              }`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit manually
                            </button>
                          </div>
                          {customEditPath === conflict.path && (
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-600">
                              <label
                                htmlFor={`custom-value-${conflict.path}`}
                                className="text-xs text-slate-500 dark:text-slate-400"
                              >
                                Custom value
                              </label>
                              <textarea
                                id={`custom-value-${conflict.path}`}
                                value={customEditValue}
                                onChange={(e) => setCustomEditValue(e.target.value)}
                                rows={3}
                                className={`${inputClass} mt-1 font-mono text-xs`}
                                placeholder="Enter value or JSON"
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => commitCustomValue(conflict.path)}
                                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                                >
                                  Apply custom value
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomEditPath(null);
                                    setCustomEditValue('');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      No conflicts. You can apply the merge directly.
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-600 shrink-0">
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      type="button"
                      onClick={handleApply}
                      disabled={applying || (hasConflicts && !allResolved)}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {applying ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Applying…
                        </>
                      ) : (
                        'Apply merge'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {effectiveSourceId && !preview && !loadingPreview && !error && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Select a source version above.</p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
