'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Loader2,
  Plus,
  GitBranch,
  Pencil,
  Trash2,
  MoreVertical,
  Lock,
  CheckCircle,
  GitCompare,
  Network,
  History,
  Tag,
  Upload,
  Search,
  GitMerge,
  ListTree,
  Check,
  Minus,
  ExternalLink,
} from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Checkbox from '@radix-ui/react-checkbox';
import {
  listProjects,
  listVersions,
  createVersion,
  updateVersion,
  deleteVersion,
  publishVersion,
  unpublishVersion,
  listVersionPublishHistory,
  getTenantQuotaStatus,
  VERSION_PUBLISH_TARGETS,
  getRestClientOptions,
  isForbiddenError,
  type ProjectSchema,
  type TenantQuotaStatusSchema,
  type VersionSchema,
  type VersionCreate,
  type VersionMetadataUpdate,
  type VersionPublishEventSchema,
} from '@lib/api/rest-client';
import { atQuotaLimit, formatUsageLine, quotaSeverity } from '@lib/quotaDisplay';
import { useDialog } from '@/app/components/providers/DialogProvider';
import VersionDiffDialog from '@/app/dashboard/components/VersionDiffDialog';
import VersionCompareDialog from '@/app/dashboard/components/VersionCompareDialog';
import VersionHistoryDialog from '@/app/dashboard/components/VersionHistoryDialog';
import RelationshipGraphDialog from '@/app/dashboard/components/RelationshipGraphDialog';
import SchemaImportDialog from '@/app/dashboard/components/SchemaImportDialog';
import { useTenantSelection } from '@/app/contexts/TenantSelectionContext';
import { dataDesignerDeepLink } from '@/lib/dashboard/deepLinks';
import { buildCsvContent, downloadCsvFile } from '@/app/components/dashboard/ListTableToolbar';

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';

function formatDateTime(dateString: string): string {
  const d = new Date(dateString);
  return d.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CODEGEN_TAG_PRESETS = ['staging', 'production', 'development'] as const;
/** @deprecated Use CODEGEN_TAG_PRESETS instead */
const VERSION_TAG_PRESETS = CODEGEN_TAG_PRESETS;

type VersionStatusFilter = 'all' | 'draft' | 'published' | 'disabled';
type PublishedTargetFilter = 'all' | (typeof VERSION_PUBLISH_TARGETS)[number];
type VersionSortKey =
  | 'updated_desc'
  | 'updated_asc'
  | 'created_desc'
  | 'created_asc'
  | 'name_asc'
  | 'published_desc';

function buildLineageChain(
  start: VersionSchema,
  byId: Map<string, VersionSchema>
): VersionSchema[] {
  const chain: VersionSchema[] = [];
  let cur: VersionSchema | undefined = start;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    const sid = cur.source_version_id;
    if (!sid) break;
    cur = byId.get(sid);
  }
  return chain;
}

