'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Loader2,
  Plus,
  FolderKanban,
  Pencil,
  Trash2,
  MoreVertical,
  AlertTriangle,
  RotateCcw,
  Flame,
  Eye,
  EyeOff,
  Search,
  Tag,
  Archive,
  ArrowUpDown,
  Check,
  Copy,
  Settings,
} from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Checkbox from '@radix-ui/react-checkbox';
import {
  listProjects,
  listVersions,
  createProject,
  cloneProject,
  updateProject,
  deleteProject,
  restoreProject,
  permanentDeleteProject,
  getUser,
  getRestClientOptions,
  isForbiddenError,
  type ProjectSchema,
  type ProjectCreate,
  type ProjectUpdate,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';
import { useTenantPermissions } from '@/app/hooks/useTenantPermissions';
import { useTenantSelection } from '@/app/contexts/TenantSelectionContext';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function nameToSlug(name: string): string {
  const t = name.trim().toLowerCase();
  if (!t) return '';
  return t
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugError(slug: string): string | null {
  const t = slug.trim();
  if (!t) return 'Slug is required.';
  if (!SLUG_REGEX.test(t)) {
    return 'Slug must contain only lowercase letters, numbers, and single hyphens (e.g. my-project).';
  }
  return null;
}

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

type ProjectLifecycle = 'active' | 'disabled' | 'archived';

type SortField = 'name' | 'created_at' | 'updated_at';
type SortDir = 'asc' | 'desc';

function getProjectTags(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) return [];
  const raw = metadata.tags;
  if (Array.isArray(raw)) {
    return raw
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [raw.trim()];
  }
  return [];
}

function projectLifecycle(project: ProjectSchema): ProjectLifecycle {
  if (project.deleted_at) return 'archived';
  if (project.enabled === false) return 'disabled';
  return 'active';
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { confirm, alert: alertDialog } = useDialog();
  const { tenants, selectedTenantId, setSelectedTenantId } = useTenantSelection();
  const [projects, setProjects] = useState<ProjectSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectSchema | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [permanentDeletingId, setPermanentDeletingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectLifecycle>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [versionCounts, setVersionCounts] = useState<Record<string, number>>({});
  const [versionCountsLoading, setVersionCountsLoading] = useState(false);
  const [ownerLabels, setOwnerLabels] = useState<Record<string, string>>({});
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkWorking, setBulkWorking] = useState(false);
  const [cloneSource, setCloneSource] = useState<ProjectSchema | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const perms = useTenantPermissions(selectedTenantId);
  const canReadProjects = perms.has('project:read');
  const canWriteProjects = perms.has('project:write');

  const opts = useMemo(
    () =>
      getRestClientOptions(
        (session as { accessToken?: string } | null) ?? null
      ),
    [(session as { accessToken?: string } | null)?.accessToken]
  );

  const fetchProjects = useCallback(async () => {
    if (status !== 'authenticated' || !selectedTenantId) {
      setLoading(false);
      setProjects([]);
      return;
    }
    if (perms.loading) {
      return;
    }
    if (!canReadProjects) {
      setLoading(false);
      setProjects([]);
      setError('You do not have permission to view projects for this tenant.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listProjects(selectedTenantId, opts, showDeleted);
      setProjects(data);
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view projects for this tenant.'
          : e instanceof Error
            ? e.message
            : 'Failed to load projects'
      );
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [status, selectedTenantId, opts, showDeleted, canReadProjects, perms.loading]);

  useEffect(() => {
    if (status !== 'authenticated' || !selectedTenantId) return;
    fetchProjects();
  }, [status, selectedTenantId, fetchProjects]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedTenantId, showDeleted]);

  useEffect(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setTagFilter('');
    setOwnerFilter('all');
    setSortField('updated_at');
    setSortDir('desc');
  }, [selectedTenantId]);

  const allDistinctTags = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects) {
      for (const t of getProjectTags(p.metadata)) {
        s.add(t);
      }
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const uniqueOwnerIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects) {
      if (p.creator_id) s.add(p.creator_id);
    }
    return Array.from(s);
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tagSub = tagFilter.trim().toLowerCase();
    let list = projects.slice();

    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      list = list.filter((p) => projectLifecycle(p) === statusFilter);
    }

    if (tagSub) {
      list = list.filter((p) =>
        getProjectTags(p.metadata).some((t) =>
          t.toLowerCase().includes(tagSub)
        )
      );
    }

    if (ownerFilter !== 'all') {
      list = list.filter((p) => p.creator_id === ownerFilter);
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortField === 'name') {
        return a.name.localeCompare(b.name) * dir;
      }
      const dateA =
        sortField === 'created_at'
          ? new Date(a.created_at).getTime()
          : new Date(a.updated_at ?? a.created_at).getTime();
      const dateB =
        sortField === 'created_at'
          ? new Date(b.created_at).getTime()
          : new Date(b.updated_at ?? b.created_at).getTime();
      return (dateA - dateB) * dir;
    });

    return list;
  }, [
    projects,
    searchQuery,
    statusFilter,
    tagFilter,
    ownerFilter,
    sortField,
    sortDir,
  ]);

  const visibleIds = useMemo(
    () => filteredProjects.map((p) => p.id),
    [filteredProjects]
  );

  const allVisibleSelected =
    visibleIds.length > 0 &&
    visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) =>
    selectedIds.has(id)
  );

  useEffect(() => {
    if (!selectedTenantId || status !== 'authenticated' || visibleIds.length === 0) {
      setVersionCounts({});
      setVersionCountsLoading(false);
      return;
    }
    let cancelled = false;
    setVersionCountsLoading(true);

    Promise.allSettled(
      visibleIds.map((projectId) =>
        listVersions(selectedTenantId, projectId, opts).then((versions) => ({
          id: projectId,
          count: versions.length,
        }))
      )
    )
      .then((results) => {
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { id, count } = result.value;
            next[id] = count;
          }
        }
        setVersionCounts(next);
      })
      .finally(() => {
        if (!cancelled) setVersionCountsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTenantId, status, visibleIds, opts]);

  useEffect(() => {
    if (!selectedTenantId || status !== 'authenticated' || projects.length === 0) {
      setOwnerLabels({});
      return;
    }
    const ids = [
      ...new Set(
        projects
          .map((p) => p.creator_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    if (ids.length === 0) {
      setOwnerLabels({});
      return;
    }
    let cancelled = false;
    Promise.all(
      ids.map((id) =>
        getUser(id, opts).then(
          (u) => [id, u.name?.trim() || u.email] as const,
          () => [id, shortId(id)] as const
        )
      )
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, label] of rows) next[id] = label;
      setOwnerLabels(next);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTenantId, status, projects, opts]);

  const toggleSelectVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedWritableProjects = useMemo(
    () =>
      projects.filter(
        (p) => selectedIds.has(p.id) && !p.deleted_at && p.enabled !== false
      ),
    [projects, selectedIds]
  );

  const handleBulkArchive = async () => {
    if (!selectedTenantId || !canWriteProjects) return;
    const targets = selectedWritableProjects;
    if (targets.length === 0) {
      await alertDialog({
        message:
          'Select at least one active project to archive. Archived projects must be restored before tagging.',
        variant: 'info',
      });
      return;
    }
    const ok = await confirm({
      title: 'Archive projects',
      message: (
        <span>
          Soft-delete (archive){' '}
          <strong>{targets.length}</strong> project
          {targets.length === 1 ? '' : 's'}? They can be restored later.
        </span>
      ),
      variant: 'danger',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    setBulkWorking(true);
    try {
      const errors: { projectId: string; error: unknown }[] = [];
      const concurrencyLimit = 5;

      for (let i = 0; i < targets.length; i += concurrencyLimit) {
        const batch = targets.slice(i, i + concurrencyLimit);
        await Promise.all(
          batch.map(async (p) => {
            try {
              await deleteProject(selectedTenantId, p.id, opts);
            } catch (e) {
              errors.push({ projectId: p.id, error: e });
            }
          }),
        );
      }

      setSelectedIds(new Set());
      await fetchProjects();

      if (errors.length > 0) {
        const firstError = errors[0]?.error;
        const message =
          isForbiddenError(firstError)
            ? 'You do not have permission to archive one or more projects.'
            : firstError instanceof Error && firstError.message
              ? `Failed to archive ${errors.length} project${errors.length === 1 ? '' : 's'}: ${firstError.message}`
              : `Failed to archive ${errors.length} project${errors.length === 1 ? '' : 's'}.`;

        await alertDialog({
          message,
          variant: 'error',
        });
      }
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkAddTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !canWriteProjects) return;
    const raw = bulkTagInput.trim();
    if (!raw) return;
    const targets = selectedWritableProjects;
    if (targets.length === 0) {
      await alertDialog({
        message:
          'Select at least one active project. Tags are stored in project metadata.',
        variant: 'info',
      });
      return;
    }
    setBulkWorking(true);
    try {
      for (const p of targets) {
        const existing = getProjectTags(p.metadata);
        const merged = [
          ...new Set([...existing, raw].map((t) => t.trim()).filter(Boolean)),
        ].sort((a, b) => a.localeCompare(b));
        await updateProject(selectedTenantId, p.id, {
          metadata: { ...(p.metadata ?? {}), tags: merged },
        }, opts);
      }
      setBulkTagOpen(false);
      setBulkTagInput('');
      setSelectedIds(new Set());
      await fetchProjects();
    } catch (e) {
      await alertDialog({
        message:
          isForbiddenError(e)
            ? 'You do not have permission to update projects.'
            : e instanceof Error
              ? e.message
              : 'Failed to add tags',
        variant: 'error',
      });
    } finally {
      setBulkWorking(false);
    }
  };

  const handleCreateSuccess = () => {
    setCreateOpen(false);
    fetchProjects();
  };

  const handleEditSuccess = () => {
    setEditProject(null);
    fetchProjects();
  };

  const handleDelete = async (project: ProjectSchema) => {
    if (!selectedTenantId) return;
    const ok = await confirm({
      title: 'Archive project',
      message: (
        <span>
          Soft-delete (archive) <strong>{project.name}</strong> ({project.slug})?
          The project will be hidden by default and can be restored later.
        </span>
      ),
      variant: 'danger',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    setDeletingId(project.id);
    try {
      await deleteProject(selectedTenantId, project.id, opts);
      await fetchProjects();
    } catch (e) {
      await alertDialog({
        message:
          isForbiddenError(e)
            ? 'You do not have permission to delete this project.'
            : e instanceof Error
              ? e.message
              : 'Failed to delete project',
        variant: 'error',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestore = async (project: ProjectSchema) => {
    if (!selectedTenantId) return;
    const ok = await confirm({
      title: 'Restore project',
      message: (
        <span>
          Restore <strong>{project.name}</strong> ({project.slug})? The project
          will become active again.
        </span>
      ),
      variant: 'info',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    setRestoringId(project.id);
    try {
      await restoreProject(selectedTenantId, project.id, opts);
      await fetchProjects();
    } catch (e) {
      await alertDialog({
        message:
          isForbiddenError(e)
            ? 'You do not have permission to restore this project.'
            : e instanceof Error
              ? e.message
              : 'Failed to restore project',
        variant: 'error',
      });
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (project: ProjectSchema) => {
    if (!selectedTenantId) return;
    const ok = await confirm({
      title: 'Permanently delete project',
      message: (
        <span>
          Permanently delete <strong>{project.name}</strong> ({project.slug})?
          This action cannot be undone and all project data will be lost.
        </span>
      ),
      variant: 'danger',
      confirmLabel: 'Permanently Delete',
    });
    if (!ok) return;
    setPermanentDeletingId(project.id);
    try {
      await permanentDeleteProject(selectedTenantId, project.id, opts);
      await fetchProjects();
    } catch (e) {
      await alertDialog({
        message:
          isForbiddenError(e)
            ? 'You do not have permission to permanently delete this project.'
            : e instanceof Error
              ? e.message
              : 'Failed to permanently delete project',
        variant: 'error',
      });
    } finally {
      setPermanentDeletingId(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2
          className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400"
          aria-hidden
        />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-400">
          You must be signed in to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 dashboard-print-area">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 print:text-black">
            <FolderKanban className="h-6 w-6 text-indigo-500 print:text-slate-800" aria-hidden />
            Projects
          </h1>
          <div className="flex items-center gap-2 flex-wrap print:hidden">
            <label htmlFor="project-tenant-select" className="sr-only">
              Select tenant
            </label>
            <select
              id="project-tenant-select"
              value={selectedTenantId ?? ''}
              onChange={(e) => setSelectedTenantId(e.target.value || null)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select a tenant</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowDeleted((v) => !v)}
              disabled={!selectedTenantId}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
              title={showDeleted ? 'Hide deleted projects' : 'Show deleted projects'}
            >
              {showDeleted ? (
                <><EyeOff className="h-4 w-4" aria-hidden />Hide deleted</>
              ) : (
                <><Eye className="h-4 w-4" aria-hidden />Show deleted</>
              )}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={!selectedTenantId || !canWriteProjects || perms.loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
              title={
                !selectedTenantId
                  ? 'Select a tenant first'
                  : !canWriteProjects
                    ? 'You do not have permission to create projects'
                    : 'Create project'
              }
            >
              <Plus className="h-4 w-4" aria-hidden />
              New project
            </button>
          </div>
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-sm print:hidden">
          Manage projects for the selected tenant. Create projects with name,
          slug, description, and optional metadata. Tags may be stored in project
          metadata as a <code className="text-xs font-mono">tags</code> array for
          filtering and bulk actions.
        </p>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm flex items-center gap-2 print:hidden"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!selectedTenantId ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center text-slate-600 dark:text-slate-400">
          Select a tenant above to list and manage projects.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2
            className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400"
            aria-hidden
          />
        </div>
      ) : (
        <div className="dashboard-print-area space-y-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 print:hidden">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
              <div className="flex flex-1 min-w-[200px] flex-col gap-1">
                <Label.Root
                  htmlFor="project-search"
                  className="text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Search
                </Label.Root>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input
                    id="project-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Name or slug…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1 min-w-[140px]">
                <Label.Root
                  htmlFor="project-status-filter"
                  className="text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Status
                </Label.Root>
                <select
                  id="project-status-filter"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'all' | ProjectLifecycle)
                  }
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 min-w-[160px]">
                <Label.Root
                  htmlFor="project-tag-filter"
                  className="text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Tag contains
                </Label.Root>
                <input
                  id="project-tag-filter"
                  type="text"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  placeholder="Filter by tag text…"
                  list="project-tag-suggestions"
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="project-tag-suggestions">
                  {allDistinctTags.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1 min-w-[160px]">
                <Label.Root
                  htmlFor="project-owner-filter"
                  className="text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Owner
                </Label.Root>
                <select
                  id="project-owner-filter"
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All owners</option>
                  {uniqueOwnerIds.map((oid) => (
                    <option key={oid} value={oid}>
                      {ownerLabels[oid] ?? shortId(oid)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 min-w-[200px]">
                <Label.Root
                  htmlFor="project-sort"
                  className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
                  Sort
                </Label.Root>
                <div className="flex gap-2">
                  <select
                    id="project-sort"
                    value={sortField}
                    onChange={(e) =>
                      setSortField(e.target.value as SortField)
                    }
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="updated_at">Updated</option>
                    <option value="created_at">Created</option>
                    <option value="name">Name</option>
                  </select>
                  <select
                    aria-label="Sort direction"
                    value={sortDir}
                    onChange={(e) =>
                      setSortDir(e.target.value as SortDir)
                    }
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3 text-sm print:hidden">
              <span className="text-slate-700 dark:text-slate-200">
                {selectedIds.size} selected
                {selectedWritableProjects.length < selectedIds.size && (
                  <span className="text-slate-500 dark:text-slate-400">
                    {' '}
                    ({selectedWritableProjects.length} can be edited)
                  </span>
                )}
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setBulkTagOpen(true)}
                  disabled={!canWriteProjects || bulkWorking || perms.loading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <Tag className="h-4 w-4" aria-hidden />
                  Add tag…
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkArchive()}
                  disabled={!canWriteProjects || bulkWorking || perms.loading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-amber-900 dark:text-amber-100 text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-950/50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <Archive className="h-4 w-4" aria-hidden />
                  Archive
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 text-sm hover:underline"
                >
                  Clear selection
                </button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 print:border-slate-400 print:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-3 w-10 print:hidden">
                    <Checkbox.Root
                      className="flex h-4 w-4 items-center justify-center rounded border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-800 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 data-[state=checked]:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? 'indeterminate'
                            : false
                      }
                      onCheckedChange={() => toggleSelectVisible()}
                      disabled={visibleIds.length === 0}
                      aria-label="Select all visible projects"
                    >
                      <Checkbox.Indicator className="flex items-center justify-center text-white">
                        <Check className="h-3 w-3" />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                  </th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Tags</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Versions</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium text-right w-24 print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      No projects yet. Create one with the button above.
                    </td>
                  </tr>
                ) : filteredProjects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      No projects match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((project) => (
                    <tr
                      key={project.id}
                      className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-2 py-3 align-top print:hidden">
                        <Checkbox.Root
                          className="flex h-4 w-4 items-center justify-center rounded border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-800 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 data-[state=checked]:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          checked={selectedIds.has(project.id)}
                          onCheckedChange={() => toggleSelectOne(project.id)}
                          aria-label={`Select ${project.name}`}
                        >
                          <Checkbox.Indicator className="flex items-center justify-center text-white">
                            <Check className="h-3 w-3" />
                          </Checkbox.Indicator>
                        </Checkbox.Root>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {project.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                        {project.slug}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="flex flex-wrap gap-1">
                          {getProjectTags(project.metadata).length === 0 ? (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          ) : (
                            [...new Set(getProjectTags(project.metadata))].map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200"
                              >
                                {t}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {versionCountsLoading
                          ? '…'
                          : versionCounts[project.id] ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[140px] truncate" title={project.creator_id ?? ''}>
                        {project.creator_id
                          ? ownerLabels[project.creator_id] ?? shortId(project.creator_id)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-slate-600 dark:text-slate-400">
                        {project.description || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {project.deleted_at ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            Archived
                          </span>
                        ) : project.enabled === false ? (
                          <span className="text-slate-500 dark:text-slate-400">
                            Disabled
                          </span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {formatDateTime(project.created_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {project.updated_at
                          ? formatDateTime(project.updated_at)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right print:hidden">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              type="button"
                              className="p-2 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              aria-label={`Actions for ${project.name}`}
                              disabled={
                                deletingId === project.id ||
                                restoringId === project.id ||
                                permanentDeletingId === project.id ||
                                cloningId === project.id
                              }
                            >
                              {(deletingId === project.id ||
                                restoringId === project.id ||
                                permanentDeletingId === project.id ||
                                cloningId === project.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreVertical className="h-4 w-4" />
                              )}
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              className="min-w-[180px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1 z-50"
                              sideOffset={4}
                              align="end"
                            >
                              {!project.deleted_at && (
                                <DropdownMenu.Item asChild>
                                  <Link
                                    href={`/dashboard/projects/${project.id}/settings`}
                                    className="rounded-md px-3 py-2 text-sm outline-none flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800"
                                  >
                                    <Settings className="h-4 w-4 text-indigo-500" aria-hidden />
                                    Project settings
                                  </Link>
                                </DropdownMenu.Item>
                              )}
                              {!project.deleted_at && (
                                <DropdownMenu.Item
                                  onSelect={() => {
                                    if (canWriteProjects) setEditProject(project);
                                  }}
                                  disabled={!canWriteProjects}
                                  className={`rounded-md px-3 py-2 text-sm outline-none flex items-center gap-2 ${
                                    canWriteProjects
                                      ? 'text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800'
                                      : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-70'
                                  }`}
                                >
                                  <Pencil className="h-4 w-4 text-indigo-500" />
                                  Edit project
                                </DropdownMenu.Item>
                              )}
                              {!project.deleted_at && (
                                <DropdownMenu.Item
                                  onSelect={() => {
                                    if (canWriteProjects) setCloneSource(project);
                                  }}
                                  disabled={!canWriteProjects}
                                  className={`rounded-md px-3 py-2 text-sm outline-none flex items-center gap-2 ${
                                    canWriteProjects
                                      ? 'text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800'
                                      : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-70'
                                  }`}
                                >
                                  <Copy className="h-4 w-4 text-indigo-500" aria-hidden />
                                  Duplicate project
                                </DropdownMenu.Item>
                              )}
                              {!project.deleted_at && (
                                <DropdownMenu.Item
                                  onSelect={() => {
                                    if (canWriteProjects) void handleDelete(project);
                                  }}
                                  disabled={!canWriteProjects}
                                  className={`rounded-md px-3 py-2 text-sm outline-none flex items-center gap-2 ${
                                    canWriteProjects
                                      ? 'text-red-700 dark:text-red-300 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20'
                                      : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-70'
                                  }`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Archive project
                                </DropdownMenu.Item>
                              )}
                              {project.deleted_at && (
                                <>
                                  <DropdownMenu.Item
                                    onSelect={() => {
                                      if (canWriteProjects) void handleRestore(project);
                                    }}
                                    disabled={!canWriteProjects}
                                    className={`rounded-md px-3 py-2 text-sm outline-none flex items-center gap-2 ${
                                      canWriteProjects
                                        ? 'text-green-700 dark:text-green-300 cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 focus:bg-green-50 dark:focus:bg-green-900/20'
                                        : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-70'
                                    }`}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                    Restore project
                                  </DropdownMenu.Item>
                                  <DropdownMenu.Separator className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                                  <DropdownMenu.Item
                                    onSelect={() => {
                                      if (canWriteProjects) void handlePermanentDelete(project);
                                    }}
                                    disabled={!canWriteProjects}
                                    className={`rounded-md px-3 py-2 text-sm outline-none flex items-center gap-2 ${
                                      canWriteProjects
                                        ? 'text-red-700 dark:text-red-300 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20'
                                        : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-70'
                                    }`}
                                  >
                                    <Flame className="h-4 w-4" />
                                    Permanently delete
                                  </DropdownMenu.Item>
                                </>
                              )}
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      <Dialog.Root
        open={bulkTagOpen}
        onOpenChange={(open) => {
          setBulkTagOpen(open);
          if (!open) setBulkTagInput('');
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6"
            aria-describedby={undefined}
            onEscapeKeyDown={() => setBulkTagOpen(false)}
            onPointerDownOutside={() => setBulkTagOpen(false)}
          >
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
              <Tag className="h-5 w-5 text-indigo-500" aria-hidden />
              Add tag to selected projects
            </Dialog.Title>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Appends the tag to the <code className="text-xs font-mono">tags</code> array in
              each project&apos;s metadata (active projects only).
            </p>
            <form onSubmit={handleBulkAddTagSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label.Root htmlFor="bulk-tag-name" className={labelClass}>
                  Tag name
                </Label.Root>
                <input
                  id="bulk-tag-name"
                  type="text"
                  value={bulkTagInput}
                  onChange={(e) => setBulkTagInput(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. production"
                  disabled={bulkWorking}
                  autoComplete="off"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBulkTagOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 transition-colors"
                  disabled={bulkWorking}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkWorking || !bulkTagInput.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
                >
                  {bulkWorking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Applying…
                    </>
                  ) : (
                    'Add tag'
                  )}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {selectedTenantId && (
        <CreateProjectDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={handleCreateSuccess}
          tenantId={selectedTenantId}
          session={session}
        />
      )}
      {editProject && selectedTenantId && (
        <EditProjectDialog
          project={editProject}
          open={!!editProject}
          onOpenChange={(open) => !open && setEditProject(null)}
          onSuccess={handleEditSuccess}
          tenantId={selectedTenantId}
          session={session}
        />
      )}
      {cloneSource && selectedTenantId && (
        <CloneProjectDialog
          source={cloneSource}
          open={!!cloneSource}
          onOpenChange={(open) => !open && setCloneSource(null)}
          tenantId={selectedTenantId}
          session={session}
          cloningId={cloningId}
          setCloningId={setCloningId}
          onSuccess={(newProjectId) => {
            setCloneSource(null);
            void fetchProjects();
            router.push(`/dashboard/projects/${newProjectId}/settings`);
          }}
        />
      )}
    </div>
  );
}

interface CloneProjectDialogProps {
  source: ProjectSchema;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  session: ReturnType<typeof useSession>['data'];
  cloningId: string | null;
  setCloningId: (id: string | null) => void;
  onSuccess: (newProjectId: string) => void;
}

function CloneProjectDialog({
  source,
  open,
  onOpenChange,
  tenantId,
  session,
  cloningId,
  setCloningId,
  onSuccess,
}: CloneProjectDialogProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [copyLatest, setCopyLatest] = useState(true);
  const [versionName, setVersionName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextName = `${source.name} (copy)`;
    setName(nextName);
    setSlug(nameToSlug(nextName));
    setDescription(source.description ?? '');
    setCopyLatest(true);
    setVersionName('');
    setFormError(null);
  }, [open, source]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormError(null);
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    if (!trimmedName) {
      setFormError('Name is required.');
      return;
    }
    const err = slugError(trimmedSlug);
    if (err) {
      setFormError(err);
      return;
    }
    setCloningId(source.id);
    try {
      const result = await cloneProject(
        tenantId,
        source.id,
        {
          name: trimmedName,
          slug: trimmedSlug,
          description: description.trim() || undefined,
          copy_latest_version: copyLatest,
          cloned_version_name: versionName.trim() || undefined,
        },
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      onOpenChange(false);
      onSuccess(result.project.id);
    } catch (err) {
      setFormError(
        isForbiddenError(err)
          ? 'You do not have permission to duplicate this project.'
          : err instanceof Error
            ? err.message
            : 'Failed to duplicate project'
      );
    } finally {
      setCloningId(null);
    }
  };

  const busy = cloningId === source.id;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6"
          aria-describedby={undefined}
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Copy className="h-5 w-5 text-indigo-500" aria-hidden />
            Duplicate project
          </Dialog.Title>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Create a new project with a unique slug. You can optionally copy the latest
            version&apos;s schema (classes, properties, and canvas) into the new project.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
                role="alert"
              >
                {formError}
              </div>
            )}
            <div className="space-y-2">
              <Label.Root htmlFor="clone-project-name" className={labelClass}>
                New project name *
              </Label.Root>
              <input
                id="clone-project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                disabled={busy}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label.Root htmlFor="clone-project-slug" className={labelClass}>
                New slug *
              </Label.Root>
              <input
                id="clone-project-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className={`${inputClass} font-mono`}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label.Root htmlFor="clone-project-description" className={labelClass}>
                Description (optional)
              </Label.Root>
              <textarea
                id="clone-project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
                rows={2}
                disabled={busy}
              />
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-600 p-3">
              <Checkbox.Root
                id="clone-copy-version"
                checked={copyLatest}
                onCheckedChange={(v) => setCopyLatest(v === true)}
                disabled={busy}
                className="mt-0.5 flex h-4 w-4 items-center justify-center rounded border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-800 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 data-[state=checked]:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <Checkbox.Indicator className="flex items-center justify-center text-white">
                  <Check className="h-3 w-3" />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <div>
                <Label.Root htmlFor="clone-copy-version" className={labelClass}>
                  Copy latest version schema
                </Label.Root>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Duplicates classes, properties, and canvas from the newest version. If the
                  project has no versions, only the project shell is created.
                </p>
              </div>
            </div>
            {copyLatest && (
              <div className="space-y-2">
                <Label.Root htmlFor="clone-version-name" className={labelClass}>
                  Name for copied version (optional)
                </Label.Root>
                <input
                  id="clone-version-name"
                  type="text"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  className={inputClass}
                  placeholder="Defaults to source name with (copy)"
                  disabled={busy}
                  autoComplete="off"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 transition-colors"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Duplicating…
                  </>
                ) : (
                  'Duplicate'
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  tenantId: string;
  session: ReturnType<typeof useSession>['data'];
}

function CreateProjectDialog({
  open,
  onOpenChange,
  onSuccess,
  tenantId,
  session,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [metadataJson, setMetadataJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setSlug('');
    setDescription('');
    setMetadataJson('');
    setFormError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormError(null);
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    const trimmedDescription = description.trim();
    if (!trimmedName) {
      setFormError('Name is required.');
      return;
    }
    const err = slugError(trimmedSlug);
    if (err) {
      setFormError(err);
      return;
    }
    let metadata: Record<string, unknown> | undefined;
    if (metadataJson.trim()) {
      try {
        metadata = JSON.parse(metadataJson.trim()) as Record<string, unknown>;
      } catch {
        setFormError('Metadata must be valid JSON.');
        return;
      }
    }
    setSaving(true);
    try {
      const body: ProjectCreate = {
        name: trimmedName,
        slug: trimmedSlug,
        description: trimmedDescription || undefined,
        metadata,
      };
      await createProject(tenantId, body, getRestClientOptions((session as { accessToken?: string } | null) ?? null));
      handleOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to create project'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6"
          aria-describedby={undefined}
          onEscapeKeyDown={() => handleOpenChange(false)}
          onPointerDownOutside={() => handleOpenChange(false)}
        >
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-indigo-500" aria-hidden />
            Create project
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
                role="alert"
              >
                {formError}
              </div>
            )}
            <div className="space-y-2">
              <Label.Root htmlFor="create-project-name" className={labelClass}>
                Name *
              </Label.Root>
              <input
                id="create-project-name"
                type="text"
                value={name}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setName(nextName);
                  setSlug(nameToSlug(nextName));
                }}
                className={inputClass}
                placeholder="My API"
                disabled={saving}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label.Root htmlFor="create-project-slug" className={labelClass}>
                Slug *
              </Label.Root>
              <input
                id="create-project-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className={`${inputClass} font-mono`}
                placeholder="my-api"
                disabled={saving}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lowercase letters, numbers, and hyphens only.
              </p>
            </div>
            <div className="space-y-2">
              <Label.Root htmlFor="create-project-description" className={labelClass}>
                Description (optional)
              </Label.Root>
              <textarea
                id="create-project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
                placeholder="Brief description"
                rows={2}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label.Root htmlFor="create-project-metadata" className={labelClass}>
                Metadata (optional JSON)
              </Label.Root>
              <textarea
                id="create-project-metadata"
                value={metadataJson}
                onChange={(e) => setMetadataJson(e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder='{"summary": "API summary", "contact": {"name": "Team"}}'
                rows={3}
                disabled={saving}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Creating…
                  </>
                ) : (
                  'Create project'
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface EditProjectDialogProps {
  project: ProjectSchema;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  tenantId: string;
  session: ReturnType<typeof useSession>['data'];
}

function EditProjectDialog({
  project,
  open,
  onOpenChange,
  onSuccess,
  tenantId,
  session,
}: EditProjectDialogProps) {
  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [description, setDescription] = useState(project.description ?? '');
  const [enabled, setEnabled] = useState(project.enabled !== false);
  const [metadataJson, setMetadataJson] = useState(
    project.metadata
      ? JSON.stringify(project.metadata, null, 2)
      : ''
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setName(project.name);
    setSlug(project.slug);
    setDescription(project.description ?? '');
    setEnabled(project.enabled !== false);
    setMetadataJson(
      project.metadata ? JSON.stringify(project.metadata, null, 2) : ''
    );
    setFormError(null);
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormError(null);
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();
    const trimmedDescription = description.trim();
    if (!trimmedName) {
      setFormError('Name is required.');
      return;
    }
    const err = slugError(trimmedSlug);
    if (err) {
      setFormError(err);
      return;
    }
    let metadata: Record<string, unknown> | null = null;
    if (metadataJson.trim()) {
      try {
        metadata = JSON.parse(metadataJson.trim()) as Record<string, unknown>;
      } catch {
        setFormError('Metadata must be valid JSON.');
        return;
      }
    }
    setSaving(true);
    try {
      const body: ProjectUpdate = {
        name: trimmedName,
        slug: trimmedSlug,
        description: trimmedDescription || null,
        enabled,
        metadata,
      };
      await updateProject(
        tenantId,
        project.id,
        body,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        isForbiddenError(err)
          ? 'You do not have permission to update this project.'
          : err instanceof Error
            ? err.message
            : 'Failed to update project'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6"
          aria-describedby={undefined}
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-indigo-500" aria-hidden />
            Edit project
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
                role="alert"
              >
                {formError}
              </div>
            )}
            <div className="space-y-2">
              <Label.Root htmlFor="edit-project-name" className={labelClass}>
                Name *
              </Label.Root>
              <input
                id="edit-project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label.Root htmlFor="edit-project-slug" className={labelClass}>
                Slug *
              </Label.Root>
              <input
                id="edit-project-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className={`${inputClass} font-mono`}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label.Root htmlFor="edit-project-description" className={labelClass}>
                Description (optional)
              </Label.Root>
              <textarea
                id="edit-project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
                rows={2}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  disabled={saving}
                  className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                />
                <span className={labelClass}>Enabled</span>
              </label>
            </div>
            <div className="space-y-2">
              <Label.Root htmlFor="edit-project-metadata" className={labelClass}>
                Metadata (optional JSON)
              </Label.Root>
              <textarea
                id="edit-project-metadata"
                value={metadataJson}
                onChange={(e) => setMetadataJson(e.target.value)}
                className={`${inputClass} font-mono`}
                rows={3}
                disabled={saving}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
