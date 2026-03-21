'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  ShieldCheck,
  UserPlus,
  Download,
  Mail,
  RotateCw,
  Trash2,
} from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import {
  getTenant,
  listTenantMembers,
  addTenantMember,
  addTenantAdministrator,
  bulkInviteTenantMembers,
  bulkRemoveTenantMembers,
  removeTenantMember,
  updateTenantMember,
  listTenantMemberInvitations,
  inviteTenantMemberByEmail,
  resendTenantMemberInvitation,
  cancelTenantMemberInvitation,
  listTenantRbacRoles,
  listUsers,
  getRestClientOptions,
  isForbiddenError,
  type TenantSchema,
  type TenantAccountSchema,
  type TenantAccountCreate,
  type TenantAccountUpdate,
  type TenantAccessLevel,
  type TenantAdministratorCreate,
  type AccountSchema,
  type TenantMemberInvitationSchema,
  type TenantRbacRoleSchema,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';

type SessionUser = { is_administrator?: boolean };

const WORKSPACE_ROLE_KEYS = new Set(['viewer', 'schema-editor', 'publisher']);

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function TenantMembersPage() {
  const params = useParams();
  const tenantId = typeof params?.tenantId === 'string' ? params.tenantId : '';
  const { data: session, status } = useSession();
  const { confirm, alert } = useDialog();
  const [tenant, setTenant] = useState<TenantSchema | null>(null);
  const [members, setMembers] = useState<TenantAccountSchema[]>([]);
  const [userMap, setUserMap] = useState<Record<string, AccountSchema>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editMember, setEditMember] = useState<TenantAccountSchema | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<TenantMemberInvitationSchema[]>([]);
  const [workspaceRoles, setWorkspaceRoles] = useState<TenantRbacRoleSchema[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [invitationBusyId, setInvitationBusyId] = useState<string | null>(null);

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
      const [memberList, usersList, invList, rbacList] = await Promise.all([
        listTenantMembers(tenantId, opts, true),
        isAdministrator ? listUsers(opts) : Promise.resolve([]),
        isAdministrator ? listTenantMemberInvitations(tenantId, opts) : Promise.resolve([]),
        isAdministrator ? listTenantRbacRoles(tenantId, opts) : Promise.resolve([]),
      ]);
      setMembers(memberList.filter((m) => m.access_level === 'member'));
      setInvitations(invList);
      setWorkspaceRoles(
        rbacList.filter((r) => WORKSPACE_ROLE_KEYS.has(r.key.toLowerCase()))
      );
      setSelectedIds(new Set());
      const map: Record<string, AccountSchema> = {};
      usersList.forEach((u) => {
        map[u.id] = u;
      });
      setUserMap(map);
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view or manage members.'
          : e instanceof Error
            ? e.message
            : 'Failed to load members'
      );
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

  const handleBulkSuccess = () => {
    setBulkOpen(false);
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
        isForbiddenError(e)
          ? 'Admin privileges required to remove a member.'
          : e instanceof Error
            ? e.message
            : 'Failed to remove member'
      );
    } finally {
      setRemovingId(null);
    }
  };

  const handleExportMembersCsv = useCallback(() => {
    const header = [
      'account_id',
      'name',
      'email',
      'workspace_roles',
      'enabled',
      'created_at',
    ];
    const lines = [header.map(escapeCsvField).join(',')];
    for (const member of members) {
      const account = userMap[member.account_id];
      const name = account?.name ?? '';
      const email = account?.email ?? '';
      const roles = (member.roles ?? [])
        .map((r) => r.name || r.key)
        .join('; ');
      lines.push(
        [
          member.account_id,
          name,
          email,
          roles,
          member.enabled ? 'true' : 'false',
          member.created_at ?? '',
        ].map(escapeCsvField).join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenant-members-${tenantId.slice(0, 8)}.csv`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }, [members, userMap, tenantId]);

  const handleBulkRemove = async () => {
    if (!session || selectedIds.size === 0) return;
    const opts = getRestClientOptions(
      (session as { accessToken?: string } | null) ?? null
    );
    const ok = await confirm({
      title: 'Remove selected members',
      message: `Remove ${selectedIds.size} member(s) from this tenant? They will lose access.`,
      variant: 'danger',
      confirmLabel: 'Remove all',
    });
    if (!ok) return;
    try {
      await bulkRemoveTenantMembers(
        tenantId,
        { account_ids: [...selectedIds] },
        opts
      );
      setSelectedIds(new Set());
      await fetchMembers();
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'Admin privileges required to remove members.'
          : e instanceof Error
            ? e.message
            : 'Bulk remove failed'
      );
    }
  };

  const toggleSelectMember = (accountId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const toggleSelectAllMembers = () => {
    if (members.length === 0) return;
    const allOn = members.every((m) => selectedIds.has(m.account_id));
    if (allOn) setSelectedIds(new Set());
    else setSelectedIds(new Set(members.map((m) => m.account_id)));
  };

  const handleResendInvitation = async (inv: TenantMemberInvitationSchema) => {
    if (!session) return;
    setInvitationBusyId(inv.id);
    try {
      await resendTenantMemberInvitation(
        tenantId,
        inv.id,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      await fetchMembers();
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'Admin privileges required to resend invitations.'
          : e instanceof Error
            ? e.message
            : 'Resend failed'
      );
    } finally {
      setInvitationBusyId(null);
    }
  };

  const handleCancelInvitation = async (inv: TenantMemberInvitationSchema) => {
    if (!session) return;
    const ok = await confirm({
      title: 'Cancel invitation',
      message: `Cancel the pending invitation for ${inv.email}?`,
      variant: 'danger',
      confirmLabel: 'Cancel invite',
    });
    if (!ok) return;
    setInvitationBusyId(inv.id);
    try {
      await cancelTenantMemberInvitation(
        tenantId,
        inv.id,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      await fetchMembers();
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'Admin privileges required to cancel invitations.'
          : e instanceof Error
            ? e.message
            : 'Cancel failed'
      );
    } finally {
      setInvitationBusyId(null);
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
          <span className="inline-flex items-center gap-2">
            <Link
              href={`/dashboard/tenants/${tenantId}/administrators`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              aria-label={`View administrators of ${tenant?.name ?? 'tenant'}`}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Administrators
            </Link>
            {tenant && isAdministrator && (
              <span className="inline-flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportMembersCsv}
                  disabled={members.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handleBulkRemove}
                  disabled={selectedIds.size === 0}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Remove selected
                </button>
                <button
                  type="button"
                  onClick={() => setBulkOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                >
                  <UserPlus className="h-4 w-4" aria-hidden />
                  Bulk invite
                </button>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add member
                </button>
              </span>
            )}
          </span>
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
                  {isAdministrator && (
                    <th className="px-2 py-3 w-10">
                      <span className="sr-only">Select</span>
                      <input
                        type="checkbox"
                        checked={
                          members.length > 0 &&
                          members.every((m) => selectedIds.has(m.account_id))
                        }
                        onChange={toggleSelectAllMembers}
                        disabled={members.length === 0}
                        className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                        aria-label="Select all members"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Workspace role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdministrator ? 6 : 5}
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
                    const workspaceLabel =
                      member.roles && member.roles.length > 0
                        ? member.roles.map((r) => r.name || r.key).join(', ')
                        : 'Viewer';
                    return (
                      <tr
                        key={member.id}
                        className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      >
                        {isAdministrator && (
                          <td className="px-2 py-3 align-middle">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(member.account_id)}
                              onChange={() => toggleSelectMember(member.account_id)}
                              className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                              aria-label={`Select ${displayName ?? member.account_id}`}
                            />
                          </td>
                        )}
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
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {workspaceLabel}
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
                          {isAdministrator && (
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
                          )}
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

      {isAdministrator && invitations.length > 0 && (
        <div className="mt-8 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Mail className="h-4 w-4 text-indigo-500" aria-hidden />
              Pending invitations
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              These emails are not registered yet. They will be added when the user signs up.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Workspace role</th>
                  <th className="px-4 py-3 font-medium">Last sent</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t border-slate-200 dark:border-slate-700"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{inv.email}</td>
                    <td className="px-4 py-3">
                      {inv.role_name || inv.role_key || 'Viewer'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {inv.last_sent_at
                        ? new Date(inv.last_sent_at).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleResendInvitation(inv)}
                          disabled={invitationBusyId === inv.id}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {invitationBusyId === inv.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCw className="h-4 w-4" />
                          )}
                          Resend
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelInvitation(inv)}
                          disabled={invitationBusyId === inv.id}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                          Cancel
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <BulkInviteDialog
        tenantId={tenantId}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onSuccess={handleBulkSuccess}
        session={session}
        workspaceRoles={workspaceRoles}
        alertSummary={async (summary) => {
          await alert({
            title: 'Bulk invite finished',
            message: (
              <pre className="text-xs whitespace-pre-wrap font-sans text-left max-h-64 overflow-y-auto">
                {summary}
              </pre>
            ),
          });
        }}
      />
      <AddMemberDialog
        tenantId={tenantId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={handleAddSuccess}
        session={session}
        workspaceRoles={workspaceRoles}
      />
      {editMember && (
        <EditMemberDialog
          tenantId={tenantId}
          member={editMember}
          open={!!editMember}
          onOpenChange={(open) => !open && setEditMember(null)}
          onSuccess={handleEditSuccess}
          session={session}
          workspaceRoles={workspaceRoles}
        />
      )}
    </div>
  );
}

function parseEmailsFromBulkInput(raw: string): string[] {
  const parts = raw.split(/[\s,;]+/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const e = p.trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

interface BulkInviteDialogProps {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  session: ReturnType<typeof useSession>['data'];
  workspaceRoles: TenantRbacRoleSchema[];
  alertSummary: (summary: string) => Promise<void>;
}

function BulkInviteDialog({
  tenantId,
  open,
  onOpenChange,
  onSuccess,
  session,
  workspaceRoles,
  alertSummary,
}: BulkInviteDialogProps) {
  const [rawEmails, setRawEmails] = useState('');
  const [accessLevel, setAccessLevel] = useState<TenantAccessLevel>('member');
  const [memberRoleId, setMemberRoleId] = useState('');
  const [inviteUnknownEmails, setInviteUnknownEmails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const parsedEmails = useMemo(() => parseEmailsFromBulkInput(rawEmails), [rawEmails]);
  const overLimit = parsedEmails.length > 100;
  const ignoredCount = overLimit ? parsedEmails.length - 100 : 0;

  const reset = () => {
    setRawEmails('');
    setAccessLevel('member');
    setMemberRoleId('');
    setInviteUnknownEmails(false);
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
    const emails = parsedEmails.slice(0, 100);
    if (emails.length === 0) {
      setFormError('Enter at least one email (separate with commas, spaces, or new lines).');
      return;
    }
    setSaving(true);
    try {
      const res = await bulkInviteTenantMembers(
        tenantId,
        {
          emails,
          access_level: accessLevel,
          ...(accessLevel === 'member' && memberRoleId
            ? { member_role_id: memberRoleId }
            : {}),
          ...(accessLevel === 'member' && inviteUnknownEmails
            ? { invite_unknown_emails: true }
            : {}),
        },
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      const summary = res.results.map((r) => `${r.email}: ${r.status}`).join('\n');
      await alertSummary(summary);
      handleOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        isForbiddenError(err)
          ? 'Admin privileges required for bulk invite.'
          : err instanceof Error
            ? err.message
            : 'Bulk invite failed'
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
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 max-h-[90vh] overflow-y-auto"
          aria-describedby={undefined}
          onEscapeKeyDown={() => handleOpenChange(false)}
          onPointerDownOutside={() => handleOpenChange(false)}
        >
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-indigo-500" aria-hidden />
            Bulk invite by email
          </Dialog.Title>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Paste up to 100 emails. Existing accounts are added or promoted immediately.
            For members only, you can create pending invitations for addresses that are
            not registered yet.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {overLimit && (
              <div
                className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm"
                role="alert"
              >
                {`${parsedEmails.length} unique addresses detected - only the first 100 will be invited. ${ignoredCount} address${ignoredCount === 1 ? '' : 'es'} will be ignored.`}
              </div>
            )}
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
                htmlFor="bulk-emails"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Emails
              </Label.Root>
              <textarea
                id="bulk-emails"
                value={rawEmails}
                onChange={(e) => setRawEmails(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y min-h-[120px]"
                placeholder={'alice@example.com\nbob@example.com'}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Access
              </Label.Root>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="bulk-role"
                    checked={accessLevel === 'member'}
                    onChange={() => setAccessLevel('member')}
                    disabled={saving}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  Member
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="bulk-role"
                    checked={accessLevel === 'administrator'}
                    onChange={() => setAccessLevel('administrator')}
                    disabled={saving}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  Administrator
                </label>
              </div>
            </div>
            {accessLevel === 'member' && (
              <>
                <div className="space-y-2">
                  <Label.Root
                    htmlFor="bulk-workspace-role"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Workspace role
                  </Label.Root>
                  <select
                    id="bulk-workspace-role"
                    value={memberRoleId}
                    onChange={(e) => setMemberRoleId(e.target.value)}
                    disabled={saving}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Viewer (default)</option>
                    {workspaceRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.key})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-start gap-2">
                  <input
                    id="bulk-invite-unknown"
                    type="checkbox"
                    checked={inviteUnknownEmails}
                    onChange={(e) => setInviteUnknownEmails(e.target.checked)}
                    disabled={saving}
                    className="mt-1 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  <Label.Root
                    htmlFor="bulk-invite-unknown"
                    className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer leading-snug"
                  >
                    Create pending invitations for emails with no account yet (they join when
                    they sign up).
                  </Label.Root>
                </div>
              </>
            )}
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
                    Inviting…
                  </>
                ) : (
                  'Invite'
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface AddMemberDialogProps {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  session: ReturnType<typeof useSession>['data'];
  workspaceRoles: TenantRbacRoleSchema[];
}

function AddMemberDialog({
  tenantId,
  open,
  onOpenChange,
  onSuccess,
  session,
  workspaceRoles,
}: AddMemberDialogProps) {
  const [accountId, setAccountId] = useState('');
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<TenantAccessLevel>('member');
  const [memberRoleId, setMemberRoleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setAccountId('');
    setEmail('');
    setAccessLevel('member');
    setMemberRoleId('');
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
      const opts = getRestClientOptions(
        (session as { accessToken?: string } | null) ?? null
      );
      if (accessLevel === 'administrator') {
        const adminBody: TenantAdministratorCreate = { tenant_id: tenantId };
        if (trimmedAccountId) adminBody.account_id = trimmedAccountId;
        if (trimmedEmail) adminBody.email = trimmedEmail;
        await addTenantAdministrator(tenantId, adminBody, opts);
      } else if (trimmedAccountId) {
        const body: TenantAccountCreate = {
          tenant_id: tenantId,
          access_level: 'member',
          account_id: trimmedAccountId,
        };
        if (trimmedEmail) body.email = trimmedEmail;
        if (memberRoleId) body.member_role_id = memberRoleId;
        await addTenantMember(tenantId, body, opts);
      } else if (trimmedEmail) {
        await inviteTenantMemberByEmail(
          tenantId,
          {
            email: trimmedEmail,
            ...(memberRoleId ? { member_role_id: memberRoleId } : {}),
          },
          opts
        );
      }
      handleOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        isForbiddenError(err)
          ? 'Admin privileges required to add a member.'
          : err instanceof Error
            ? err.message
            : 'Failed to add member'
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
                provided, User ID is used and the account must already exist.
                Email only creates a pending invitation if the user is not registered.
              </p>
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="add-role"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Access
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
            {accessLevel === 'member' && (
              <div className="space-y-2">
                <Label.Root
                  htmlFor="add-workspace-role"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Workspace role
                </Label.Root>
                <select
                  id="add-workspace-role"
                  value={memberRoleId}
                  onChange={(e) => setMemberRoleId(e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Viewer (default)</option>
                  {workspaceRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.key})
                    </option>
                  ))}
                </select>
              </div>
            )}
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
  workspaceRoles: TenantRbacRoleSchema[];
}

function EditMemberDialog({
  tenantId,
  member,
  open,
  onOpenChange,
  onSuccess,
  session,
  workspaceRoles,
}: EditMemberDialogProps) {
  const [accessLevel, setAccessLevel] = useState<TenantAccessLevel>(
    member.access_level
  );
  const [memberWorkspaceRoleId, setMemberWorkspaceRoleId] = useState('');
  const [enabled, setEnabled] = useState(member.enabled);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setAccessLevel(member.access_level);
    setEnabled(member.enabled);
    const first = member.roles?.[0]?.role_id;
    setMemberWorkspaceRoleId(first ?? '');
    setFormError(null);
  }, [member]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormError(null);
    setSaving(true);
    try {
      const opts = getRestClientOptions(
        (session as { accessToken?: string } | null) ?? null
      );
      if (accessLevel === 'administrator') {
        await addTenantAdministrator(
          tenantId,
          { tenant_id: tenantId, account_id: member.account_id, enabled },
          opts
        );
      } else {
        await updateTenantMember(
          tenantId,
          member.account_id,
          {
            access_level: accessLevel,
            enabled,
            member_role_id: memberWorkspaceRoleId || null,
          },
          opts
        );
      }
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        isForbiddenError(err)
          ? 'Admin privileges required to update member role.'
          : err instanceof Error
            ? err.message
            : 'Failed to update member'
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
                Access
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
            {accessLevel === 'member' && (
              <div className="space-y-2">
                <Label.Root
                  htmlFor="edit-workspace-role"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Workspace role
                </Label.Root>
                <select
                  id="edit-workspace-role"
                  value={memberWorkspaceRoleId}
                  onChange={(e) => setMemberWorkspaceRoleId(e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Viewer (default)</option>
                  {workspaceRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.key})
                    </option>
                  ))}
                </select>
              </div>
            )}
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
