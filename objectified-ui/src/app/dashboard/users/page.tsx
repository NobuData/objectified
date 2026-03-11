'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Loader2,
  Plus,
  Pencil,
  UserX,
  ShieldAlert,
  Eye,
  EyeOff,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import * as Switch from '@radix-ui/react-switch';
import { useDialog } from '@/app/components/providers/DialogProvider';
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  type AccountSchema,
  type AccountCreate,
  type AccountUpdate,
} from '@lib/api/rest-client';

type SessionUser = { is_administrator?: boolean };

// ---------------------------------------------------------------------------
// UserFormDialog
// ---------------------------------------------------------------------------

interface UserFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  user?: AccountSchema | null;
  saving: boolean;
  onSave: (data: AccountCreate | AccountUpdate) => void;
  onClose: () => void;
}

function UserFormDialog({
  open,
  mode,
  user,
  saving,
  onSave,
  onClose,
}: UserFormDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && user) {
        setName(user.name);
        setEmail(user.email);
      } else {
        setName('');
        setEmail('');
      }
      setPassword('');
      setShowPassword(false);
      setFormError(null);
    }
  }, [open, mode, user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setFormError('Name is required.');
      return;
    }
    if (!trimmedEmail) {
      setFormError('Email is required.');
      return;
    }

    if (mode === 'create') {
      if (!password) {
        setFormError('Password is required for new users.');
        return;
      }
      const payload: AccountCreate = {
        name: trimmedName,
        email: trimmedEmail,
        password,
      };
      onSave(payload);
    } else {
      const payload: AccountUpdate = {
        name: trimmedName,
        email: trimmedEmail,
      };
      if (password) {
        payload.password = password;
      }
      onSave(payload);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
          onEscapeKeyDown={onClose}
          aria-describedby={undefined}
        >
          <div className="px-6 pt-6 pb-2">
            <Dialog.Title className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {mode === 'create' ? 'Create User' : 'Edit User'}
            </Dialog.Title>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4 overflow-auto">
            {formError && (
              <div
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
                role="alert"
              >
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label.Root
                htmlFor="user-name"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Name
              </Label.Root>
              <input
                id="user-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Full name"
                disabled={saving}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label.Root
                htmlFor="user-email"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email
              </Label.Root>
              <input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="user@example.com"
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <Label.Root
                htmlFor="user-password"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Password{mode === 'edit' ? ' (leave blank to keep unchanged)' : ''}
              </Label.Root>
              <div className="relative">
                <input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder={mode === 'create' ? 'Required' : 'Optional'}
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              >
                {saving ? (
                  <>
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" aria-hidden />
                    Saving…
                  </>
                ) : mode === 'create' ? (
                  'Create'
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

// ---------------------------------------------------------------------------
// UsersPage
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { data: session, status } = useSession();
  const { confirm, alert } = useDialog();

  const [users, setUsers] = useState<AccountSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeDeactivated, setIncludeDeactivated] = useState(false);

  // Form dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingUser, setEditingUser] = useState<AccountSchema | null>(null);
  const [saving, setSaving] = useState(false);

  const isAdministrator = Boolean(
    (session?.user as SessionUser | undefined)?.is_administrator
  );

  const fetchUsers = useCallback(async () => {
    setError(null);
    try {
      const data = await listUsers({}, includeDeactivated);
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [includeDeactivated]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated' || !isAdministrator) {
      setLoading(false);
      return;
    }
    fetchUsers();
  }, [status, isAdministrator, fetchUsers]);

  const handleCreate = () => {
    setDialogMode('create');
    setEditingUser(null);
    setDialogOpen(true);
  };

  const handleEdit = (user: AccountSchema) => {
    setDialogMode('edit');
    setEditingUser(user);
    setDialogOpen(true);
  };

  const handleDeactivate = async (user: AccountSchema) => {
    const confirmed = await confirm({
      title: 'Deactivate User',
      message: `Are you sure you want to deactivate "${user.name}" (${user.email})? The account will be soft-deleted and can be restored later.`,
      variant: 'danger',
      confirmLabel: 'Deactivate',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    try {
      await deactivateUser(user.id);
      await fetchUsers();
    } catch (e) {
      await alert({
        title: 'Deactivation Failed',
        message: e instanceof Error ? e.message : 'An error occurred while deactivating the user.',
        variant: 'error',
      });
    }
  };

  const handleSave = async (data: AccountCreate | AccountUpdate) => {
    setSaving(true);
    try {
      if (dialogMode === 'create') {
        await createUser(data as AccountCreate);
      } else if (editingUser) {
        await updateUser(editingUser.id, data as AccountUpdate);
      }
      setDialogOpen(false);
      await fetchUsers();
    } catch (e) {
      await alert({
        title: dialogMode === 'create' ? 'Create Failed' : 'Update Failed',
        message: e instanceof Error ? e.message : 'An error occurred.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // ----- Loading state -----
  if (status === 'loading' || (status === 'authenticated' && loading && !error)) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2
          className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400"
          aria-hidden
        />
      </div>
    );
  }

  // ----- Not admin -----
  if (!isAdministrator) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[320px] text-center">
        <ShieldAlert className="h-12 w-12 text-slate-400 dark:text-slate-500 mb-4" />
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Access Denied
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          You must be an administrator to manage users.
        </p>
      </div>
    );
  }

  // ----- Main content -----
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Users
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage user accounts across the platform.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          <Plus className="h-4 w-4" />
          Create User
        </button>
      </div>

      {/* Include deactivated toggle */}
      <div className="flex items-center gap-3 mb-4">
        <Switch.Root
          id="include-deactivated"
          checked={includeDeactivated}
          onCheckedChange={(checked) => setIncludeDeactivated(checked)}
          className="w-[42px] h-[25px] bg-slate-200 dark:bg-slate-700 rounded-full relative data-[state=checked]:bg-indigo-600 outline-none cursor-pointer transition-colors"
        >
          <Switch.Thumb className="block w-[21px] h-[21px] bg-white rounded-full shadow-md transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[19px]" />
        </Switch.Root>
        <Label.Root
          htmlFor="include-deactivated"
          className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none"
        >
          Show deactivated users
        </Label.Root>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Users table */}
      {users.length === 0 && !error ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          No users found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">
                  Email
                </th>
                <th className="px-4 py-3 text-center font-medium text-slate-700 dark:text-slate-300">
                  Verified
                </th>
                <th className="px-4 py-3 text-center font-medium text-slate-700 dark:text-slate-300">
                  Enabled
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">
                  Created
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isDeactivated = !!u.deleted_at;
                return (
                  <tr
                    key={u.id}
                    className={`border-b last:border-b-0 border-slate-200 dark:border-slate-700 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                      isDeactivated ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-medium">
                      {u.name}
                      {isDeactivated && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.verified
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {u.verified ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.enabled
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {u.enabled ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(u)}
                          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          aria-label={`Edit ${u.name}`}
                          title="Edit user"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {!isDeactivated && (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(u)}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            aria-label={`Deactivate ${u.name}`}
                            title="Deactivate user"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit dialog */}
      <UserFormDialog
        open={dialogOpen}
        mode={dialogMode}
        user={editingUser}
        saving={saving}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
