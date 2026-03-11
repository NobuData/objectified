'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2, Plus, Pencil, UserX } from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  getRestClientOptions,
  type AccountSchema,
  type AccountCreate,
  type AccountUpdate,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';

type SessionUser = { is_administrator?: boolean };

export default function UsersPage() {
  const { data: session, status } = useSession();
  const { confirm } = useDialog();
  const [users, setUsers] = useState<AccountSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AccountSchema | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const isAdministrator = Boolean(
    (session?.user as SessionUser | undefined)?.is_administrator
  );

  const fetchUsers = useCallback(async () => {
    if (status !== 'authenticated' || !isAdministrator) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await listUsers(
        getRestClientOptions((session as { accessToken?: string } | null) ?? null),
        includeDeleted
      );
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [status, session, isAdministrator, includeDeleted]);

  useEffect(() => {
    if (status === 'loading') return;
    if (!isAdministrator) {
      setLoading(false);
      return;
    }
    fetchUsers();
  }, [status, isAdministrator, fetchUsers]);

  const handleCreateSuccess = () => {
    setCreateOpen(false);
    fetchUsers();
  };

  const handleEditSuccess = () => {
    setEditUser(null);
    fetchUsers();
  };

  const handleDeactivate = async (user: AccountSchema) => {
    const ok = await confirm({
      title: 'Deactivate user',
      message: (
        <span>
          Deactivate <strong>{user.name}</strong> ({user.email})? They will no
          longer be able to sign in.
        </span>
      ),
      variant: 'danger',
      confirmLabel: 'Deactivate',
    });
    if (!ok) return;
    setDeactivatingId(user.id);
    try {
      await deactivateUser(user.id, getRestClientOptions((session as { accessToken?: string } | null) ?? null));
      await fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deactivate user');
    } finally {
      setDeactivatingId(null);
    }
  };

  if (status === 'loading' || (status === 'unauthenticated')) {
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-400">
          You must be signed in to view this page.
        </p>
      </div>
    );
  }

  if (!isAdministrator) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Users
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Only administrators can list and manage users.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Users
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Include deactivated
            </span>
          </label>
          <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Create user
        </button>
        </div>
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
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      No users yet. Create one to get started.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {user.name}
                      </td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3">
                        {user.deleted_at ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            Deactivated
                          </span>
                        ) : user.enabled === false ? (
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
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!user.deleted_at && (
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditUser(user)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                              aria-label={`Edit ${user.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeactivate(user)}
                              disabled={deactivatingId === user.id}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                              aria-label={`Deactivate ${user.name}`}
                            >
                              {deactivatingId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <UserX className="h-4 w-4" />
                              )}
                              Deactivate
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
        session={session}
      />
      {editUser && (
        <EditUserDialog
          user={editUser}
          open={!!editUser}
          onOpenChange={(open) => !open && setEditUser(null)}
          onSuccess={handleEditSuccess}
          session={session}
        />
      )}
    </div>
  );
}

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  session: ReturnType<typeof useSession>['data'];
}

function CreateUserDialog({
  open,
  onOpenChange,
  onSuccess,
  session,
}: CreateUserDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setEmail('');
    setPassword('');
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
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedName || !trimmedEmail || !trimmedPassword) {
      setFormError('Name, email, and password are required.');
      return;
    }
    setSaving(true);
    try {
      await createUser(
        {
          name: trimmedName,
          email: trimmedEmail,
          password: trimmedPassword,
        },
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      handleOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to create user'
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
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Create user
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
                htmlFor="create-name"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Name
              </Label.Root>
              <input
                id="create-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Full name"
                disabled={saving}
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="create-email"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email
              </Label.Root>
              <input
                id="create-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="user@example.com"
                disabled={saving}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="create-password"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Password
              </Label.Root>
              <input
                id="create-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="••••••••"
                disabled={saving}
                autoComplete="new-password"
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
                  'Create user'
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface EditUserDialogProps {
  user: AccountSchema;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  session: ReturnType<typeof useSession>['data'];
}

function EditUserDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
  session,
}: EditUserDialogProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [verified, setVerified] = useState(user.verified ?? false);
  const [enabled, setEnabled] = useState(user.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setPassword('');
    setVerified(user.verified ?? false);
    setEnabled(user.enabled ?? true);
    setFormError(null);
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormError(null);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName || !trimmedEmail) {
      setFormError('Name and email are required.');
      return;
    }
    setSaving(true);
    try {
      const body: AccountUpdate = {
        name: trimmedName,
        email: trimmedEmail,
        verified,
        enabled,
      };
      if (password.trim()) body.password = password.trim();
      await updateUser(user.id, body, getRestClientOptions((session as { accessToken?: string } | null) ?? null));
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update user'
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
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Edit user
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
                htmlFor="edit-name"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Name
              </Label.Root>
              <input
                id="edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={saving}
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="edit-email"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email
              </Label.Root>
              <input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={saving}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="edit-password"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                New password (leave blank to keep)
              </Label.Root>
              <input
                id="edit-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="••••••••"
                disabled={saving}
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label.Root
                htmlFor="edit-verified"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Verified
              </Label.Root>
              <Switch.Root
                id="edit-verified"
                checked={verified}
                onCheckedChange={setVerified}
                disabled={saving}
                className="w-11 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 dark:data-[state=checked]:bg-indigo-500 relative outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 cursor-pointer disabled:opacity-50"
              >
                <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
              </Switch.Root>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label.Root
                htmlFor="edit-enabled"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Enabled
              </Label.Root>
              <Switch.Root
                id="edit-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={saving}
                className="w-11 h-6 rounded-full bg-slate-200 dark:bg-slate-600 data-[state=checked]:bg-indigo-600 dark:data-[state=checked]:bg-indigo-500 relative outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 cursor-pointer disabled:opacity-50"
              >
                <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
              </Switch.Root>
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