export default function VersionsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { confirm, alert: alertDialog } = useDialog();
  const { tenants, tenantsLoading, selectedTenantId, setSelectedTenantId } = useTenantSelection();
  const [projects, setProjects] = useState<ProjectSchema[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editVersion, setEditVersion] = useState<VersionSchema | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [diffDialogVersion, setDiffDialogVersion] = useState<VersionSchema | null>(null);
  const [graphDialogVersion, setGraphDialogVersion] = useState<VersionSchema | null>(null);
  const [historyDialogVersion, setHistoryDialogVersion] = useState<VersionSchema | null>(null);
  const [importDialogVersion, setImportDialogVersion] = useState<VersionSchema | null>(null);
  const [tagDialogVersion, setTagDialogVersion] = useState<VersionSchema | null>(null);
  const [tagDialogValue, setTagDialogValue] = useState('');
  const [tagDialogSubmitting, setTagDialogSubmitting] = useState(false);
  const [tagDialogError, setTagDialogError] = useState<string | null>(null);

  const [versionSearch, setVersionSearch] = useState('');
  const [versionStatusFilter, setVersionStatusFilter] =
    useState<VersionStatusFilter>('all');
  const [versionSort, setVersionSort] = useState<VersionSortKey>('updated_desc');
  const [publishedTargetFilter, setPublishedTargetFilter] =
    useState<PublishedTargetFilter>('all');
  const [bulkPublishTarget, setBulkPublishTarget] =
    useState<(typeof VERSION_PUBLISH_TARGETS)[number]>('production');
  const [selectedVersionIds, setSelectedVersionIds] = useState<Set<string>>(
    () => new Set()
  );
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareDialogBaseId, setCompareDialogBaseId] = useState('');
  const [lineageDialogVersion, setLineageDialogVersion] =
    useState<VersionSchema | null>(null);
  const [bulkWorking, setBulkWorking] = useState(false);

  const [publishDialogVersion, setPublishDialogVersion] = useState<VersionSchema | null>(null);
  const [publishDialogVisibility, setPublishDialogVisibility] = useState<'private' | 'public'>(
    'private'
  );
  const [publishDialogTarget, setPublishDialogTarget] =
    useState<(typeof VERSION_PUBLISH_TARGETS)[number]>('production');
  const [publishDialogNote, setPublishDialogNote] = useState('');
  const [publishDialogSubmitting, setPublishDialogSubmitting] = useState(false);
  const [publishDialogError, setPublishDialogError] = useState<string | null>(null);

  const [publishHistoryVersion, setPublishHistoryVersion] = useState<VersionSchema | null>(null);
  const [publishHistoryRows, setPublishHistoryRows] = useState<VersionPublishEventSchema[]>([]);
  const [publishHistoryLoading, setPublishHistoryLoading] = useState(false);
  const [publishHistoryError, setPublishHistoryError] = useState<string | null>(null);

  // Create form
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createCodegenTag, setCreateCodegenTag] = useState('');
  const [createChangeLog, setCreateChangeLog] = useState('');
  const [createSourceVersionId, setCreateSourceVersionId] = useState<string>('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<TenantQuotaStatusSchema | null>(null);
  const quotaRequestIdRef = useRef(0);

  // Edit form
  const [editDescription, setEditDescription] = useState('');
  const [editChangeLog, setEditChangeLog] = useState('');
  const [editCodegenTag, setEditCodegenTag] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const opts = useMemo(
    () =>
      getRestClientOptions(
        (session as { accessToken?: string } | null) ?? null
      ),
    [(session as { accessToken?: string } | null)?.accessToken]
  );

  const fetchProjects = useCallback(async () => {
    if (status !== 'authenticated' || !selectedTenantId) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await listProjects(selectedTenantId, opts);
      setProjects(data);
      setSelectedProjectId((prev) => {
        if (prev) return prev;
        return data.length > 0 ? data[0].id : null;
      });
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view projects.'
          : e instanceof Error
            ? e.message
            : 'Failed to load projects'
      );
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [status, selectedTenantId, opts]);

  const fetchVersions = useCallback(async () => {
    if (status !== 'authenticated' || !selectedTenantId || !selectedProjectId) {
      setVersions([]);
      return;
    }
    setError(null);
    try {
      const data = await listVersions(selectedTenantId, selectedProjectId, opts);
      setVersions(data);
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view versions.'
          : e instanceof Error
            ? e.message
            : 'Failed to load versions'
      );
      setVersions([]);
    }
  }, [status, selectedTenantId, selectedProjectId, opts]);

  const fetchQuota = useCallback(async () => {
    if (status !== 'authenticated' || !selectedTenantId || !selectedProjectId) {
      setQuotaStatus(null);
      return;
    }
    const requestId = ++quotaRequestIdRef.current;
    try {
      const q = await getTenantQuotaStatus(selectedTenantId, opts, selectedProjectId);
      if (requestId === quotaRequestIdRef.current) setQuotaStatus(q);
    } catch {
      if (requestId === quotaRequestIdRef.current) setQuotaStatus(null);
    }
  }, [status, selectedTenantId, selectedProjectId, opts]);

  const versionById = useMemo(
    () => new Map(versions.map((v) => [v.id, v])),
    [versions]
  );

  const filteredSortedVersions = useMemo(() => {
    let rows = [...versions];
    const q = versionSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.description ?? '').toLowerCase().includes(q) ||
          (v.code_generation_tag ?? '').toLowerCase().includes(q) ||
          (v.publish_target ?? '').toLowerCase().includes(q)
      );
    }
    if (versionStatusFilter === 'draft') rows = rows.filter((v) => !v.published);
    else if (versionStatusFilter === 'published')
      rows = rows.filter((v) => !!v.published);
    else if (versionStatusFilter === 'disabled')
      rows = rows.filter((v) => v.enabled === false);

    if (versionStatusFilter === 'published' && publishedTargetFilter !== 'all') {
      rows = rows.filter((v) => v.publish_target === publishedTargetFilter);
    }

    const pubTime = (v: VersionSchema) => {
      if (!v.published_at) return 0;
      const t = new Date(v.published_at).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const updatedTime = (v: VersionSchema) => {
      const u = v.updated_at ?? v.created_at;
      if (!u) return 0;
      const t = new Date(u).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const createdTime = (v: VersionSchema) => {
      if (!v.created_at) return 0;
      const t = new Date(v.created_at).getTime();
      return Number.isNaN(t) ? 0 : t;
    };

    rows.sort((a, b) => {
      switch (versionSort) {
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        case 'updated_desc':
          return updatedTime(b) - updatedTime(a);
        case 'updated_asc':
          return updatedTime(a) - updatedTime(b);
        case 'created_desc':
          return createdTime(b) - createdTime(a);
        case 'created_asc':
          return createdTime(a) - createdTime(b);
        case 'published_desc':
          return pubTime(b) - pubTime(a);
        default:
          return 0;
      }
    });
    return rows;
  }, [versions, versionSearch, versionStatusFilter, versionSort, publishedTargetFilter]);

  const lineageChain = useMemo(() => {
    if (!lineageDialogVersion) return [];
    return buildLineageChain(lineageDialogVersion, versionById);
  }, [lineageDialogVersion, versionById]);

  const allFilteredSelected = useMemo(
    () =>
      filteredSortedVersions.length > 0 &&
      filteredSortedVersions.every((v) => selectedVersionIds.has(v.id)),
    [filteredSortedVersions, selectedVersionIds]
  );

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchVersions();
    } else {
      setVersions([]);
    }
  }, [selectedProjectId, fetchVersions]);

  useEffect(() => {
    void fetchQuota();
  }, [fetchQuota]);

  useEffect(() => {
    if (versionStatusFilter !== 'published') setPublishedTargetFilter('all');
  }, [versionStatusFilter]);

  useEffect(() => {
    if (!publishHistoryVersion) {
      setPublishHistoryRows([]);
      setPublishHistoryError(null);
      setPublishHistoryLoading(false);
      return;
    }
    let cancelled = false;
    setPublishHistoryLoading(true);
    setPublishHistoryError(null);
    void listVersionPublishHistory(publishHistoryVersion.id, opts)
      .then((rows) => {
        if (!cancelled) {
          setPublishHistoryRows(rows);
          setPublishHistoryLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPublishHistoryError(
            e instanceof Error ? e.message : 'Failed to load publish history.'
          );
          setPublishHistoryRows([]);
          setPublishHistoryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [publishHistoryVersion, opts]);

  useEffect(() => {
    setSelectedVersionIds(new Set());
  }, [selectedProjectId]);

  useEffect(() => {
    const valid = new Set(versions.map((v) => v.id));
    setSelectedVersionIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size === prev.size && [...prev].every((id) => next.has(id))) return prev;
      return next;
    });
  }, [versions]);

  const versionQuotaBlocksCreate = useMemo(() => {
    if (!quotaStatus || quotaStatus.active_version_count_for_project == null) {
      return false;
    }
    return atQuotaLimit(
      quotaStatus.max_versions_per_project,
      quotaStatus.active_version_count_for_project
    );
  }, [quotaStatus]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const versionQuotaBanner = useMemo(() => {
    if (
      !quotaStatus ||
      quotaStatus.max_versions_per_project == null ||
      quotaStatus.active_version_count_for_project == null
    ) {
      return null;
    }
    const line = formatUsageLine(
      'Versions (this project)',
      quotaStatus.active_version_count_for_project,
      quotaStatus.max_versions_per_project
    );
    const level = quotaSeverity(
      quotaStatus.max_versions_per_project,
      quotaStatus.active_version_count_for_project
    );
    return { line, level };
  }, [quotaStatus]);

  const handleCreateOpen = () => {
    setCreateName('');
    setCreateDescription('');
    setCreateCodegenTag('');
    setCreateChangeLog('');
    setCreateSourceVersionId('');
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreateSubmit = async () => {
    if (!selectedTenantId || !selectedProjectId) return;
    if (versionQuotaBlocksCreate) {
      setCreateError(
        'This project has reached the maximum number of versions allowed for the tenant. Remove a version or ask an administrator to raise the quota.'
      );
      return;
    }
    const name = createName.trim();
    if (!name) {
      setCreateError('Version name is required (e.g. 1.0.0).');
      return;
    }
    if (!createDescription.trim()) {
      setCreateError('Description is required.');
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const cg = createCodegenTag.trim();
      const body: VersionCreate = {
        name,
        description: createDescription.trim(),
        change_log: createChangeLog.trim() || undefined,
        source_version_id: createSourceVersionId || undefined,
        ...(cg ? { code_generation_tag: cg } : {}),
      };
      await createVersion(selectedTenantId, selectedProjectId, body, opts);
      setCreateOpen(false);
      await fetchVersions();
      void fetchQuota();
      await alertDialog({ message: 'Version created.', variant: 'success' });
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : 'Failed to create version.'
      );
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleEditOpen = (v: VersionSchema) => {
    if (v.published) {
      alertDialog({
        message: 'Cannot edit a published version. Unpublish it first.',
        variant: 'warning',
      });
      return;
    }
    setEditVersion(v);
    setEditDescription(v.description ?? '');
    setEditChangeLog(v.change_log ?? '');
    setEditCodegenTag(v.code_generation_tag ?? '');
    setEditError(null);
  };

  const handleEditSubmit = async () => {
    if (!editVersion) return;
    if (!editDescription.trim()) {
      setEditError('Description is required.');
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const body: VersionMetadataUpdate = {
        description: editDescription.trim(),
        change_log: editChangeLog.trim() || null,
        code_generation_tag: editCodegenTag.trim() === '' ? '' : editCodegenTag.trim(),
      };
      await updateVersion(editVersion.id, body, opts);
      setEditVersion(null);
      await fetchVersions();
      await alertDialog({ message: 'Version updated.', variant: 'success' });
    } catch (e) {
      setEditError(
        e instanceof Error ? e.message : 'Failed to update version.'
      );
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (v: VersionSchema) => {
    const ok = await confirm({
      title: 'Delete Version',
      message: `Delete version "${v.name}"? This action cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setDeletingId(v.id);
    try {
      await deleteVersion(v.id, opts);
      await fetchVersions();
      void fetchQuota();
      await alertDialog({ message: 'Version deleted.', variant: 'success' });
    } catch (e) {
      await alertDialog({
        message: e instanceof Error ? e.message : 'Failed to delete version.',
        variant: 'error',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const toggleVersionSelected = (id: string, checked: boolean) => {
    setSelectedVersionIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedVersionIds((prev) => {
        const next = new Set(prev);
        filteredSortedVersions.forEach((v) => next.delete(v.id));
        return next;
      });
    } else {
      setSelectedVersionIds((prev) => {
        const next = new Set(prev);
        filteredSortedVersions.forEach((v) => next.add(v.id));
        return next;
      });
    }
  };

  const openPublishDialog = (v: VersionSchema) => {
    if (v.published) return;
    setPublishDialogVersion(v);
    setPublishDialogVisibility('private');
    setPublishDialogTarget('production');
    setPublishDialogNote('');
    setPublishDialogError(null);
  };

  const handlePublishDialogSubmit = async () => {
    if (!publishDialogVersion) return;
    setPublishDialogSubmitting(true);
    setPublishDialogError(null);
    try {
      await publishVersion(
        publishDialogVersion.id,
        {
          visibility: publishDialogVisibility,
          target: publishDialogTarget,
          publish_note: publishDialogNote.trim() || undefined,
        },
        opts
      );
      setPublishDialogVersion(null);
      await fetchVersions();
      await alertDialog({ message: 'Version published.', variant: 'success' });
    } catch (e) {
      setPublishDialogError(e instanceof Error ? e.message : 'Publish failed.');
    } finally {
      setPublishDialogSubmitting(false);
    }
  };

  const handleUnpublishOne = async (v: VersionSchema) => {
    const ok = await confirm({
      title: 'Unpublish version',
      message: `Unpublish "${v.name}"? The version can be edited again after unpublishing.`,
      variant: 'warning',
      confirmLabel: 'Unpublish',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      await unpublishVersion(v.id, opts);
      await fetchVersions();
      await alertDialog({ message: 'Version unpublished.', variant: 'success' });
    } catch (e) {
      await alertDialog({
        message: e instanceof Error ? e.message : 'Unpublish failed.',
        variant: 'error',
      });
    }
  };

  const openStudioForVersion = (v: VersionSchema) => {
    if (!selectedTenantId || !selectedProjectId) return;
    router.push(
      dataDesignerDeepLink({
        tenantId: selectedTenantId,
        projectId: selectedProjectId,
        versionId: v.id,
        readOnly: !!v.published,
      })
    );
  };

  const handleExportPublishedCsv = () => {
    const publishedRows = filteredSortedVersions.filter((v) => v.published);
    if (publishedRows.length === 0) return;
    const headers = [
      'project_name',
      'project_id',
      'version_name',
      'version_id',
      'code_generation_tag',
      'publish_target',
      'visibility',
      'published_at',
    ];
    const rows = publishedRows.map((v) => [
      selectedProject?.name ?? '',
      selectedProjectId ?? '',
      v.name,
      v.id,
      v.code_generation_tag ?? '',
      v.publish_target ?? '',
      v.visibility ?? '',
      v.published_at ?? '',
    ]);
    const content = buildCsvContent(headers, rows);
    const filename = `published-versions-${selectedProject?.slug ?? selectedProjectId ?? 'export'}.csv`;
    downloadCsvFile(filename, content);
  };

  const handleBulkPublish = async (visibility: 'private' | 'public') => {
    const targets = versions.filter((v) => selectedVersionIds.has(v.id) && !v.published);
    if (targets.length === 0) {
      await alertDialog({ message: 'No draft versions in selection.', variant: 'warning' });
      return;
    }
    const ok = await confirm({
      title: 'Publish versions',
      message: `Publish ${targets.length} draft version(s) with ${visibility} visibility to channel "${bulkPublishTarget}"?`,
      variant: 'info',
      confirmLabel: 'Publish',
    });
    if (!ok) return;
    setBulkWorking(true);
    let okN = 0;
    let fail = 0;
    for (const v of targets) {
      try {
        await publishVersion(v.id, { visibility, target: bulkPublishTarget }, opts);
        okN++;
      } catch {
        fail++;
      }
    }
    await fetchVersions();
    void fetchQuota();
    setSelectedVersionIds(new Set());
    setBulkWorking(false);
    await alertDialog({
      message:
        fail === 0
          ? `Published ${okN} version(s).`
          : `Published ${okN} version(s); ${fail} failed.`,
      variant: fail ? 'warning' : 'success',
    });
  };

  const handleBulkUnpublish = async () => {
    const targets = versions.filter((v) => selectedVersionIds.has(v.id) && !!v.published);
    if (targets.length === 0) {
      await alertDialog({ message: 'No published versions in selection.', variant: 'warning' });
      return;
    }
    const ok = await confirm({
      title: 'Unpublish versions',
      message: `Unpublish ${targets.length} version(s)? Drafts can be edited again.`,
      variant: 'info',
      confirmLabel: 'Unpublish',
    });
    if (!ok) return;
    setBulkWorking(true);
    let okN = 0;
    let fail = 0;
    for (const v of targets) {
      try {
        await unpublishVersion(v.id, opts);
        okN++;
      } catch {
        fail++;
      }
    }
    await fetchVersions();
    setSelectedVersionIds(new Set());
    setBulkWorking(false);
    await alertDialog({
      message:
        fail === 0
          ? `Unpublished ${okN} version(s).`
          : `Unpublished ${okN} version(s); ${fail} failed.`,
      variant: fail ? 'warning' : 'success',
    });
  };

  const handleBulkDelete = async () => {
    const targets = versions.filter((v) => selectedVersionIds.has(v.id));
    if (targets.length === 0) return;
    const ok = await confirm({
      title: 'Archive versions',
      message: `Archive ${targets.length} version(s)? The versions will be disabled and hidden but can be restored by an administrator.`,
      variant: 'danger',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    setBulkWorking(true);
    let okN = 0;
    let fail = 0;
    for (const v of targets) {
      try {
        await deleteVersion(v.id, opts);
        okN++;
      } catch {
        fail++;
      }
    }
    await fetchVersions();
    void fetchQuota();
    setSelectedVersionIds(new Set());
    setBulkWorking(false);
    await alertDialog({
      message:
        fail === 0
          ? `Archived ${okN} version(s).`
          : `Archived ${okN} version(s); ${fail} failed.`,
      variant: fail ? 'warning' : 'success',
    });
  };

  const selectedVersionCount = selectedVersionIds.size;

  if (status === 'loading') {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (status === 'unauthenticated' || !session) {
    return null;
  }

  if (tenantsLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (tenants.length === 0 && !error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Versions
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Select a tenant to manage versions. You need access to at least one
          tenant.
        </p>
      </div>
    );
  }

  if (projects.length === 0 && selectedTenantId && !loading && !error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Versions
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          No projects in this tenant. Create a project first from the Projects
          page.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 dashboard-print-area">
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center print:hidden">
              <GitBranch className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 print:text-black">
                Versions
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 print:hidden">
                Manage specification versions by project
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <select
              value={selectedTenantId ?? ''}
              onChange={(e) => {
                const newTenantId = e.target.value || null;
                setSelectedTenantId(newTenantId);
                setSelectedProjectId(null);
                setProjects([]);
                setVersions([]);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Select tenant"
            >
              <option value="">Select tenant</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId(e.target.value || null)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Select project"
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleCreateOpen}
              disabled={!selectedProjectId || versionQuotaBlocksCreate}
              title={
                versionQuotaBlocksCreate
                  ? 'Version quota reached for this project'
                  : undefined
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Plus className="h-4 w-4" />
              New Version
            </button>
          </div>
        </div>
        {versionQuotaBanner && (
          <div
            className={
              versionQuotaBanner.level === 'block'
                ? 'rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-200 print:hidden'
                : versionQuotaBanner.level === 'warn'
                  ? 'rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 print:hidden'
                  : 'rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 print:hidden'
            }
            role="status"
          >
            <div className="font-medium">{versionQuotaBanner.line}</div>
            {versionQuotaBanner.level === 'block' && (
              <p className="mt-1 text-xs opacity-90">
                Version quota is full for this project. Delete a version or ask an administrator to
                raise the limit.
              </p>
            )}
            {versionQuotaBanner.level === 'warn' && (
              <p className="mt-1 text-xs opacity-90">You are near the version limit for this project.</p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm print:hidden"
          role="alert"
        >
          {error}
        </div>
      )}

      {!selectedProjectId ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-8 text-center text-slate-500 dark:text-slate-400">
          Select a project to list versions.
        </div>
      ) : versions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-12 text-center">
          <GitBranch className="h-12 w-12 mx-auto text-slate-400 dark:text-slate-500 mb-3" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">
            No versions yet
          </p>
          <p className="text-slate-500 dark:text-slate-500 text-sm mt-1 mb-4">
            Create your first version for this project.
          </p>
          <button
            type="button"
            onClick={handleCreateOpen}
            disabled={versionQuotaBlocksCreate}
            title={
              versionQuotaBlocksCreate
                ? 'Version quota reached for this project'
                : undefined
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Plus className="h-4 w-4" />
            New Version
          </button>
        </div>
      ) : (
        <div className="dashboard-print-area rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden print:border-slate-400 print:shadow-none">
          <div className="flex flex-col gap-3 p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 print:hidden">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={versionSearch}
                  onChange={(e) => setVersionSearch(e.target.value)}
                  placeholder="Search name, tag, or description"
                  aria-label="Search versions"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <select
                value={versionStatusFilter}
                onChange={(e) =>
                  setVersionStatusFilter(e.target.value as VersionStatusFilter)
                }
                aria-label="Filter by status"
                className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft only</option>
                <option value="published">Published only</option>
                <option value="disabled">Disabled only</option>
              </select>
              {versionStatusFilter === 'published' && (
                <select
                  value={publishedTargetFilter}
                  onChange={(e) =>
                    setPublishedTargetFilter(e.target.value as PublishedTargetFilter)
                  }
                  aria-label="Filter published by channel"
                  className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All channels</option>
                  {VERSION_PUBLISH_TARGETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={versionSort}
                onChange={(e) => setVersionSort(e.target.value as VersionSortKey)}
                aria-label="Sort versions"
                className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="updated_desc">Updated (newest)</option>
                <option value="updated_asc">Updated (oldest)</option>
                <option value="published_desc">Published date</option>
                <option value="created_desc">Created (newest)</option>
                <option value="created_asc">Created (oldest)</option>
                <option value="name_asc">Name (A–Z)</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {filteredSortedVersions.length} of {versions.length} version
                {versions.length === 1 ? '' : 's'}
                {versionSearch.trim() || versionStatusFilter !== 'all' ? ' (filtered)' : ''}
              </p>
              {versionStatusFilter === 'published' && filteredSortedVersions.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportPublishedCsv}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline print:hidden"
                >
                  Export published list (CSV)
                </button>
              )}
            </div>
          </div>
          {selectedVersionCount > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-indigo-50/90 dark:bg-indigo-950/30 print:hidden"
              role="status"
            >
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {bulkWorking ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Working…
                  </span>
                ) : (
                  `${selectedVersionCount} selected`
                )}
              </span>
              <select
                value={bulkPublishTarget}
                onChange={(e) =>
                  setBulkPublishTarget(e.target.value as (typeof VERSION_PUBLISH_TARGETS)[number])
                }
                disabled={bulkWorking}
                aria-label="Bulk publish channel"
                className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {VERSION_PUBLISH_TARGETS.map((t) => (
                  <option key={t} value={t}>
                    Channel: {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={bulkWorking}
                onClick={() => void handleBulkPublish('private')}
                className="px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Publish (private)
              </button>
              <button
                type="button"
                disabled={bulkWorking}
                onClick={() => void handleBulkPublish('public')}
                className="px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Publish (public)
              </button>
              <button
                type="button"
                disabled={bulkWorking}
                onClick={() => void handleBulkUnpublish()}
                className="px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Unpublish
              </button>
              <button
                type="button"
                disabled={bulkWorking}
                onClick={() => void handleBulkDelete()}
                className="px-3 py-1.5 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Archive
              </button>
              <button
                type="button"
                disabled={bulkWorking}
                onClick={() => setSelectedVersionIds(new Set())}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear selection
              </button>
            </div>
          )}
          {filteredSortedVersions.length === 0 ? (
            <div className="p-10 text-center text-slate-600 dark:text-slate-400">
              <p className="font-medium">No versions match the current filters.</p>
              <button
                type="button"
                className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                onClick={() => {
                  setVersionSearch('');
                  setVersionStatusFilter('all');
                  setPublishedTargetFilter('all');
                }}
              >
                Clear search and status filter
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th
                      scope="col"
                      className="w-12 px-3 py-3 text-left print:hidden"
                    >
                      <Checkbox.Root
                        checked={
                          allFilteredSelected
                            ? true
                            : filteredSortedVersions.some((v) =>
                                  selectedVersionIds.has(v.id)
                                )
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={() => toggleSelectAllFiltered()}
                        className="flex h-4 w-4 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 data-[state=indeterminate]:bg-indigo-600 data-[state=indeterminate]:border-indigo-600"
                        aria-label="Select all visible versions"
                      >
                        <Checkbox.Indicator className="flex items-center justify-center text-white">
                          {filteredSortedVersions.every((v) =>
                            selectedVersionIds.has(v.id)
                          ) ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Version
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Branched from
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Code gen tag
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Last commit
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Updated
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider print:hidden">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSortedVersions.map((v) => (
                    <tr
                      key={v.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-3 print:hidden">
                        <Checkbox.Root
                          checked={selectedVersionIds.has(v.id)}
                          onCheckedChange={(c) =>
                            toggleVersionSelected(v.id, c === true)
                          }
                          className="flex h-4 w-4 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                          aria-label={`Select version ${v.name}`}
                        >
                          <Checkbox.Indicator className="flex items-center justify-center text-white">
                            <Check className="h-3 w-3" />
                          </Checkbox.Indicator>
                        </Checkbox.Root>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                            {v.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setHistoryDialogVersion(v)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 print:hidden"
                            title="Version history (revisions, rollback, open at revision)"
                          >
                            <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            History
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {v.published && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200">
                              <CheckCircle className="h-3 w-3" />
                              Published
                            </span>
                          )}
                          {v.published && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                              title="Published versions are locked for metadata edits until unpublished."
                            >
                              <Lock className="h-3 w-3" />
                              Locked
                            </span>
                          )}
                          {v.visibility === 'public' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200">
                              Public
                            </span>
                          )}
                          {v.published && v.publish_target && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100/90 dark:bg-amber-900/35 text-amber-900 dark:text-amber-100">
                              {v.publish_target}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          {v.source_version_id ? (
                            <span
                              className="font-mono text-xs"
                              title={v.source_version_id}
                            >
                              {versionById.get(v.source_version_id)?.name ??
                                `${v.source_version_id.slice(0, 8)}…`}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setLineageDialogVersion(v)}
                            className="inline-flex shrink-0 rounded-md p-1 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 print:hidden"
                            title="Branch lineage"
                            aria-label={`Branch lineage for ${v.name}`}
                          >
                            <ListTree className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {v.code_generation_tag ? (
                          <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/35 text-violet-900 dark:text-violet-100">
                            {v.code_generation_tag}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate">
                          {v.description ?? '—'}
                        </div>
                        {v.change_log && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xs truncate">
                            {v.change_log}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {v.published ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Live
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Draft
                              </span>
                            )}
                            {v.enabled === false && (
                              <span className="text-xs text-amber-600 dark:text-amber-400">
                                Disabled
                              </span>
                            )}
                          </div>
                          {v.published && v.published_at && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {formatDateTime(v.published_at)}
                            </span>
                          )}
                          {v.published && v.publish_target && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Channel: {v.publish_target}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {v.last_revision != null && v.last_revision > 0 ? (
                          <div>
                            <span className="font-mono text-slate-800 dark:text-slate-200">
                              r{v.last_revision}
                            </span>
                            {v.last_committed_at ? (
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {formatDateTime(v.last_committed_at)}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTime(v.updated_at ?? v.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTime(v.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right print:hidden">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              type="button"
                              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              aria-label="Version actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              className="min-w-[200px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-50 py-1"
                              sideOffset={4}
                              align="end"
                            >
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[disabled]:opacity-50"
                                onSelect={() => handleEditOpen(v)}
                                disabled={!!v.published}
                              >
                                <Pencil className="h-4 w-4" />
                                Edit
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[disabled]:opacity-50"
                                onSelect={() => openPublishDialog(v)}
                                disabled={!!v.published}
                              >
                                <CheckCircle className="h-4 w-4" />
                                Publish…
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[disabled]:opacity-50"
                                onSelect={() => void handleUnpublishOne(v)}
                                disabled={!v.published}
                              >
                                <Lock className="h-4 w-4" />
                                Unpublish
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                                onSelect={() => setPublishHistoryVersion(v)}
                              >
                                <History className="h-4 w-4" />
                                Publish history
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                                onSelect={() => openStudioForVersion(v)}
                              >
                                <ExternalLink className="h-4 w-4" />
                                Open in Studio
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[disabled]:opacity-50"
                                onSelect={() => setDiffDialogVersion(v)}
                              >
                                <GitCompare className="h-4 w-4" />
                                Revision diff
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[disabled]:opacity-50"
                                onSelect={() => {
                                  setCompareDialogBaseId(v.id);
                                  setCompareDialogOpen(true);
                                }}
                              >
                                <GitMerge className="h-4 w-4" />
                                Compare with another version…
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[disabled]:opacity-50"
                                onSelect={() => setGraphDialogVersion(v)}
                              >
                                <Network className="h-4 w-4" />
                                Relationship graph
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[disabled]:opacity-50"
                                onSelect={() => setLineageDialogVersion(v)}
                              >
                                <ListTree className="h-4 w-4" />
                                Branch lineage
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[disabled]:opacity-50"
                                onSelect={() => setHistoryDialogVersion(v)}
                              >
                                <History className="h-4 w-4" />
                                Version history
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[disabled]:opacity-50"
                                onSelect={() => setImportDialogVersion(v)}
                                disabled={!!v.published}
                              >
                                <Upload className="h-4 w-4" />
                                Import schema…
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                                onSelect={() => {
                                  setTagDialogVersion(v);
                                  setTagDialogValue(v.code_generation_tag ?? '');
                                  setTagDialogError(null);
                                }}
                              >
                                <Tag className="h-4 w-4" />
                                Code generation tag…
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 outline-none cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 data-[disabled]:opacity-50"
                                onSelect={() => handleDelete(v)}
                                disabled={deletingId === v.id}
                              >
                                {deletingId === v.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                Delete
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Dialog.Root
        open={!!publishDialogVersion}
        onOpenChange={(open) => {
          if (!open && !publishDialogSubmitting) setPublishDialogVersion(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
            onEscapeKeyDown={(event) => {
              if (publishDialogSubmitting) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (publishDialogSubmitting) event.preventDefault();
            }}
          >
            <div className="p-6 pb-2">
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Publish version
              </Dialog.Title>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {publishDialogVersion ? (
                  <>
                    <span className="font-mono">{publishDialogVersion.name}</span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="px-6 py-2 flex-1 overflow-auto space-y-4">
              {publishDialogError && (
                <div
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
                  role="alert"
                >
                  {publishDialogError}
                </div>
              )}
              <div>
                <span className={labelClass}>Visibility</span>
                <div className="mt-2 flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="pub-vis"
                      checked={publishDialogVisibility === 'private'}
                      onChange={() => setPublishDialogVisibility('private')}
                      className="text-indigo-600"
                    />
                    Private
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="pub-vis"
                      checked={publishDialogVisibility === 'public'}
                      onChange={() => setPublishDialogVisibility('public')}
                      className="text-indigo-600"
                    />
                    Public
                  </label>
                </div>
              </div>
              <div>
                <Label.Root htmlFor="pub-target" className={labelClass}>
                  Publish channel
                </Label.Root>
                <select
                  id="pub-target"
                  value={publishDialogTarget}
                  onChange={(e) =>
                    setPublishDialogTarget(
                      e.target.value as (typeof VERSION_PUBLISH_TARGETS)[number]
                    )
                  }
                  className={`${inputClass} mt-1`}
                >
                  {VERSION_PUBLISH_TARGETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label.Root htmlFor="pub-note" className={labelClass}>
                  Publish note (optional)
                </Label.Root>
                <textarea
                  id="pub-note"
                  value={publishDialogNote}
                  onChange={(e) => setPublishDialogNote(e.target.value)}
                  rows={3}
                  placeholder="Changelog or release note for this publish…"
                  className={`${inputClass} mt-1 resize-y min-h-[4rem]`}
                />
              </div>
            </div>
            <div className="p-6 pt-2 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                disabled={publishDialogSubmitting}
                onClick={() => setPublishDialogVersion(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={publishDialogSubmitting}
                onClick={() => void handlePublishDialogSubmit()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {publishDialogSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Publish
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={!!publishHistoryVersion}
        onOpenChange={(open) => !open && setPublishHistoryVersion(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
          <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[85vh]">
            <div className="p-6 pb-2">
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Publish history
              </Dialog.Title>
              {publishHistoryVersion ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  {publishHistoryVersion.name}
                </p>
              ) : null}
            </div>
            <div className="px-6 flex-1 overflow-auto pb-4 min-h-[120px]">
              {publishHistoryLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : publishHistoryError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{publishHistoryError}</p>
              ) : publishHistoryRows.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No publish or unpublish events recorded yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {publishHistoryRows.map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                        <span
                          className={
                            ev.event_type === 'publish'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-300'
                          }
                        >
                          {ev.event_type === 'publish' ? 'Published' : 'Unpublished'}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {formatDateTime(ev.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-600 dark:text-slate-300 space-y-0.5">
                        {(ev.actor_name || ev.actor_email) && (
                          <div>
                            By {ev.actor_name ?? '—'}
                            {ev.actor_email ? (
                              <span className="text-slate-500 dark:text-slate-400">
                                {' '}
                                ({ev.actor_email})
                              </span>
                            ) : null}
                          </div>
                        )}
                        {ev.event_type === 'publish' && (
                          <>
                            {ev.target && (
                              <div>
                                Channel: <span className="font-mono">{ev.target}</span>
                              </div>
                            )}
                            {ev.visibility && (
                              <div>
                                Visibility: <span className="capitalize">{ev.visibility}</span>
                              </div>
                            )}
                            {ev.note ? (
                              <div className="mt-1 text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                                {ev.note}
                              </div>
                            ) : null}
                          </>
                        )}
                        {ev.event_type === 'unpublish' && ev.target && (
                          <div>
                            Previous channel: <span className="font-mono">{ev.target}</span>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                type="button"
                onClick={() => setPublishHistoryVersion(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Create dialog */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
            onEscapeKeyDown={(event) => {
              if (createSubmitting) {
                event.preventDefault();
                return;
              }
              setCreateOpen(false);
            }}
            onPointerDownOutside={(event) => {
              if (createSubmitting) {
                event.preventDefault();
                return;
              }
              setCreateOpen(false);
            }}
          >
            <div className="p-6 pb-2">
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Create New Version
              </Dialog.Title>
            </div>
            <div className="px-6 py-2 flex-1 overflow-auto space-y-4">
              {createError && (
                <div
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
                  role="alert"
                >
                  {createError}
                </div>
              )}
              {versionQuotaBlocksCreate && (
                <div
                  className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-sm"
                  role="alert"
                >
                  Version quota reached for this project. Delete a version or ask an administrator to
                  raise the limit before creating another.
                </div>
              )}
              <div>
                <Label.Root htmlFor="create-source" className={labelClass}>
                  Copy from version (optional)
                </Label.Root>
                <select
                  id="create-source"
                  value={createSourceVersionId}
                  onChange={(e) => setCreateSourceVersionId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Create blank version</option>
                  {versions.map((ver) => (
                    <option key={ver.id} value={ver.id}>
                      {ver.published ? '[published] ' : ''}
                      {ver.name} – {ver.description ?? 'No description'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label.Root htmlFor="create-name" className={labelClass}>
                  Version name *
                </Label.Root>
                <input
                  id="create-name"
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. 1.0.0"
                  className={inputClass}
                  disabled={createSubmitting}
                />
              </div>
              <div>
                <Label.Root htmlFor="create-description" className={labelClass}>
                  Description *
                </Label.Root>
                <input
                  id="create-description"
                  type="text"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className={inputClass}
                  disabled={createSubmitting}
                />
              </div>
              <div>
                <Label.Root htmlFor="create-changelog" className={labelClass}>
                  Change log
                </Label.Root>
                <textarea
                  id="create-changelog"
                  value={createChangeLog}
                  onChange={(e) => setCreateChangeLog(e.target.value)}
                  rows={3}
                  className={inputClass}
                  disabled={createSubmitting}
                />
              </div>
              <div>
                <Label.Root htmlFor="create-codegen-tag" className={labelClass}>
                  Code generation tag (optional)
                </Label.Root>
                <input
                  id="create-codegen-tag"
                  type="text"
                  value={createCodegenTag}
                  onChange={(e) => setCreateCodegenTag(e.target.value)}
                  placeholder="e.g. api-v2, v1"
                  className={inputClass}
                  disabled={createSubmitting}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Stable label for Generate code in Studio; unique per project (case-insensitive).
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {VERSION_TAG_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={createSubmitting}
                      onClick={() => setCreateCodegenTag(preset)}
                      className="px-2 py-1 rounded-md text-xs font-mono bg-violet-100 dark:bg-violet-900/40 text-violet-900 dark:text-violet-100 hover:opacity-90 disabled:opacity-50"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={createSubmitting}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleCreateSubmit}
                disabled={createSubmitting || versionQuotaBlocksCreate}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {createSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Create Version
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit dialog */}
      <Dialog.Root
        open={!!editVersion}
        onOpenChange={(open) => !open && !editSubmitting && setEditVersion(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
            onEscapeKeyDown={(event) => {
              if (editSubmitting) {
                event.preventDefault();
                return;
              }
              setEditVersion(null);
            }}
            onPointerDownOutside={(event) => {
              if (editSubmitting) {
                event.preventDefault();
                return;
              }
              setEditVersion(null);
            }}
          >
            <div className="p-6 pb-2">
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Edit Version
              </Dialog.Title>
              {editVersion && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  {editVersion.name}
                </p>
              )}
            </div>
            <div className="px-6 py-2 flex-1 overflow-auto space-y-4">
              {editError && (
                <div
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
                  role="alert"
                >
                  {editError}
                </div>
              )}
              <div>
                <Label.Root htmlFor="edit-description" className={labelClass}>
                  Description *
                </Label.Root>
                <input
                  id="edit-description"
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className={inputClass}
                  disabled={editSubmitting}
                />
              </div>
              <div>
                <Label.Root htmlFor="edit-changelog" className={labelClass}>
                  Change log
                </Label.Root>
                <textarea
                  id="edit-changelog"
                  value={editChangeLog}
                  onChange={(e) => setEditChangeLog(e.target.value)}
                  rows={4}
                  className={inputClass}
                  disabled={editSubmitting}
                />
              </div>
              <div>
                <Label.Root htmlFor="edit-codegen-tag" className={labelClass}>
                  Code generation tag
                </Label.Root>
                <input
                  id="edit-codegen-tag"
                  type="text"
                  value={editCodegenTag}
                  onChange={(e) => setEditCodegenTag(e.target.value)}
                  placeholder="e.g. api-v2 (leave empty to clear)"
                  className={inputClass}
                  disabled={editSubmitting}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Used in Studio → Generate code to target this schema. Unique per project.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setEditVersion(null)}
                disabled={editSubmitting}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSubmit}
                disabled={editSubmitting}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {editSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Save
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={!!tagDialogVersion}
        onOpenChange={(open) => {
          if (!open && !tagDialogSubmitting) {
            setTagDialogVersion(null);
            setTagDialogError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6"
            onPointerDownOutside={(e) => {
              if (tagDialogSubmitting) e.preventDefault();
            }}
          >
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Code generation tag
            </Dialog.Title>
            {tagDialogVersion && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-mono">
                {tagDialogVersion.name}
              </p>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
              Set a stable label (e.g. <span className="font-mono">v1</span>,{' '}
              <span className="font-mono">api-v2</span>) so Generate code in Studio can use this
              version&apos;s persisted schema. Leave empty to remove the tag.
            </p>
            {tagDialogError && (
              <div
                className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
                role="alert"
              >
                {tagDialogError}
              </div>
            )}
            <Label.Root htmlFor="tag-dialog-input" className={`${labelClass} mt-4 block`}>
              Tag
            </Label.Root>
            <input
              id="tag-dialog-input"
              type="text"
              value={tagDialogValue}
              onChange={(e) => setTagDialogValue(e.target.value)}
              className={`mt-1 ${inputClass}`}
              disabled={tagDialogSubmitting}
              placeholder="api-v2"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {VERSION_TAG_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={tagDialogSubmitting}
                  onClick={() => setTagDialogValue(preset)}
                  className="px-2 py-1 rounded-md text-xs font-mono bg-violet-100 dark:bg-violet-900/40 text-violet-900 dark:text-violet-100 hover:opacity-90 disabled:opacity-50"
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                disabled={tagDialogSubmitting}
                onClick={() => setTagDialogVersion(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={tagDialogSubmitting || !tagDialogVersion}
                onClick={async () => {
                  if (!tagDialogVersion) return;
                  setTagDialogSubmitting(true);
                  setTagDialogError(null);
                  try {
                    await updateVersion(
                      tagDialogVersion.id,
                      {
                        code_generation_tag:
                          tagDialogValue.trim() === '' ? '' : tagDialogValue.trim(),
                      },
                      opts
                    );
                    setTagDialogVersion(null);
                    await fetchVersions();
                    await alertDialog({ message: 'Code generation tag updated.', variant: 'success' });
                  } catch (e) {
                    setTagDialogError(
                      e instanceof Error ? e.message : 'Failed to update tag.'
                    );
                  } finally {
                    setTagDialogSubmitting(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {tagDialogSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={!!lineageDialogVersion}
        onOpenChange={(open) => !open && setLineageDialogVersion(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md max-h-[85vh] overflow-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl p-6 border border-slate-200 dark:border-slate-700"
            aria-describedby={undefined}
            onEscapeKeyDown={() => setLineageDialogVersion(null)}
            onPointerDownOutside={() => setLineageDialogVersion(null)}
          >
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Branch lineage
            </Dialog.Title>
            {lineageDialogVersion && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-mono">
                {lineageDialogVersion.name}
              </p>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
              Versions copied or branched from another version show the chain from this row up to the
              root (no parent).
            </p>
            <ol className="mt-4 space-y-2 list-decimal list-inside text-sm text-slate-800 dark:text-slate-200">
              {lineageChain.map((node, idx) => (
                <li key={node.id}>
                  <span className="font-mono font-medium">{node.name}</span>
                  {idx === 0 ? (
                    <span className="text-slate-500 dark:text-slate-400"> (this version)</span>
                  ) : null}
                </li>
              ))}
            </ol>
            {lineageChain.length === 1 && !lineageChain[0]?.source_version_id && (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                No parent version is recorded for this row.
              </p>
            )}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setLineageDialogVersion(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {versions.length > 0 && (
        <VersionCompareDialog
          open={compareDialogOpen}
          onOpenChange={(open) => {
            setCompareDialogOpen(open);
            if (!open) setCompareDialogBaseId('');
          }}
          versions={versions}
          initialBaseVersionId={compareDialogBaseId || versions[0]?.id || ''}
          options={opts}
        />
      )}

      <VersionDiffDialog
        open={!!diffDialogVersion}
        onOpenChange={(open) => !open && setDiffDialogVersion(null)}
        versionId={diffDialogVersion?.id ?? ''}
        versionName={diffDialogVersion?.name ?? ''}
        options={opts}
      />
      <RelationshipGraphDialog
        open={!!graphDialogVersion}
        onOpenChange={(open) => !open && setGraphDialogVersion(null)}
        versionId={graphDialogVersion?.id ?? ''}
        versionName={graphDialogVersion?.name ?? ''}
        options={opts}
      />
      <VersionHistoryDialog
        open={!!historyDialogVersion}
        onOpenChange={(open) => !open && setHistoryDialogVersion(null)}
        versionId={historyDialogVersion?.id ?? ''}
        versionName={historyDialogVersion?.name}
        options={opts}
        tenantId={selectedTenantId ?? undefined}
        projectId={selectedProjectId ?? undefined}
        onLoadRevision={(revision, readOnly) => {
          if (!selectedTenantId || !selectedProjectId || !historyDialogVersion) return;
          router.push(
            dataDesignerDeepLink({
              tenantId: selectedTenantId,
              projectId: selectedProjectId,
              versionId: historyDialogVersion.id,
              revision,
              readOnly,
            })
          );
        }}
        onRollbackSuccess={() => {
          void fetchVersions();
        }}
        onBranchSuccess={(newVersion) => {
          void fetchVersions();
          void fetchQuota();
          void alertDialog({
            message: `Created version "${newVersion.name}" from history.`,
            variant: 'success',
          });
        }}
        onDeleteSuccess={async () => {
          setHistoryDialogVersion(null);
          await fetchVersions();
          await alertDialog({ message: 'Version deleted.', variant: 'success' });
        }}
      />
      {importDialogVersion && (
        <SchemaImportDialog
          open
          onOpenChange={(open) => !open && setImportDialogVersion(null)}
          version={importDialogVersion}
          options={opts}
        />
      )}
    </div>
  );
}
