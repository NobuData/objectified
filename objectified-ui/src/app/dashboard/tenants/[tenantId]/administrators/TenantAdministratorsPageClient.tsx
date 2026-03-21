'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Plus,
  UserMinus,
  ArrowLeft,
  Users,
  ShieldCheck,
  ArrowDownToLine,
  Crown,
  ChevronDown,
} from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Dialog from '@radix-ui/react-dialog';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  getTenant,
  listTenantAdministrators,
  addTenantAdministrator,
  removeTenantAdministrator,
  updateTenantMember,
  listUsers,
  listTenantAdministratorAuditEvents,
  transferTenantPrimaryAdministrator,
  getRestClientOptions,
  isForbiddenError,
  isConflictError,
  type TenantSchema,
  type TenantAccountSchema,
  type TenantAdministratorCreate,
  type TenantAdminAuditEventSchema,
  type AccountSchema,
} from '@lib/api/rest-client';
import { useDialog } from '@/app/components/providers/DialogProvider';

function formatTenantAdminAuditSummary(eventType: string): string {
  switch (eventType) {
    case 'admin_added':
      return 'Administrator added';
    case 'admin_removed':
      return 'Administrator removed';
    case 'admin_demoted':
      return 'Administrator demoted to member';
    case 'admin_promoted':
      return 'Member promoted to administrator';
    case 'primary_admin_transferred':
      return 'Primary administrator transferred';
    default:
      return eventType.replace(/_/g, ' ');
  }
}

