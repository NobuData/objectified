'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  GitMerge,
  Loader2,
  Check,
  ArrowRight,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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

const diffPanelClass =
  'rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 p-2 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words max-h-44 min-h-[4rem] overflow-y-auto';

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
  onMergeProgressChange?: (inProgress: boolean) => void;
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

/** Last path segment, used to group conflicts for bulk actions (e.g. all `description` fields). */
function conflictFieldKey(c: MergeConflict): string {
  const path = c.path || c.field || '';
  const parts = path.split('.').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : path || 'unknown';
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
  onMergeProgressChange,
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
  const [mergedPreviewOpen, setMergedPreviewOpen] = useState(false);

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
        setMergedPreviewOpen(false);
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

  const buildConflictResolutions = useCallback((): ConflictResolutionChoice[] => {
    if (!preview?.conflicts) return [];
    return preview.conflicts.map((c) => {
      const r = resolutions[c.path];
      if (r?.use === 'ours') return { path: c.path, use: 'ours' as const };
      if (r?.use === 'theirs') return { path: c.path, use: 'theirs' as const };
      if (r?.use === 'custom' && r.custom_value !== undefined)
        return { path: c.path, use: 'custom' as const, custom_value: r.custom_value };
      return { path: c.path, use: 'ours' as const };
    });
  }, [preview?.conflicts, resolutions]);

  const handleApply = useCallback(async () => {
    if (!preview || !effectiveSourceId) return;
    setApplying(true);
    onMergeProgressChange?.(true);
    setError(null);
    try {
      const conflict_resolutions = buildConflictResolutions();
      const ours_state =
        isDirty && state
          ? {
              classes: stateToCommitPayload(state).classes,
              canvas_metadata: state.canvas_metadata ?? null,
            }
          : undefined;
      const resolveBody = {
        source_version_id: effectiveSourceId,
        strategy: 'override' as const,
        conflict_resolutions,
        ours_state: ours_state ?? undefined,
      };
      const needsConflictPass = (preview.conflicts?.length ?? 0) > 0;
      if (needsConflictPass) {
        await mergeResolve(versionId, { ...resolveBody, apply: false }, options);
      }
      await mergeResolve(versionId, { ...resolveBody, apply: true }, options);
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
      onMergeProgressChange?.(false);
      setApplying(false);
    }
  }, [
    preview,
    effectiveSourceId,
    buildConflictResolutions,
    isDirty,
    state,
    versionId,
    options,
    tenantId,
    projectId,
    studio,
    onMergeProgressChange,
    onApplied,
    handleOpenChange,
  ]);

  const sourceVersionName =
    versions.find((v) => v.id === effectiveSourceId)?.name ??
    (initialSourceVersionId ? 'Selected version' : '');

  const mergedClassCount = useMemo(() => {
    const cls = preview?.merged_state?.classes as unknown[] | undefined;
    return Array.isArray(cls) ? cls.length : 0;
  }, [preview?.merged_state]);

  const bulkFieldGroups = useMemo(() => {
    const m = new Map<string, MergeConflict[]>();
    for (const c of preview?.conflicts ?? []) {
      const k = conflictFieldKey(c);
      const arr = m.get(k) ?? [];
      arr.push(c);
      m.set(k, arr);
    }
    return [...m.entries()].filter(([, list]) => list.length >= 2);
  }, [preview?.conflicts]);

  const applyBulkResolution = useCallback(
    (fieldKey: string, use: 'ours' | 'theirs') => {
      const entry = bulkFieldGroups.find(([k]) => k === fieldKey);
      const conflicts = entry?.[1];
      if (!conflicts) return;
      setResolutions((prev) => {
        const next = { ...prev };
        for (const c of conflicts) {
          next[c.path] = { use };
        }
        return next;
      });
    },
    [bulkFieldGroups]
  );

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
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-5xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700 p-4"
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
            Preview shows the would-be merged state (dry-run). Resolve conflicts, validate, then apply. Push to
            other versions is safest after merge completes without remaining conflicts.
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
                  <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/30 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 mb-3 shrink-0">
                    <div className="font-medium text-indigo-900 dark:text-indigo-100">
                      Merge preview (dry-run)
                    </div>
                    <p className="text-xs mt-1">
                      <span className="font-mono">{mergedClassCount}</span> class(es) in merged result
                      {hasConflicts ? (
                        <>
                          {' '}
                          · <span className="font-mono">{preview.conflicts.length}</span> conflict(s) to resolve
                        </>
                      ) : (
                        <> · no blocking conflicts</>
                      )}
                    </p>
                    {hasConflicts && (
                      <ul className="mt-2 max-h-24 overflow-y-auto text-xs font-mono text-slate-600 dark:text-slate-400 space-y-0.5 border-t border-indigo-200/60 dark:border-indigo-800/60 pt-2">
                        {preview.conflicts.slice(0, 30).map((c) => (
                          <li key={c.path}>{c.path}</li>
                        ))}
                        {preview.conflicts.length > 30 && (
                          <li className="text-slate-500">
                            … {preview.conflicts.length - 30} more paths
                          </li>
                        )}
                      </ul>
                    )}
                    <div className="mt-2 border border-indigo-200/60 dark:border-indigo-800/60 rounded-md overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMergedPreviewOpen((o) => !o)}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-indigo-900 dark:text-indigo-100 bg-indigo-100/50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                      >
                        Merged state JSON
                        {mergedPreviewOpen ? (
                          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </button>
                      {mergedPreviewOpen && (
                        <pre className="max-h-40 overflow-y-auto p-2 text-[11px] leading-snug font-mono text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-900/60">
                          {JSON.stringify(preview.merged_state, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>

                  {hasConflicts ? (
                    <div className="flex-1 min-h-0 overflow-auto space-y-3 mb-4">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Conflicts — side-by-side diff; choose “Use mine”, “Use theirs”, or “Edit manually” for
                        each:
                      </p>
                      {bulkFieldGroups.length > 0 && (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/40 p-3 space-y-2">
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Bulk actions — same field name across multiple conflicts:
                          </p>
                          <div className="flex flex-col gap-2">
                            {bulkFieldGroups.map(([fieldKey, list]) => (
                              <div
                                key={fieldKey}
                                className="flex flex-wrap items-center gap-2 text-sm border-b border-slate-100 dark:border-slate-700/80 pb-2 last:border-0 last:pb-0"
                              >
                                <span className="text-slate-700 dark:text-slate-300">
                                  All <span className="font-mono">{list.length}</span> on &quot;
                                  <span className="font-mono">{fieldKey}</span>
                                  &quot;:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => applyBulkResolution(fieldKey, 'ours')}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                >
                                  <Check className="h-3 w-3" />
                                  Use mine
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyBulkResolution(fieldKey, 'theirs')}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                >
                                  <ArrowRight className="h-3 w-3" />
                                  Use theirs
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
                          <div className="flex flex-col sm:flex-row gap-2 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="text-slate-500 dark:text-slate-400 font-medium mb-1">Mine</div>
                              <div className={diffPanelClass}>{formatConflictValue(conflict.local_value)}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-slate-500 dark:text-slate-400 font-medium mb-1">Theirs</div>
                              <div className={diffPanelClass}>{formatConflictValue(conflict.remote_value)}</div>
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
                      ) : hasConflicts ? (
                        'Validate & apply merge'
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
