'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Loader2, Plus, Pencil, Building2, Trash2, Users, ShieldCheck } from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Dialog from '@radix-ui/react-dialog';
import {
  listMyTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  getRestClientOptions,
  type TenantSchema,
  type TenantCreate,
  type TenantUpdate,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Derive a URL-safe slug from a display name: lowercase, hyphens for separators, only [a-z0-9-]. */
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
    return 'Slug must contain only lowercase letters, numbers, and single hyphens (e.g. my-tenant).';
  }
  return null;
}

export default function TenantsPage() {
  const { data: session, status } = useSession();
  const { confirm } = useDialog();
  const [tenants, setTenants] = useState<TenantSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<TenantSchema | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    if (status !== 'authenticated' || !session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listMyTenants(
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      setTenants(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tenants');
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [status, session]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    fetchTenants();
  }, [status, fetchTenants]);

  const handleCreateSuccess = () => {
    setCreateOpen(false);
    fetchTenants();
  };

  const handleEditSuccess = () => {
    setEditTenant(null);
    fetchTenants();
  };

  const handleDelete = async (tenant: TenantSchema) => {
    const ok = await confirm({
      title: 'Deactivate tenant',
      message: (
        <span>
          Deactivate <strong>{tenant.name}</strong> ({tenant.slug})? The
          tenant will be soft-deleted and disabled.
        </span>
      ),
      variant: 'danger',
      confirmLabel: 'Deactivate',
    });
    if (!ok) return;
    setDeletingId(tenant.id);
    try {
      await deleteTenant(
        tenant.id,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      await fetchTenants();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deactivate tenant');
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Tenants
        </h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Create tenant
        </button>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
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
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      You are not a member of any tenants yet.
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {tenant.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                        {tenant.slug}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-slate-600 dark:text-slate-400">
                        {tenant.description || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {tenant.deleted_at ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            Deactivated
                          </span>
                        ) : tenant.enabled === false ? (
                          <span className="text-slate-500 dark:text-slate-400">
                            Disabled
                          </span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-2">
                          <Link
                            href={`/dashboard/tenants/${tenant.id}/members`}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                            aria-label={`View members of ${tenant.name}`}
                          >
                            <Users className="h-4 w-4" />
                            Members
                          </Link>
                          <Link
                            href={`/dashboard/tenants/${tenant.id}/administrators`}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                            aria-label={`View administrators of ${tenant.name}`}
                          >
                            <ShieldCheck className="h-4 w-4" />
                            Administrators
                          </Link>
                          {!tenant.deleted_at && (
                            <span className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditTenant(tenant)}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                aria-label={`Edit ${tenant.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(tenant)}
                                disabled={deletingId === tenant.id}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                                aria-label={`Deactivate ${tenant.name}`}
                              >
                                {deletingId === tenant.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                Deactivate
                              </button>
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateTenantDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
        session={session}
      />
      {editTenant && (
        <EditTenantDialog
          tenant={editTenant}
          open={!!editTenant}
          onOpenChange={(open) => !open && setEditTenant(null)}
          onSuccess={handleEditSuccess}
          session={session}
        />
      )}
    </div>
  );
}

interface CreateTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  session: ReturnType<typeof useSession>['data'];
}

function CreateTenantDialog({
  open,
  onOpenChange,
  onSuccess,
  session,
}: CreateTenantDialogProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setSlug('');
    setDescription('');
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
    setSaving(true);
    try {
      const body: TenantCreate = {
        name: trimmedName,
        slug: trimmedSlug,
        description: trimmedDescription || undefined,
      };
      await createTenant(
        body,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      handleOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to create tenant'
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
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6"
          aria-describedby={undefined}
          onEscapeKeyDown={() => handleOpenChange(false)}
          onPointerDownOutside={() => handleOpenChange(false)}
        >
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-500" aria-hidden />
            Create tenant
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
              <Label.Root
                htmlFor="create-tenant-name"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Name
              </Label.Root>
              <input
                id="create-tenant-name"
                type="text"
                value={name}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setName(nextName);
                  setSlug(nameToSlug(nextName));
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Acme Corp"
                disabled={saving}
                autoComplete="organization"
              />
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="create-tenant-slug"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Slug
              </Label.Root>
              <input
                id="create-tenant-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="acme-corp"
                disabled={saving}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lowercase letters, numbers, and hyphens only (e.g. my-tenant).
              </p>
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="create-tenant-description"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Description (optional)
              </Label.Root>
              <textarea
                id="create-tenant-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Brief description"
                rows={2}
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
                  'Create tenant'
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface EditTenantDialogProps {
  tenant: TenantSchema;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  session: ReturnType<typeof useSession>['data'];
}

function EditTenantDialog({
  tenant,
  open,
  onOpenChange,
  onSuccess,
  session,
}: EditTenantDialogProps) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [description, setDescription] = useState(tenant.description ?? '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setName(tenant.name);
    setSlug(tenant.slug);
    setDescription(tenant.description ?? '');
    setFormError(null);
  }, [tenant]);

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
    setSaving(true);
    try {
      const body: TenantUpdate = {
        name: trimmedName,
        slug: trimmedSlug,
        description: trimmedDescription || null,
      };
      await updateTenant(
        tenant.id,
        body,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update tenant'
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
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6"
          aria-describedby={undefined}
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-500" aria-hidden />
            Edit tenant
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
              <Label.Root
                htmlFor="edit-tenant-name"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Name
              </Label.Root>
              <input
                id="edit-tenant-name"
                type="text"
                value={name}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setName(nextName);
                  setSlug(nameToSlug(nextName));
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={saving}
                autoComplete="organization"
              />
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="edit-tenant-slug"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Slug
              </Label.Root>
              <input
                id="edit-tenant-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={saving}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lowercase letters, numbers, and hyphens only.
              </p>
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="edit-tenant-description"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Description (optional)
              </Label.Root>
              <textarea
                id="edit-tenant-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                rows={2}
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
