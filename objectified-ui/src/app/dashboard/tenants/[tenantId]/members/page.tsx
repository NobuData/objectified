'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Plus,
  Pencil,
  UserMinus,
  ArrowLeft,
  Users,
} from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import {
  getTenant,
  listTenantMembers,
  addTenantMember,
  removeTenantMember,
  updateTenantMember,
  listUsers,
  getRestClientOptions,
  type TenantSchema,
  type TenantAccountSchema,
  type TenantAccountCreate,
  type TenantAccountUpdate,
  type TenantAccessLevel,
  type AccountSchema,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';

type SessionUser = { is_administrator?: boolean };

export default function TenantMembersPage() {
  const params = useParams();
  const tenantId = typeof params?.tenantId === 'string' ? params.tenantId : '';
  const { data: session, status } = useSession();
  const { confirm } = useDialog();
  const [tenant, setTenant] = useState<TenantSchema | null>(null);
  const [members, setMembers] = useState<TenantAccountSchema[]>([]);
  const [userMap, setUserMap] = useState<Record<string, AccountSchema>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<TenantAccountSchema | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isAdministrator = Boolean(
    (session?.user as SessionUser | undefined)?.is_administrator
  );

  const fetchTenant = useCallback(async () => {
    if (!tenantId || status !== 'authenticated' || !session) return null;
    try {
      const t = await getTenant(
        tenantId,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      setTenant(t);
      return t;
    } catch {
      setTenant(null);
      return null;
    }
  }, [tenantId, status, session]);

  const fetchMembers = useCallback(async () => {
    if (!tenantId || status !== 'authenticated' || !session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const opts = getRestClientOptions(
        (session as { accessToken?: string } | null) ?? null
      );
      const [memberList, usersList] = await Promise.all([
        listTenantMembers(tenantId, opts),
        isAdministrator ? listUsers(opts) : Promise.resolve([]),
      ]);
      setMembers(memberList);
      const map: Record<string, AccountSchema> = {};
      usersList.forEach((u) => {
        map[u.id] = u;
      });
      setUserMap(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, status, session, isAdministrator]);

  useEffect(() => {
    if (status === 'loading' || !tenantId) return;
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const t = await fetchTenant();
      if (cancelled || !t) {
        if (!t && tenantId) setError('Tenant not found');
        setLoading(false);
        return;
      }
      await fetchMembers();
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, status, fetchTenant, fetchMembers]);

  const handleAddSuccess = () => {
    setAddOpen(false);
    fetchMembers();
  };

  const handleEditSuccess = () => {
    setEditMember(null);
    fetchMembers();
  };

  const handleRemove = async (member: TenantAccountSchema) => {
    const displayName =
      userMap[member.account_id]?.name ??
      userMap[member.account_id]?.email ??
      member.account_id;
    const ok = await confirm({
      title: 'Remove member',
      message: (
        <span>
          Remove <strong>{displayName}</strong> from this tenant? They will lose
          access.
        </span>
      ),
      variant: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setRemovingId(member.account_id);
    try {
      await removeTenantMember(
        tenantId,
        member.account_id,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      await fetchMembers();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to remove member'
      );
    } finally {
      setRemovingId(null);
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

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-400">
          Missing tenant.
        </p>
      </div>
    );
  }

  if (!tenant && !loading) {
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Tenant not found or you do not have access.
        </p>
        <Link
          href="/dashboard/tenants"
          className="text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Back to Tenants
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/tenants"
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
            aria-label="Back to Tenants"
          >
            <ArrowLeft className="h-4 w-4" />
            Tenants
          </Link>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-500" aria-hidden />
            {tenant?.name ?? 'Tenant'} — Members
          </h1>
          {tenant && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add member
            </button>
          )}
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
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      No members yet. Add a member by user ID or email.
                    </td>
                  </tr>
                ) : (
                  members.map((member) => {
                    const account = userMap[member.account_id];
                    const displayName = account?.name ?? account?.email ?? null;
                    const displayEmail =
                      account?.email && account?.email !== displayName
                        ? account.email
                        : null;
                    return (
                      <tr
                        key={member.id}
                        className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {displayName ?? (
                              <span className="font-mono text-slate-600 dark:text-slate-400">
                                {member.account_id.slice(0, 8)}…
                              </span>
                            )}
                          </div>
                          {(displayEmail || (!displayName && member.account_id)) && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {displayEmail ?? member.account_id}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              member.access_level === 'administrator'
                                ? 'text-amber-600 dark:text-amber-400 font-medium'
                                : 'text-slate-600 dark:text-slate-400'
                            }
                          >
                            {member.access_level === 'administrator'
                              ? 'Administrator'
                              : 'Member'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {member.enabled ? (
                            <span className="text-green-600 dark:text-green-400">
                              Enabled
                            </span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {member.created_at
                            ? new Date(member.created_at).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditMember(member)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                              aria-label="Edit role"
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(member)}
                              disabled={removingId === member.account_id}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                              aria-label="Remove member"
                            >
                              {removingId === member.account_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <UserMinus className="h-4 w-4" />
                              )}
                              Remove
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddMemberDialog
        tenantId={tenantId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={handleAddSuccess}
        session={session}
      />
      {editMember && (
        <EditMemberDialog
          tenantId={tenantId}
          member={editMember}
          open={!!editMember}
          onOpenChange={(open) => !open && setEditMember(null)}
          onSuccess={handleEditSuccess}
          session={session}
        />
      )}
    </div>
  );
}

interface AddMemberDialogProps {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  session: ReturnType<typeof useSession>['data'];
}

function AddMemberDialog({
  tenantId,
  open,
  onOpenChange,
  onSuccess,
  session,
}: AddMemberDialogProps) {
  const [accountId, setAccountId] = useState('');
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<TenantAccessLevel>('member');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setAccountId('');
    setEmail('');
    setAccessLevel('member');
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
    const trimmedAccountId = accountId.trim() || null;
    const trimmedEmail = email.trim().toLowerCase() || null;
    if (!trimmedAccountId && !trimmedEmail) {
      setFormError('User ID or Email is required (enter one or the other).');
      return;
    }
    setSaving(true);
    try {
      const body: TenantAccountCreate = {
        tenant_id: tenantId,
        access_level: accessLevel,
      };
      if (trimmedAccountId) body.account_id = trimmedAccountId;
      if (trimmedEmail) body.email = trimmedEmail;
      await addTenantMember(
        tenantId,
        body,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      handleOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to add member'
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
            <Users className="h-5 w-5 text-indigo-500" aria-hidden />
            Add member
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
                htmlFor="add-account-id"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                User ID
              </Label.Root>
              <input
                id="add-account-id"
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="UUID"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="add-email"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email
              </Label.Root>
              <input
                id="add-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="user@example.com"
                disabled={saving}
                autoComplete="email"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                User ID or Email is required (one or the other). If both are
                provided, User ID takes precedence.
              </p>
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="add-role"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Role
              </Label.Root>
              <select
                id="add-role"
                value={accessLevel}
                onChange={(e) =>
                  setAccessLevel(e.target.value as TenantAccessLevel)
                }
                disabled={saving}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="member">Member</option>
                <option value="administrator">Administrator</option>
              </select>
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
                    Adding…
                  </>
                ) : (
                  'Add member'
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface EditMemberDialogProps {
  tenantId: string;
  member: TenantAccountSchema;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  session: ReturnType<typeof useSession>['data'];
}

function EditMemberDialog({
  tenantId,
  member,
  open,
  onOpenChange,
  onSuccess,
  session,
}: EditMemberDialogProps) {
  const [accessLevel, setAccessLevel] = useState<TenantAccessLevel>(
    member.access_level
  );
  const [enabled, setEnabled] = useState(member.enabled);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setAccessLevel(member.access_level);
    setEnabled(member.enabled);
    setFormError(null);
  }, [member]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormError(null);
    setSaving(true);
    try {
      const body: TenantAccountUpdate = { access_level: accessLevel, enabled };
      await updateTenantMember(
        tenantId,
        member.account_id,
        body,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update member'
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
            Edit member role
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
            <p className="text-sm text-slate-600 dark:text-slate-400 font-mono">
              {member.account_id}
            </p>
            <div className="space-y-2">
              <Label.Root
                htmlFor="edit-role"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Role
              </Label.Root>
              <select
                id="edit-role"
                value={accessLevel}
                onChange={(e) =>
                  setAccessLevel(e.target.value as TenantAccessLevel)
                }
                disabled={saving}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="member">Member</option>
                <option value="administrator">Administrator</option>
              </select>
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
