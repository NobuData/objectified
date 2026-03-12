'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  listMyTenants,
  listProjects,
  listVersions,
  createVersion,
  updateVersion,
  deleteVersion,
  getRestClientOptions,
  isForbiddenError,
  type TenantSchema,
  type ProjectSchema,
  type VersionSchema,
  type VersionCreate,
  type VersionMetadataUpdate,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';
import VersionDiffDialog from '@/app/dashboard/components/VersionDiffDialog';
import RelationshipGraphDialog from '@/app/dashboard/components/RelationshipGraphDialog';

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

export default function VersionsPage() {
  const { data: session, status } = useSession();
  const { confirm, alert: alertDialog } = useDialog();
  const [tenants, setTenants] = useState<TenantSchema[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSchema[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionSchema[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editVersion, setEditVersion] = useState<VersionSchema | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [diffDialogVersion, setDiffDialogVersion] = useState<VersionSchema | null>(null);
  const [graphDialogVersion, setGraphDialogVersion] = useState<VersionSchema | null>(null);

  // Create form
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createChangeLog, setCreateChangeLog] = useState('');
  const [createSourceVersionId, setCreateSourceVersionId] = useState<string>('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit form
  const [editDescription, setEditDescription] = useState('');
  const [editChangeLog, setEditChangeLog] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const opts = useMemo(
    () =>
      getRestClientOptions(
        (session as { accessToken?: string } | null) ?? null
      ),
    [(session as { accessToken?: string } | null)?.accessToken]
  );

  const fetchTenants = useCallback(async () => {
    if (status !== 'authenticated' || !session) return;
    setError(null);
    setTenantsLoading(true);
    try {
      const data = await listMyTenants(opts);
      setTenants(data);
      setSelectedTenantId((prev) => {
        if (prev) return prev;
        return data.length > 0 ? data[0].id : null;
      });
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view tenants.'
          : e instanceof Error
            ? e.message
            : 'Failed to load tenants'
      );
    } finally {
      setTenantsLoading(false);
    }
  }, [status, session, opts]);

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

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

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

  const handleCreateOpen = () => {
    setCreateName('');
    setCreateDescription('');
    setCreateChangeLog('');
    setCreateSourceVersionId('');
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreateSubmit = async () => {
    if (!selectedTenantId || !selectedProjectId) return;
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
      const body: VersionCreate = {
        name,
        description: createDescription.trim(),
        change_log: createChangeLog.trim() || undefined,
        source_version_id: createSourceVersionId || undefined,
      };
      await createVersion(selectedTenantId, selectedProjectId, body, opts);
      setCreateOpen(false);
      await fetchVersions();
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
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center">
            <GitBranch className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Versions
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage specification versions by project
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
            disabled={!selectedProjectId}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Plus className="h-4 w-4" />
            New Version
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Version
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {versions.map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                          {v.name}
                        </span>
                        {v.published && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                            title="Published"
                          >
                            <Lock className="h-3 w-3" />
                            Published
                          </span>
                        )}
                      </div>
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
                      <div className="flex items-center gap-2">
                        {v.published ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Published
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
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {formatDateTime(v.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
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
                            className="min-w-[160px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-50 py-1"
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
                              onSelect={() => setDiffDialogVersion(v)}
                            >
                              <GitCompare className="h-4 w-4" />
                              View diff
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[disabled]:opacity-50"
                              onSelect={() => setGraphDialogVersion(v)}
                            >
                              <Network className="h-4 w-4" />
                              Relationship graph
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
        </div>
      )}

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
                      {ver.published ? '🔒 ' : ''}
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
                disabled={createSubmitting}
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
    </div>
  );
}
