'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  FolderKanban,
  User,
} from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import {
  getProject,
  getUser,
  getRestClientOptions,
  updateProject,
  isForbiddenError,
  type ProjectSchema,
  type ProjectUpdate,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';
import { useTenantPermissions } from '@/app/hooks/useTenantPermissions';
import { useTenantSelection } from '@/app/contexts/TenantSelectionContext';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function tagsToString(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return '';
  const raw = metadata.tags;
  if (Array.isArray(raw)) {
    return raw
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter(Boolean)
      .join(', ');
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return '';
}

function parseTagsInput(s: string): string[] {
  return [
    ...new Set(
      s
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export default function ProjectSettingsPageClient() {
  const params = useParams();
  const projectId = typeof params.projectId === 'string' ? params.projectId : '';
  const { data: session, status } = useSession();
  const { alert: alertDialog } = useDialog();
  const { tenants, selectedTenantId, setSelectedTenantId } = useTenantSelection();

  const [project, setProject] = useState<ProjectSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [tagsInput, setTagsInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !selectedTenantId || !projectId) {
      setLoading(false);
      setProject(null);
      return;
    }
    if (perms.loading) {
      setProject(null);
      setError(null);
      return;
    }
    if (!canReadProjects) {
      setLoading(false);
      setError('You do not have permission to view this project.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await getProject(selectedTenantId, projectId, opts);
      setProject(p);
      setName(p.name);
      setSlug(p.slug);
      setDescription(p.description ?? '');
      setEnabled(p.enabled !== false);
      setTagsInput(tagsToString(p.metadata));
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view this project.'
          : e instanceof Error
            ? e.message
            : 'Failed to load project'
      );
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [status, selectedTenantId, projectId, opts, canReadProjects, perms.loading]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!project?.creator_id || status !== 'authenticated') {
      setOwnerLabel(null);
      return;
    }
    let cancelled = false;
    void getUser(project.creator_id, opts).then(
      (u) => {
        if (!cancelled) {
          const label =
            u.name?.trim() || u.email || project.creator_id || null;
          setOwnerLabel(label);
        }
      },
      () => {
        if (!cancelled) setOwnerLabel(project.creator_id ?? null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [project?.creator_id, status, opts, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !selectedTenantId || !projectId) return;
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
    const tagList = parseTagsInput(tagsInput);
    const baseMeta = { ...(project?.metadata ?? {}) };
    if (tagList.length > 0) {
      baseMeta.tags = tagList;
    } else {
      delete baseMeta.tags;
    }

    setSaving(true);
    try {
      const body: ProjectUpdate = {
        name: trimmedName,
        slug: trimmedSlug,
        description: description.trim() || null,
        enabled,
        metadata: baseMeta,
      };
      const updated = await updateProject(selectedTenantId, projectId, body, opts);
      setProject(updated);
      setTagsInput(tagsToString(updated.metadata));
    } catch (err) {
      await alertDialog({
        message:
          isForbiddenError(err)
            ? 'You do not have permission to update this project.'
            : err instanceof Error
              ? err.message
              : 'Failed to save settings',
        variant: 'error',
      });
    } finally {
      setSaving(false);
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
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-4"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to projects
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-indigo-500" aria-hidden />
            Project settings
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor="settings-tenant-select" className="sr-only">
              Select tenant
            </label>
            <select
              id="settings-tenant-select"
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
          </div>
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-2">
          Edit project metadata, tags, and ownership context. The owner field reflects the
          project creator and cannot be changed here.
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
          Select a tenant to load project settings.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2
            className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400"
            aria-hidden
          />
        </div>
      ) : !project ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center text-slate-600 dark:text-slate-400">
          Project not found or unavailable.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {formError && (
            <div
              className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              General
            </h2>
            <div className="space-y-2">
              <Label.Root htmlFor="settings-name" className={labelClass}>
                Name *
              </Label.Root>
              <input
                id="settings-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                disabled={saving || !canWriteProjects}
              />
            </div>
            <div className="space-y-2">
              <Label.Root htmlFor="settings-slug" className={labelClass}>
                Slug *
              </Label.Root>
              <input
                id="settings-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className={`${inputClass} font-mono`}
                disabled={saving || !canWriteProjects}
              />
            </div>
            <div className="space-y-2">
              <Label.Root htmlFor="settings-description" className={labelClass}>
                Description
              </Label.Root>
              <textarea
                id="settings-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
                rows={3}
                disabled={saving || !canWriteProjects}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={saving || !canWriteProjects}
                className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span className={labelClass}>Enabled</span>
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Tags
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Stored in project metadata as a <code className="font-mono">tags</code> array.
              Separate multiple tags with commas.
            </p>
            <div className="space-y-2">
              <Label.Root htmlFor="settings-tags" className={labelClass}>
                Tags
              </Label.Root>
              <input
                id="settings-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className={inputClass}
                placeholder="e.g. production, api"
                disabled={saving || !canWriteProjects}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" aria-hidden />
              Owner
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {project.creator_id ? (
                <>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-500 block break-all">
                    {project.creator_id}
                  </span>
                  <span className="mt-1 block">
                    {ownerLabel ?? '…'}
                  </span>
                </>
              ) : (
                '—'
              )}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={saving || !canWriteProjects || perms.loading}
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
      )}
    </div>
  );
}
