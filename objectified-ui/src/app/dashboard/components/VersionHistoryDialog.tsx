'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  History,
  Loader2,
  Pencil,
  Eye,
  RotateCcw,
  GitBranch,
  Trash2,
  ChevronDown,
  ChevronRight,
  GitCompare,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import {
  listVersionSnapshotsMetadata,
  listVersionSnapshotsSchemaChanges,
  pullVersion,
  rollbackVersion,
  createVersionFromRevision,
  deleteVersion,
  getTenantQuotaStatus,
  type VersionSnapshotMetadataSchema,
  type VersionSnapshotSchemaChangesAuditSchema,
  type VersionPullDiff,
  type VersionSchema,
  type RestClientOptions,
} from '@lib/api/rest-client';
import { atQuotaLimit } from '@lib/quotaDisplay';
import { useDialog } from '@/app/components/providers/DialogProvider';

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

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
  /** Called after successful rollback so parent can reload version state. If provided, Rollback may be shown when allowed. */
  onRollbackSuccess?: () => void;
  /**
   * When false, rollback actions are hidden (e.g. missing schema edit permission or published version).
   * @default true
   */
  canRollback?: boolean;
  /** Explains why rollback is unavailable when {@link onRollbackSuccess} is set but {@link canRollback} is false. */
  rollbackDisabledReason?: string;
  /** Called after successfully creating a version from a revision (branch). If provided, Branch button is shown. */
  onBranchSuccess?: (newVersion: VersionSchema) => void;
  /** Called after successfully deleting the version. If provided, Delete version button is shown. Caller should redirect to versions list or refresh list. */
  onDeleteSuccess?: () => void | Promise<void>;
  /** Revision currently loaded in Studio (toolbar); used to label rows and show mismatch vs server head. */
  studioLoadedRevision?: number | null;
  /** Open diff of server head vs this revision (since_revision on pull). */
  onCompareWithCurrent?: (revision: number) => void;
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

function fullMessageLines(snap: VersionSnapshotMetadataSchema): string {
  const parts: string[] = [];
  if (snap.label?.trim()) parts.push(`Label: ${snap.label.trim()}`);
  if (snap.description?.trim()) parts.push(`Description: ${snap.description.trim()}`);
  return parts.length > 0 ? parts.join('\n') : '—';
}

