'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
  Loader2,
  Plus,
  FolderKanban,
  Pencil,
  Trash2,
  MoreVertical,
  AlertTriangle,
} from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Dialog from '@radix-ui/react-dialog';
import {
  listMyTenants,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  getRestClientOptions,
  isForbiddenError,
  type TenantSchema,
  type ProjectSchema,
  type ProjectCreate,
  type ProjectUpdate,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';

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

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const { confirm, alert: alertDialog } = useDialog();
  const [tenants, setTenants] = useState<TenantSchema[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectSchema | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dropdownProjectId, setDropdownProjectId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const opts = getRestClientOptions(
    (session as { accessToken?: string } | null) ?? null
  );

  const fetchTenants = useCallback(async () => {
    if (status !== 'authenticated' || !session) return;
    try {
      const data = await listMyTenants(opts);
      setTenants(data);
      if (data.length > 0 && !selectedTenantId) {
        setSelectedTenantId(data[0].id);
      }
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view tenants.'
          : e instanceof Error
            ? e.message
            : 'Failed to load tenants'
      );
    }
  }, [status, session, selectedTenantId]);

  const fetchProjects = useCallback(async () => {
    if (status !== 'authenticated' || !selectedTenantId) {
      setLoading(false);
      setProjects([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listProjects(selectedTenantId, opts, true);
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
  }, [status, selectedTenantId, session]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    fetchTenants();
  }, [status, fetchTenants]);

  useEffect(() => {
    if (status !== 'authenticated' || !selectedTenantId) return;
    fetchProjects();
  }, [status, selectedTenantId, fetchProjects]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownProjectId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      title: 'Delete project',
      message: (
        <span>
          Soft-delete <strong>{project.name}</strong> ({project.slug})? The
          project will be hidden by default and can be restored later.
        </span>
      ),
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDropdownProjectId(null);
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
    <div className="p-6">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-indigo-500" aria-hidden />
            Projects
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
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
              onClick={() => setCreateOpen(true)}
              disabled={!selectedTenantId}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
              title={!selectedTenantId ? 'Select a tenant first' : 'Create project'}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New project
            </button>
          </div>
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Manage projects for the selected tenant. Create projects with name,
          slug, description, and optional metadata.
        </p>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm flex items-center gap-2"
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
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      No projects yet. Create one with the button above.
                    </td>
                  </tr>
                ) : (
                  projects.map((project) => (
                    <tr
                      key={project.id}
                      className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {project.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                        {project.slug}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-slate-600 dark:text-slate-400">
                        {project.description || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {project.deleted_at ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            Deleted
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
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-block" ref={dropdownProjectId === project.id ? dropdownRef : undefined}>
                          <button
                            type="button"
                            onClick={() =>
                              setDropdownProjectId(
                                dropdownProjectId === project.id ? null : project.id
                              )
                            }
                            className="p-2 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            aria-label={`Actions for ${project.name}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {dropdownProjectId === project.id && (
                            <div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10">
                              <button
                                type="button"
                                onClick={() => {
                                  setDropdownProjectId(null);
                                  setEditProject(project);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                              >
                                <Pencil className="h-4 w-4 text-indigo-500" />
                                Edit project
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(project)}
                                disabled={!!project.deleted_at || deletingId === project.id}
                                className="w-full px-4 py-2 text-left text-sm text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50"
                              >
                                {deletingId === project.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                Delete project
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
    </div>
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
