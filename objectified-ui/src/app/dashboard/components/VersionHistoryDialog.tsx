'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Pencil, Eye, RotateCcw, GitBranch, Trash2 } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import {
  listVersionSnapshotsMetadata,
  listVersionSnapshotsSchemaChanges,
  rollbackVersion,
  createVersionFromRevision,
  deleteVersion,
  type VersionSnapshotMetadataSchema,
  type VersionSnapshotSchemaChangesAuditSchema,
  type VersionPullDiff,
  type VersionSchema,
  type RestClientOptions,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';

export interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionId: string;
  versionName?: string;
  options: RestClientOptions;
  /** Required for Branch: tenant and project for creating the new version. */
  tenantId?: string;
  projectId?: string;
  /** Called when user chooses to load a revision. If not provided, Load/View actions are hidden. */
  onLoadRevision?: (revision: number, readOnly: boolean) => void;
  /** Called after successful rollback so parent can reload version state. If provided, Rollback button is shown. */
  onRollbackSuccess?: () => void;
  /** Called after successfully creating a version from a revision (branch). If provided, Branch button is shown. */
  onBranchSuccess?: (newVersion: VersionSchema) => void;
  /** Called after successfully deleting the version. If provided, Delete version button is shown. Caller should redirect to versions list or refresh list. */
  onDeleteSuccess?: () => void | Promise<void>;
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
  tenantId,
  projectId,
  onLoadRevision,
  onRollbackSuccess,
  onBranchSuccess,
  onDeleteSuccess,
}: VersionHistoryDialogProps) {
  const { confirm } = useDialog();
  const [snapshots, setSnapshots] = useState<VersionSnapshotMetadataSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [auditEnabled, setAuditEnabled] = useState(false);
  const [auditEntries, setAuditEntries] = useState<VersionSnapshotSchemaChangesAuditSchema[]>(
    []
  );
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [branchRevision, setBranchRevision] = useState<number | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchDescription, setBranchDescription] = useState('');
  const [branchSubmitting, setBranchSubmitting] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

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
      setAuditEnabled(false);
      setAuditEntries([]);
      setAuditError(null);
      setAuditLoading(false);
      fetchSnapshots();
    }
  }, [open, versionId, fetchSnapshots]);

  const fetchAuditEntries = useCallback(async () => {
    if (!versionId || !open) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const entries = await listVersionSnapshotsSchemaChanges(versionId, options);
      setAuditEntries(entries);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : 'Failed to load schema audit');
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  }, [versionId, open, options]);

  useEffect(() => {
    if (!open || !auditEnabled) return;
    void fetchAuditEntries();
  }, [open, auditEnabled, fetchAuditEntries]);

  const truncateList = (items: string[], maxItems = 3): string => {
    if (items.length <= maxItems) return items.join(', ');
    return `${items.slice(0, maxItems).join(', ')}, ...`;
  };

  const renderDiffSummary = (diff: VersionPullDiff) => {
    const added = diff.added_class_names ?? [];
    const removed = diff.removed_class_names ?? [];
    const modified = diff.modified_classes ?? [];

    if (added.length === 0 && removed.length === 0 && modified.length === 0) {
      return <span className="text-slate-500">No schema changes</span>;
    }

    const modifiedLines = modified
      .slice(0, 3)
      .map((mc) => {
        const addedProps =
          mc.added_property_names && mc.added_property_names.length > 0
            ? `+${mc.added_property_names.join(', ')}`
            : '';
        const removedProps =
          mc.removed_property_names && mc.removed_property_names.length > 0
            ? `-${mc.removed_property_names.join(', ')}`
            : '';
        const modifiedProps =
          mc.modified_property_names && mc.modified_property_names.length > 0
            ? `~${mc.modified_property_names.join(', ')}`
            : '';

        const propParts = [addedProps, removedProps, modifiedProps].filter(Boolean);
        return `${mc.class_name}: ${propParts.join(' ') || 'changed'}`;
      });

    return (
      <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
        {added.length > 0 && (
          <div>
            <span className="font-medium text-emerald-700 dark:text-emerald-300">
              Added:
            </span>{' '}
            {truncateList(added)}
          </div>
        )}
        {removed.length > 0 && (
          <div>
            <span className="font-medium text-red-700 dark:text-red-300">
              Removed:
            </span>{' '}
            {truncateList(removed)}
          </div>
        )}
        {modified.length > 0 && (
          <div>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Modified:
            </span>{' '}
            {modifiedLines.join(' | ')}
          </div>
        )}
      </div>
    );
  };

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

  const showBranch = Boolean(
    tenantId && projectId && onBranchSuccess
  );
  const showActions = Boolean(onLoadRevision || onRollbackSuccess || showBranch);

  const handleBranchClick = useCallback((revision: number) => {
    setBranchRevision(revision);
    setBranchName('');
    setBranchDescription('');
    setBranchError(null);
    setBranchDialogOpen(true);
  }, []);

  const handleBranchSubmit = useCallback(async () => {
    if (
      !tenantId ||
      !projectId ||
      branchRevision == null ||
      !onBranchSuccess
    )
      return;
    const name = branchName.trim();
    if (!name) {
      setBranchError('Version name is required.');
      return;
    }
    setBranchSubmitting(true);
    setBranchError(null);
    try {
      const newVersion = await createVersionFromRevision(
        tenantId,
        projectId,
        {
          source_version_id: versionId,
          source_revision: branchRevision,
          name,
          description: branchDescription.trim() || undefined,
        },
        options
      );
      onBranchSuccess(newVersion);
      setBranchDialogOpen(false);
      onOpenChange(false);
    } catch (e) {
      setBranchError(
        e instanceof Error ? e.message : 'Failed to create branch version.'
      );
    } finally {
      setBranchSubmitting(false);
    }
  }, [
    tenantId,
    projectId,
    versionId,
    branchRevision,
    branchName,
    branchDescription,
    onBranchSuccess,
    options,
    onOpenChange,
  ]);

  const handleDeleteVersion = useCallback(async () => {
    if (!versionId || !onDeleteSuccess) return;
    const displayName = versionName?.trim() || 'this version';
    const ok = await confirm({
      title: 'Delete Version',
      message: `Delete version "${displayName}"? This action cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setDeleteSubmitting(true);
    setError(null);
    try {
      await deleteVersion(versionId, options);
      onOpenChange(false);
      await onDeleteSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete version.');
    } finally {
      setDeleteSubmitting(false);
    }
  }, [versionId, versionName, options, onDeleteSuccess, onOpenChange, confirm]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700"
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            if (branchDialogOpen) { e.preventDefault(); return; }
            onOpenChange(false);
          }}
          onPointerDownOutside={(e) => {
            if (branchDialogOpen) { e.preventDefault(); return; }
            onOpenChange(false);
          }}
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
                              {showBranch && (
                                <button
                                  type="button"
                                  onClick={() => handleBranchClick(snap.revision)}
                                  disabled={rollbackSubmitting || branchSubmitting}
                                  className="p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50"
                                  title="Branch from this revision (new version)"
                                  aria-label={`Branch from revision ${snap.revision}`}
                                >
                                  <GitBranch className="h-4 w-4" />
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

            {snapshots.length > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Optional audit trail of schema diffs by revision.
                </p>
                <button
                  type="button"
                  onClick={() => setAuditEnabled((v) => !v)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
                >
                  {auditEnabled ? 'Hide schema audit' : 'Show schema audit'}
                </button>
              </div>
            )}

            {auditEnabled && (
              <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                {auditLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400 dark:text-slate-500" />
                  </div>
                ) : auditError ? (
                  <div
                    className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
                    role="alert"
                  >
                    {auditError}
                  </div>
                ) : auditEntries.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                    No schema audit entries.
                  </p>
                ) : (
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Revision
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Changed by
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          What changed
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {auditEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-2.5 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                            {entry.revision}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 max-w-xs truncate">
                            {entry.committed_by ?? '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            {renderDiffSummary(entry.diff)}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                            {formatDateTime(entry.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
            <div>
              {onDeleteSuccess && (
                <button
                  type="button"
                  onClick={() => void handleDeleteVersion()}
                  disabled={deleteSubmitting || rollbackSubmitting || branchSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                  aria-label="Delete this version"
                >
                  {deleteSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete version
                </button>
              )}
            </div>
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

      <Dialog.Root
        open={branchDialogOpen}
        onOpenChange={(open) => {
          if (!open) setBranchDialogOpen(false);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10003]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10004] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700 p-4"
            aria-describedby={undefined}
            onEscapeKeyDown={() => setBranchDialogOpen(false)}
            onPointerDownOutside={() => setBranchDialogOpen(false)}
          >
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Branch from revision {branchRevision ?? ''}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Enter a name and optional description for the new version.
            </Dialog.Description>
            {branchError && (
              <div
                className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
                role="alert"
              >
                {branchError}
              </div>
            )}
            <div className="mt-4 space-y-4">
              <div>
                <Label.Root htmlFor="branch-name" className={labelClass}>
                  Version name *
                </Label.Root>
                <input
                  id="branch-name"
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="e.g. 2.0.0"
                  className={inputClass}
                  disabled={branchSubmitting}
                />
              </div>
              <div>
                <Label.Root htmlFor="branch-description" className={labelClass}>
                  Description (optional)
                </Label.Root>
                <input
                  id="branch-description"
                  type="text"
                  value={branchDescription}
                  onChange={(e) => setBranchDescription(e.target.value)}
                  placeholder="Branch from revision"
                  className={inputClass}
                  disabled={branchSubmitting}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setBranchDialogOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                disabled={branchSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBranchSubmit()}
                disabled={branchSubmitting || !branchName.trim()}
                className="px-4 py-2 rounded-lg border border-indigo-600 dark:border-indigo-500 bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50"
              >
                {branchSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                ) : (
                  'Create version & open in Studio'
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Dialog.Root>
  );
}