export default function TenantAdministratorsPage() {
  const params = useParams();
  const tenantId = typeof params?.tenantId === 'string' ? params.tenantId : '';
  const { data: session, status } = useSession();
  const { confirm } = useDialog();
  const [tenant, setTenant] = useState<TenantSchema | null>(null);
  const [administrators, setAdministrators] = useState<TenantAccountSchema[]>(
    []
  );
  const [userMap, setUserMap] = useState<Record<string, AccountSchema>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [demotingId, setDemotingId] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<TenantAdminAuditEventSchema[]>(
    []
  );
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  type SessionUser = { is_administrator?: boolean };
  const isAdministrator = Boolean(
    (session?.user as SessionUser | undefined)?.is_administrator
  );

  const currentAccountId = (session?.user as { id?: string } | undefined)?.id;

  const primaryAdminId = tenant?.primary_admin_account_id ?? null;
  const transferTargetAdmins = administrators.filter(
    (a) => a.enabled && (!primaryAdminId || a.account_id !== primaryAdminId)
  );
  const mayOpenTransfer =
    Boolean(tenant && session) &&
    (isAdministrator ||
      primaryAdminId == null ||
      (currentAccountId != null && currentAccountId === primaryAdminId));
  const showTransferPrimary =
    mayOpenTransfer && transferTargetAdmins.length > 0;

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

  const fetchAdministrators = useCallback(async () => {
    if (!tenantId || status !== 'authenticated' || !session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const opts = getRestClientOptions(
        (session as { accessToken?: string } | null) ?? null
      );
      const adminList = await listTenantAdministrators(tenantId, opts);
      setAdministrators(adminList);
      try {
        const usersList = await listUsers(opts);
        const map: Record<string, AccountSchema> = {};
        usersList.forEach((u) => {
          map[u.id] = u;
        });
        setUserMap(map);
      } catch {
        setUserMap({});
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load administrators';
      setError(msg);
      setAdministrators([]);
      if (isForbiddenError(e)) {
        setForbidden(true);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, status, session]);

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
      await fetchAdministrators();
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, status, fetchTenant, fetchAdministrators]);

  const fetchAuditEntries = useCallback(async () => {
    if (!tenantId || status !== 'authenticated' || !session) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const rows = await listTenantAdministratorAuditEvents(
        tenantId,
        getRestClientOptions(
          (session as { accessToken?: string } | null) ?? null
        )
      );
      setAuditEntries(rows);
    } catch (e) {
      setAuditEntries([]);
      setAuditError(
        e instanceof Error ? e.message : 'Failed to load administrator audit'
      );
    } finally {
      setAuditLoading(false);
    }
  }, [tenantId, status, session]);

  useEffect(() => {
    if (!auditOpen || !tenantId) return;
    void fetchAuditEntries();
  }, [auditOpen, tenantId, fetchAuditEntries]);

  const refreshAfterAdminChange = useCallback(async () => {
    const promises: Promise<unknown>[] = [fetchTenant(), fetchAdministrators()];
    if (auditOpen) {
      promises.push(fetchAuditEntries());
    }
    await Promise.all(promises);
  }, [fetchTenant, fetchAdministrators, auditOpen, fetchAuditEntries]);

  const handleAddSuccess = () => {
    setAddOpen(false);
    void refreshAfterAdminChange();
  };

  const handleRemove = async (admin: TenantAccountSchema) => {
    const displayName =
      userMap[admin.account_id]?.name ??
      userMap[admin.account_id]?.email ??
      admin.account_id;
    const ok = await confirm({
      title: 'Remove administrator',
      message: (
        <span>
          Remove <strong>{displayName}</strong> from this tenant? They will lose
          all access.
        </span>
      ),
      variant: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setRemovingId(admin.account_id);
    try {
      await removeTenantAdministrator(
        tenantId,
        admin.account_id,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      await refreshAfterAdminChange();
    } catch (e) {
      setError(
        isConflictError(e)
          ? 'Cannot remove the designated primary administrator until that role is transferred to someone else.'
          : isForbiddenError(e)
            ? 'Admin privileges required to remove an administrator.'
            : e instanceof Error
              ? e.message
              : 'Failed to remove administrator'
      );
    } finally {
      setRemovingId(null);
    }
  };

  const handleDemote = async (admin: TenantAccountSchema) => {
    const displayName =
      userMap[admin.account_id]?.name ??
      userMap[admin.account_id]?.email ??
      admin.account_id;
    const ok = await confirm({
      title: 'Demote to member',
      message: (
        <span>
          Do you want to demote <strong>{displayName}</strong>&#39;s access
          level? They will become a member and can be managed from the Members
          page.
        </span>
      ),
      variant: 'warning',
      confirmLabel: 'Demote',
    });
    if (!ok) return;
    setDemotingId(admin.account_id);
    try {
      await updateTenantMember(
        tenantId,
        admin.account_id,
        { access_level: 'member' },
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      await refreshAfterAdminChange();
    } catch (e) {
      setError(
        isConflictError(e)
          ? 'Cannot demote the designated primary administrator until that role is transferred to someone else.'
          : isForbiddenError(e)
            ? 'Admin privileges required to demote an administrator.'
            : e instanceof Error
              ? e.message
              : 'Failed to demote administrator'
      );
    } finally {
      setDemotingId(null);
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
        <p className="text-slate-600 dark:text-slate-400">Missing tenant.</p>
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

  if (forbidden) {
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          You need tenant administrator or platform administrator access to view
          this page.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/dashboard/tenants/${tenantId}/members`}
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            View Members
          </Link>
          <Link
            href="/dashboard/tenants"
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Back to Tenants
          </Link>
        </div>
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
            <ShieldCheck className="h-6 w-6 text-indigo-500" aria-hidden />
            {tenant?.name ?? 'Tenant'} — Administrators
          </h1>
          <span className="inline-flex items-center gap-2">
            <Link
              href={`/dashboard/tenants/${tenantId}/members`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              aria-label={`View members of ${tenant?.name ?? 'tenant'}`}
            >
              <Users className="h-4 w-4" aria-hidden />
              Members
            </Link>
            {tenant && showTransferPrimary && (
              <button
                type="button"
                onClick={() => setTransferOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-amber-500/60 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
              >
                <Crown className="h-4 w-4" aria-hidden />
                Transfer primary role
              </button>
            )}
            {tenant && isAdministrator && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add administrator
              </button>
            )}
          </span>
        </div>
      </div>

      {error && !forbidden && (
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
                  <th className="px-4 py-3 font-medium">Administrator</th>
                  <th className="px-4 py-3 font-medium">Designation</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {administrators.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      No administrators yet. Add an administrator by user ID or
                      email.
                    </td>
                  </tr>
                ) : (
                  administrators.map((admin) => {
                    const account = userMap[admin.account_id];
                    const displayName = account?.name ?? account?.email ?? null;
                    const displayEmail =
                      account?.email && account?.email !== displayName
                        ? account.email
                        : null;
                    return (
                      <tr
                        key={admin.id}
                        className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {displayName ?? (
                              <span className="font-mono text-slate-600 dark:text-slate-400">
                                {admin.account_id.slice(0, 8)}…
                              </span>
                            )}
                          </div>
                          {(displayEmail ||
                            (!displayName && admin.account_id)) && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {displayEmail ?? admin.account_id}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {primaryAdminId &&
                          admin.account_id === primaryAdminId ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                              <Crown className="h-3 w-3" aria-hidden />
                              Primary
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-xs">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {admin.enabled ? (
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
                          {admin.created_at
                            ? new Date(admin.created_at).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {admin.account_id === currentAccountId ? (
                            <span className="text-slate-500 dark:text-slate-400 text-sm">
                              You
                            </span>
                          ) : isAdministrator ? (
                            <span className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDemote(admin)}
                                disabled={
                                  demotingId === admin.account_id ||
                                  removingId === admin.account_id
                                }
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                                aria-label="Demote to member"
                              >
                                {demotingId === admin.account_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ArrowDownToLine className="h-4 w-4" />
                                )}
                                Demote to member
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemove(admin)}
                                disabled={
                                  removingId === admin.account_id ||
                                  demotingId === admin.account_id
                                }
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                                aria-label="Remove administrator"
                              >
                                {removingId === admin.account_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <UserMinus className="h-4 w-4" />
                                )}
                                Remove
                              </button>
                            </span>
                          ) : null}
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

      <Collapsible.Root open={auditOpen} onOpenChange={setAuditOpen} className="mt-6">
        <Collapsible.Trigger className="flex items-center gap-2 w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors">
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${auditOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
          Administrator audit trail
        </Collapsible.Trigger>
        <Collapsible.Content className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
          {auditLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" aria-hidden />
            </div>
          ) : auditError ? (
            <div className="p-4 text-sm text-red-700 dark:text-red-300" role="alert">
              {auditError}
            </div>
          ) : auditEntries.length === 0 ? (
            <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
              No administrator audit events yet.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Actor</th>
                    <th className="px-3 py-2 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((ev) => (
                    <tr
                      key={ev.id}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {new Date(ev.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {formatTenantAdminAuditSummary(ev.event_type)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {ev.actor_account_id
                          ? (userMap[ev.actor_account_id]?.email ??
                              userMap[ev.actor_account_id]?.name ??
                              `${ev.actor_account_id.slice(0, 8)}…`)
                          : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {ev.target_account_id
                          ? (userMap[ev.target_account_id]?.email ??
                              userMap[ev.target_account_id]?.name ??
                              `${ev.target_account_id.slice(0, 8)}…`)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Collapsible.Content>
      </Collapsible.Root>

      {tenant ? (
        <TransferPrimaryAdminDialog
          tenantId={tenantId}
          tenant={tenant}
          candidates={transferTargetAdmins}
          userMap={userMap}
          open={transferOpen}
          onOpenChange={setTransferOpen}
          onSuccess={refreshAfterAdminChange}
          session={session}
        />
      ) : null}

      <AddAdministratorDialog
        tenantId={tenantId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={handleAddSuccess}
        session={session}
      />
    </div>
  );
}

interface TransferPrimaryAdminDialogProps {
  tenantId: string;
  tenant: TenantSchema;
  candidates: TenantAccountSchema[];
  userMap: Record<string, AccountSchema>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  session: ReturnType<typeof useSession>['data'];
}

function TransferPrimaryAdminDialog({
  tenantId,
  tenant,
  candidates,
  userMap,
  open,
  onOpenChange,
  onSuccess,
  session,
}: TransferPrimaryAdminDialogProps) {
  const [targetId, setTargetId] = useState('');
  const [confirmSlug, setConfirmSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const first = candidates[0]?.account_id ?? '';
    setTargetId((prev) => (prev && candidates.some((c) => c.account_id === prev) ? prev : first));
    setFormError(null);
  }, [open, candidates]);

  const reset = () => {
    setTargetId(candidates[0]?.account_id ?? '');
    setConfirmSlug('');
    setFormError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !targetId) return;
    setFormError(null);
    if (confirmSlug.trim() !== tenant.slug) {
      setFormError(`Type the tenant slug exactly: ${tenant.slug}`);
      return;
    }
    setSaving(true);
    try {
      await transferTenantPrimaryAdministrator(
        tenantId,
        {
          new_primary_account_id: targetId,
          confirm_tenant_slug: confirmSlug.trim(),
        },
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      handleOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        isForbiddenError(err)
          ? 'You are not allowed to transfer the primary administrator role.'
          : err instanceof Error
            ? err.message
            : 'Transfer failed'
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
          <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
            Transfer primary administrator
          </Dialog.Title>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            The primary administrator is the designated ownership contact for this
            tenant. Choose another active administrator and confirm using the tenant
            slug.
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
              <Label.Root
                htmlFor="transfer-primary-target"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                New primary administrator
              </Label.Root>
              <select
                id="transfer-primary-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={saving || candidates.length === 0}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {candidates.map((c) => {
                  const u = userMap[c.account_id];
                  const label =
                    u?.name ?? u?.email ?? `${c.account_id.slice(0, 8)}…`;
                  return (
                    <option key={c.account_id} value={c.account_id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-2">
              <Label.Root
                htmlFor="transfer-primary-confirm-slug"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Confirm tenant slug
              </Label.Root>
              <input
                id="transfer-primary-confirm-slug"
                type="text"
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                disabled={saving}
                autoComplete="off"
                placeholder={tenant.slug}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enter <span className="font-mono">{tenant.slug}</span> exactly to
                confirm.
              </p>
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
                disabled={saving || !targetId}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Transferring…
                  </>
                ) : (
                  'Confirm transfer'
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface AddAdministratorDialogProps {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  session: ReturnType<typeof useSession>['data'];
}

function AddAdministratorDialog({
  tenantId,
  open,
  onOpenChange,
  onSuccess,
  session,
}: AddAdministratorDialogProps) {
  const [accountId, setAccountId] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setAccountId('');
    setEmail('');
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
      const body: TenantAdministratorCreate = {
        tenant_id: tenantId,
      };
      if (trimmedAccountId) body.account_id = trimmedAccountId;
      if (trimmedEmail) body.email = trimmedEmail;
      await addTenantAdministrator(
        tenantId,
        body,
        getRestClientOptions((session as { accessToken?: string } | null) ?? null)
      );
      handleOpenChange(false);
      onSuccess();
    } catch (err) {
      setFormError(
        isForbiddenError(err)
          ? 'Admin privileges required to add an administrator.'
          : err instanceof Error
            ? err.message
            : 'Failed to add administrator'
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
            <ShieldCheck className="h-5 w-5 text-indigo-500" aria-hidden />
            Add administrator
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
                htmlFor="add-admin-account-id"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                User ID
              </Label.Root>
              <input
                id="add-admin-account-id"
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
                htmlFor="add-admin-email"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email
              </Label.Root>
              <input
                id="add-admin-email"
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
                  'Add administrator'
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
