'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Loader2,
  Upload,
  Lock,
  LockOpen,
  CheckCircle,
  MoreVertical,
} from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  listMyTenants,
  listProjects,
  listVersions,
  publishVersion,
  unpublishVersion,
  getRestClientOptions,
  isForbiddenError,
  type TenantSchema,
  type ProjectSchema,
  type VersionSchema,
  type VersionPublishRequest,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';

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

function getVisibilityLabel(visibility: string | null | undefined): string {
  if (visibility === 'public') return 'Public';
  if (visibility === 'private') return 'Private';
  return '—';
}

export default function PublishPage() {
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

  const [publishVersionRow, setPublishVersionRow] = useState<VersionSchema | null>(null);
  const [publishVisibility, setPublishVisibility] = useState<'private' | 'public'>('private');
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);

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

  const handlePublishOpen = (v: VersionSchema) => {
    if (v.published) return;
    setPublishVersionRow(v);
    setPublishVisibility('private');
    setPublishError(null);
  };

  const handlePublishSubmit = async () => {
    if (!publishVersionRow) return;
    setPublishSubmitting(true);
    setPublishError(null);
    try {
      const body: VersionPublishRequest = { visibility: publishVisibility };
      await publishVersion(publishVersionRow.id, body, opts);
      setPublishVersionRow(null);
      await fetchVersions();
      await alertDialog({
        message: `Version "${publishVersionRow.name}" published with ${publishVisibility} visibility.`,
        variant: 'success',
      });
    } catch (e) {
      setPublishError(
        e instanceof Error ? e.message : 'Failed to publish version.'
      );
    } finally {
      setPublishSubmitting(false);
    }
  };

  const handleUnpublish = async (v: VersionSchema) => {
    if (!v.published) return;
    const ok = await confirm({
      title: 'Unpublish Version',
      message: `Unpublish "${v.name}"? The version will become editable again.`,
      variant: 'warning',
      confirmLabel: 'Unpublish',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setUnpublishingId(v.id);
    try {
      await unpublishVersion(v.id, opts);
      await fetchVersions();
      await alertDialog({
        message: `Version "${v.name}" unpublished.`,
        variant: 'success',
      });
    } catch (e) {
      await alertDialog({
        message: e instanceof Error ? e.message : 'Failed to unpublish version.',
        variant: 'error',
      });
    } finally {
      setUnpublishingId(null);
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
          Publish
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Select a tenant to publish or unpublish versions. You need access to at
          least one tenant.
        </p>
      </div>
    );
  }

  if (projects.length === 0 && selectedTenantId && !loading && !error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Publish
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
            <Upload className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Publish
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Publish or unpublish specification versions
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
          <Upload className="h-12 w-12 mx-auto text-slate-400 dark:text-slate-500 mb-3" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">
            No versions yet
          </p>
          <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">
            Create versions from the Versions page, then publish them here.
          </p>
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
                    Visibility
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Published at
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
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {v.published ? getVisibilityLabel(v.visibility) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {v.published_at
                        ? formatDateTime(v.published_at)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            aria-label="Publish actions"
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
                            {!v.published && (
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                                onSelect={() => handlePublishOpen(v)}
                              >
                                <Upload className="h-4 w-4" />
                                Publish
                              </DropdownMenu.Item>
                            )}
                            {v.published && (
                              <DropdownMenu.Item
                                className="flex items-center gap-2 px-3 py-2 text-sm text-amber-600 dark:text-amber-400 outline-none cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:hover:bg-transparent data-[disabled]:dark:hover:bg-transparent"
                                onSelect={() => handleUnpublish(v)}
                                disabled={unpublishingId === v.id}
                              >
                                {unpublishingId === v.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <LockOpen className="h-4 w-4" />
                                )}
                                Unpublish
                              </DropdownMenu.Item>
                            )}
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

      {/* Publish dialog */}
      <Dialog.Root
        open={!!publishVersionRow}
        onOpenChange={(open) =>
          !open && !publishSubmitting && setPublishVersionRow(null)
        }
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
            onEscapeKeyDown={(event) => {
              if (publishSubmitting) {
                event.preventDefault();
                return;
              }
              setPublishVersionRow(null);
            }}
            onPointerDownOutside={(event) => {
              if (publishSubmitting) {
                event.preventDefault();
                return;
              }
              setPublishVersionRow(null);
            }}
          >
            <div className="p-6 pb-2">
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Publish Version
              </Dialog.Title>
              {publishVersionRow && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  {publishVersionRow.name}
                </p>
              )}
            </div>
            <div className="px-6 py-2 flex-1 overflow-auto space-y-4">
              {publishError && (
                <div
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
                  role="alert"
                >
                  {publishError}
                </div>
              )}
              <div>
                <Label.Root htmlFor="publish-visibility" className={labelClass}>
                  Visibility
                </Label.Root>
                <select
                  id="publish-visibility"
                  value={publishVisibility}
                  onChange={(e) =>
                    setPublishVisibility(
                      e.target.value === 'public' ? 'public' : 'private'
                    )
                  }
                  className={inputClass}
                  disabled={publishSubmitting}
                  aria-describedby="publish-visibility-desc"
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
                <p
                  id="publish-visibility-desc"
                  className="text-xs text-slate-500 dark:text-slate-400 mt-1"
                >
                  {publishVisibility === 'private'
                    ? 'Only you and users with access can pull this version.'
                    : 'Anyone can discover and pull this version.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setPublishVersionRow(null)}
                disabled={publishSubmitting}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublishSubmit}
                disabled={publishSubmitting}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {publishSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Publish
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