/** Distinct classes touched by a pull diff (add / remove / property changes). */
function countSchemaClassesAffected(diff: VersionPullDiff | null): number {
  if (!diff) return 0;
  const names = new Set<string>();
  for (const n of diff.added_class_names ?? []) {
    if (n) names.add(n);
  }
  for (const n of diff.removed_class_names ?? []) {
    if (n) names.add(n);
  }
  for (const mc of diff.modified_classes ?? []) {
    if (mc.class_name) names.add(mc.class_name);
  }
  return names.size;
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
  canRollback = true,
  rollbackDisabledReason,
  onBranchSuccess,
  onDeleteSuccess,
  studioLoadedRevision,
  onCompareWithCurrent,
}: VersionHistoryDialogProps) {
  const { confirm, alert: alertDialog } = useDialog();
  const [snapshots, setSnapshots] = useState<VersionSnapshotMetadataSchema[]>([]);
  const [total, setTotal] = useState(0);
  const [latestRevision, setLatestRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [rollbackRevision, setRollbackRevision] = useState<number | null>(null);
  const [rollbackNote, setRollbackNote] = useState('');
  const [rollbackPreviewLoading, setRollbackPreviewLoading] = useState(false);
  const [rollbackPreviewError, setRollbackPreviewError] = useState<string | null>(null);
  const [rollbackPreviewDiff, setRollbackPreviewDiff] = useState<VersionPullDiff | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterMessage, setFilterMessage] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [filterCreatedAfter, setFilterCreatedAfter] = useState('');
  const [filterCreatedBefore, setFilterCreatedBefore] = useState('');
  const [appliedMessage, setAppliedMessage] = useState('');
  const [appliedAuthor, setAppliedAuthor] = useState('');
  const [appliedCreatedAfter, setAppliedCreatedAfter] = useState('');
  const [appliedCreatedBefore, setAppliedCreatedBefore] = useState('');

  const [pageSize, setPageSize] = useState<number>(25);
  const [pageOffset, setPageOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
  const [versionQuotaBlocked, setVersionQuotaBlocked] = useState(false);

  const fetchSnapshots = useCallback(async () => {
    if (!versionId || !open) return;
    setLoading(true);
    setError(null);
    try {
      const page = await listVersionSnapshotsMetadata(versionId, options, {
        limit: pageSize,
        offset: pageOffset,
        message_contains: appliedMessage.trim() || undefined,
        committed_by: appliedAuthor.trim() || undefined,
        created_after: appliedCreatedAfter.trim() || undefined,
        created_before: appliedCreatedBefore.trim() || undefined,
      });
      setSnapshots(Array.isArray(page?.items) ? page.items : []);
      setTotal(typeof page?.total === 'number' ? page.total : 0);
      setLatestRevision(
        page.latest_revision === undefined || page.latest_revision === null
          ? null
          : page.latest_revision
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load version history');
      setSnapshots([]);
      setTotal(0);
      setLatestRevision(null);
    } finally {
      setLoading(false);
    }
  }, [
    versionId,
    open,
    options,
    pageSize,
    pageOffset,
    appliedMessage,
    appliedAuthor,
    appliedCreatedAfter,
    appliedCreatedBefore,
  ]);

  useLayoutEffect(() => {
    if (!open) return;
    setSnapshots([]);
    setTotal(0);
    setLatestRevision(null);
    setError(null);
    setExpandedId(null);
    setPageOffset(0);
    setFilterMessage('');
    setFilterAuthor('');
    setFilterCreatedAfter('');
    setFilterCreatedBefore('');
    setAppliedMessage('');
    setAppliedAuthor('');
    setAppliedCreatedAfter('');
    setAppliedCreatedBefore('');
    setAuditEnabled(false);
    setAuditEntries([]);
    setAuditError(null);
    setAuditLoading(false);
  }, [open, versionId]);

  useEffect(() => {
    if (!open) return;
    void fetchSnapshots();
  }, [open, fetchSnapshots]);

  useEffect(() => {
    if (!open || !tenantId || !projectId) {
      setVersionQuotaBlocked(false);
      return;
    }
    let cancelled = false;
    void getTenantQuotaStatus(tenantId, options, projectId)
      .then((q) => {
        if (cancelled) return;
        setVersionQuotaBlocked(
          atQuotaLimit(
            q.max_versions_per_project,
            q.active_version_count_for_project ?? 0
          )
        );
      })
      .catch(() => {
        if (!cancelled) setVersionQuotaBlocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, projectId, options]);

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

  useEffect(() => {
    if (!rollbackDialogOpen || rollbackRevision == null || !versionId) return;
    let cancelled = false;
    setRollbackPreviewLoading(true);
    setRollbackPreviewError(null);
    void pullVersion(versionId, options, null, rollbackRevision)
      .then((res) => {
        if (cancelled) return;
        setRollbackPreviewDiff(res.diff ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setRollbackPreviewDiff(null);
        setRollbackPreviewError(
          e instanceof Error ? e.message : 'Failed to load change summary'
        );
      })
      .finally(() => {
        if (!cancelled) setRollbackPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rollbackDialogOpen, rollbackRevision, versionId, options]);

  const showRollbackActions = Boolean(onRollbackSuccess && canRollback);

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

  const openRollbackDialog = useCallback(
    (revision: number) => {
      if (!showRollbackActions) return;
      setRollbackRevision(revision);
      setRollbackNote('');
      setRollbackPreviewDiff(null);
      setRollbackPreviewError(null);
      setRollbackPreviewLoading(true);
      setRollbackDialogOpen(true);
    },
    [showRollbackActions]
  );

  const submitRollback = useCallback(async () => {
    if (!versionId || rollbackRevision == null || !onRollbackSuccess || !canRollback) return;
    const completedRevision = rollbackRevision;
    setRollbackSubmitting(true);
    setError(null);
    try {
      const note = rollbackNote.trim();
      await rollbackVersion(
        versionId,
        {
          revision: completedRevision,
          ...(note ? { message: note } : {}),
        },
        options
      );
      await fetchSnapshots();
      onRollbackSuccess();
      setRollbackDialogOpen(false);
      onOpenChange(false);
      await alertDialog({
        title: 'Rollback complete',
        message: `Restored to revision ${completedRevision}. History has been updated.`,
        variant: 'success',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rollback failed');
    } finally {
      setRollbackSubmitting(false);
    }
  }, [
    versionId,
    rollbackRevision,
    rollbackNote,
    options,
    onRollbackSuccess,
    onOpenChange,
    fetchSnapshots,
    alertDialog,
    canRollback,
  ]);

  const showBranch = Boolean(tenantId && projectId && onBranchSuccess);
  const showActions = Boolean(
    onLoadRevision || onRollbackSuccess || showBranch || onCompareWithCurrent
  );

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
    if (versionQuotaBlocked) {
      setBranchError(
        'This project has reached the maximum number of versions allowed for the tenant.'
      );
      return;
    }
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
    versionQuotaBlocked,
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

  const localDateTimeToIso = (local: string): string => {
    if (!local.trim()) return '';
    const d = new Date(local);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString();
  };

  const applyFilters = useCallback(() => {
    setAppliedMessage(filterMessage);
    setAppliedAuthor(filterAuthor);
    setAppliedCreatedAfter(localDateTimeToIso(filterCreatedAfter));
    setAppliedCreatedBefore(localDateTimeToIso(filterCreatedBefore));
    setPageOffset(0);
  }, [filterMessage, filterAuthor, filterCreatedAfter, filterCreatedBefore]);

  const clearFilters = useCallback(() => {
    setFilterMessage('');
    setFilterAuthor('');
    setFilterCreatedAfter('');
    setFilterCreatedBefore('');
    setAppliedMessage('');
    setAppliedAuthor('');
    setAppliedCreatedAfter('');
    setAppliedCreatedBefore('');
    setPageOffset(0);
  }, []);

  const rangeLabel = useMemo(() => {
    if (total === 0) return '0 results';
    const start = pageOffset + 1;
    const end = Math.min(pageOffset + snapshots.length, total);
    return `${start}–${end} of ${total}`;
  }, [total, pageOffset, snapshots.length]);

  const colCount =
    7 + (showActions ? 1 : 0);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-5xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700"
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            if (branchDialogOpen || rollbackDialogOpen) {
              e.preventDefault();
              return;
            }
            onOpenChange(false);
          }}
          onPointerDownOutside={(e) => {
            if (branchDialogOpen || rollbackDialogOpen) {
              e.preventDefault();
              return;
            }
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
                Search, filter, and paginate revisions; compare with current, load, rollback, or branch.
              </Dialog.Description>
              {versionName && (
                <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                  {versionName}
                </p>
              )}
            </div>
          </div>

          <div className="p-4 flex-1 overflow-auto min-h-0">
            {studioLoadedRevision != null &&
              latestRevision != null &&
              studioLoadedRevision !== latestRevision && (
                <div
                  className="mb-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 text-sm"
                  role="status"
                >
                  You are viewing a past revision: Studio is at{' '}
                  <span className="font-mono font-medium">{studioLoadedRevision}</span>; server head is{' '}
                  <span className="font-mono font-medium">{latestRevision}</span>.
                </div>
              )}

            {onRollbackSuccess && !canRollback && (
              <div
                className="mb-3 p-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 text-sm"
                role="status"
              >
                {rollbackDisabledReason?.trim() ||
                  'Rollback is not available for this version.'}
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

            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label.Root htmlFor="vh-msg" className={labelClass}>
                  Message contains
                </Label.Root>
                <input
                  id="vh-msg"
                  type="search"
                  value={filterMessage}
                  onChange={(e) => setFilterMessage(e.target.value)}
                  placeholder="Label or description"
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div>
                <Label.Root htmlFor="vh-author" className={labelClass}>
                  Author (account id)
                </Label.Root>
                <input
                  id="vh-author"
                  type="text"
                  value={filterAuthor}
                  onChange={(e) => setFilterAuthor(e.target.value)}
                  placeholder="UUID"
                  className={`${inputClass} mt-1 font-mono text-xs`}
                />
              </div>
              <div>
                <Label.Root htmlFor="vh-after" className={labelClass}>
                  Created after (local)
                </Label.Root>
                <input
                  id="vh-after"
                  type="datetime-local"
                  value={filterCreatedAfter}
                  onChange={(e) => setFilterCreatedAfter(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div>
                <Label.Root htmlFor="vh-before" className={labelClass}>
                  Created before (local)
                </Label.Root>
                <input
                  id="vh-before"
                  type="datetime-local"
                  value={filterCreatedBefore}
                  onChange={(e) => setFilterCreatedBefore(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </div>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applyFilters()}
                className="px-3 py-2 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600"
              >
                Apply filters
              </button>
              <button
                type="button"
                onClick={() => clearFilters()}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Clear
              </button>
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span>Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPageOffset(0);
                  }}
                  className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-2 py-1.5"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
              </div>
            ) : snapshots.length === 0 && !error ? (
              <p className="py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                {appliedMessage.trim() ||
                appliedAuthor.trim() ||
                appliedCreatedAfter.trim() ||
                appliedCreatedBefore.trim()
                  ? 'No revisions match your filters. Adjust search or clear filters.'
                  : 'No revisions yet. Commit to create version history.'}
              </p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto max-h-[min(50vh,28rem)] overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-[1]">
                      <tr>
                        <th className="w-8 px-2 py-2.5" aria-label="Expand" />
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Revision
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Author
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Message
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Snapshot id
                        </th>
                        {showActions && (
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {snapshots.map((snap) => {
                        const isHead =
                          latestRevision != null && snap.revision === latestRevision;
                        const isLoaded =
                          studioLoadedRevision != null &&
                          snap.revision === studioLoadedRevision;
                        const expanded = expandedId === snap.id;
                        return (
                          <Fragment key={snap.id}>
                            <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 align-top">
                              <td className="px-2 py-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedId((id) => (id === snap.id ? null : snap.id))
                                  }
                                  className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  aria-expanded={expanded}
                                  aria-label={expanded ? 'Collapse revision details' : 'Expand revision details'}
                                >
                                  {expanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                                {snap.revision}
                              </td>
                              <td className="px-4 py-2.5 text-xs">
                                <div className="flex flex-col gap-1">
                                  {isHead && (
                                    <span className="inline-flex w-fit rounded px-1.5 py-0.5 font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200">
                                      Head
                                    </span>
                                  )}
                                  {isLoaded && (
                                    <span className="inline-flex w-fit rounded px-1.5 py-0.5 font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200">
                                      In Studio
                                    </span>
                                  )}
                                  {!isHead && !isLoaded && (
                                    <span className="text-slate-400 dark:text-slate-600">—</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                <span title={snap.created_at}>{formatDateTime(snap.created_at)}</span>
                              </td>
                              <td className="px-4 py-2.5 text-xs font-mono text-slate-600 dark:text-slate-400 max-w-[8rem] truncate">
                                {snap.committed_by ?? '—'}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate">
                                <span title={fullMessageLines(snap)}>{formatMessage(snap)}</span>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-500 max-w-[6rem] truncate">
                                <span title={snap.id}>{snap.id}</span>
                              </td>
                              {showActions && (
                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1 flex-wrap">
                                    {onCompareWithCurrent && (
                                      <button
                                        type="button"
                                        onClick={() => onCompareWithCurrent(snap.revision)}
                                        disabled={rollbackSubmitting}
                                        className="p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50"
                                        title="Compare this revision with current server head"
                                        aria-label={`Compare revision ${snap.revision} with current`}
                                      >
                                        <GitCompare className="h-4 w-4" />
                                      </button>
                                    )}
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
                                    {showRollbackActions && (
                                      <button
                                        type="button"
                                        onClick={() => openRollbackDialog(snap.revision)}
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
                                        disabled={
                                          rollbackSubmitting || branchSubmitting || versionQuotaBlocked
                                        }
                                        className="p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50"
                                        title={
                                          versionQuotaBlocked
                                            ? 'Version quota reached for this project'
                                            : 'Branch from this revision (new version)'
                                        }
                                        aria-label={`Branch from revision ${snap.revision}`}
                                      >
                                        <GitBranch className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                            {expanded && (
                              <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                                <td colSpan={colCount} className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                                  <div className="space-y-2">
                                    <p className="font-medium text-slate-900 dark:text-slate-100">
                                      Revision {snap.revision} — full message
                                    </p>
                                    <pre className="whitespace-pre-wrap font-sans text-sm border border-slate-200 dark:border-slate-600 rounded-lg p-3 bg-white dark:bg-slate-900">
                                      {fullMessageLines(snap)}
                                    </pre>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      <span className="font-medium text-slate-600 dark:text-slate-300">
                                        Timestamp (ISO):
                                      </span>{' '}
                                      {snap.created_at}
                                    </p>
                                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400 break-all">
                                      <span className="font-sans font-medium text-slate-600 dark:text-slate-300">
                                        External snapshot id:
                                      </span>{' '}
                                      {snap.id}
                                    </p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      {onLoadRevision && (
                                        <>
                                          <button
                                            type="button"
                                            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                                            onClick={() => {
                                              onLoadRevision(snap.revision, true);
                                              onOpenChange(false);
                                            }}
                                          >
                                            View read-only
                                          </button>
                                          <span className="text-slate-300 dark:text-slate-600">|</span>
                                          <button
                                            type="button"
                                            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                                            onClick={() => {
                                              onLoadRevision(snap.revision, false);
                                              onOpenChange(false);
                                            }}
                                          >
                                            Load to edit
                                          </button>
                                        </>
                                      )}
                                      {showRollbackActions && (
                                        <>
                                          <span className="text-slate-300 dark:text-slate-600">|</span>
                                          <button
                                            type="button"
                                            className="text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
                                            onClick={() => openRollbackDialog(snap.revision)}
                                          >
                                            Rollback here
                                          </button>
                                        </>
                                      )}
                                      {showBranch && (
                                        <>
                                          <span className="text-slate-300 dark:text-slate-600">|</span>
                                          <button
                                            type="button"
                                            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                                            onClick={() => handleBranchClick(snap.revision)}
                                          >
                                            Branch from here
                                          </button>
                                        </>
                                      )}
                                      {onCompareWithCurrent && (
                                        <>
                                          <span className="text-slate-300 dark:text-slate-600">|</span>
                                          <button
                                            type="button"
                                            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                                            onClick={() => onCompareWithCurrent(snap.revision)}
                                          >
                                            Compare with current
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 text-sm text-slate-600 dark:text-slate-400">
                  <span>{rangeLabel}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pageOffset === 0 || loading}
                      onClick={() => setPageOffset((o) => Math.max(0, o - pageSize))}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={pageOffset + snapshots.length >= total || loading}
                      onClick={() => setPageOffset((o) => o + pageSize)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {total > 0 && (
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
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
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
                  </div>
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
        onOpenChange={(o) => {
          if (!o) setBranchDialogOpen(false);
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
            {versionQuotaBlocked && (
              <div
                className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-sm"
                role="alert"
              >
                Version quota reached for this project. Delete a version or ask an administrator to
                raise the limit before branching.
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
                disabled={branchSubmitting || !branchName.trim() || versionQuotaBlocked}
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

      <Dialog.Root
        open={rollbackDialogOpen}
        onOpenChange={(o) => {
          if (rollbackSubmitting) return;
          setRollbackDialogOpen(o);
          if (!o) {
            setRollbackPreviewDiff(null);
            setRollbackPreviewError(null);
            setRollbackPreviewLoading(false);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10005]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10006] w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700 p-4"
            aria-describedby={undefined}
            onEscapeKeyDown={() => {
              if (!rollbackSubmitting) setRollbackDialogOpen(false);
            }}
            onPointerDownOutside={() => {
              if (!rollbackSubmitting) setRollbackDialogOpen(false);
            }}
          >
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Restore to this revision?
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Confirm restoring the version to a past revision. Review class-level impact, add an
              optional audit message, then confirm or cancel.
            </Dialog.Description>
            <div
              className="mt-2 text-sm text-slate-600 dark:text-slate-400 space-y-3"
              aria-live="polite"
            >
                <p>
                  Revert to revision{' '}
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    {rollbackRevision ?? '—'}
                  </span>
                  . The current schema head will be replaced and a new snapshot will be appended for
                  all users.
                </p>
                {rollbackPreviewLoading && (
                  <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                    Calculating impact on classes…
                  </p>
                )}
                {!rollbackPreviewLoading && rollbackPreviewError && (
                  <p className="text-amber-800 dark:text-amber-200 text-sm" role="alert">
                    Could not load change summary ({rollbackPreviewError}). You can still confirm
                    rollback if you intend to proceed.
                  </p>
                )}
                {!rollbackPreviewLoading && !rollbackPreviewError && rollbackPreviewDiff != null && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-2">
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {(() => {
                        const n = countSchemaClassesAffected(rollbackPreviewDiff);
                        if (n === 0) {
                          return 'No class changes vs current head; a new history entry will still be created.';
                        }
                        return `${n} ${n === 1 ? 'class' : 'classes'} will change (additions, removals, or property updates).`;
                      })()}
                    </p>
                    {renderDiffSummary(rollbackPreviewDiff)}
                  </div>
                )}
            </div>
            <div className="mt-4 space-y-2">
              <Label.Root htmlFor="rollback-note" className={labelClass}>
                Rollback message (optional)
              </Label.Root>
              <textarea
                id="rollback-note"
                value={rollbackNote}
                onChange={(e) => setRollbackNote(e.target.value)}
                placeholder="Reason for audit trail (appended to the new snapshot description)"
                rows={3}
                disabled={rollbackSubmitting}
                className={`${inputClass} min-h-[5rem] resize-y`}
              />
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRollbackDialogOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                disabled={rollbackSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRollback()}
                disabled={rollbackSubmitting || rollbackRevision == null}
                className="px-4 py-2 rounded-lg border border-amber-600 dark:border-amber-500 bg-amber-600 dark:bg-amber-600 text-white hover:bg-amber-700 dark:hover:bg-amber-700 disabled:opacity-50"
              >
                {rollbackSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                ) : (
                  'Restore to this revision'
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Dialog.Root>
  );
}
