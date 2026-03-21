'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  getUser,
  getRestClientOptions,
  isForbiddenError,
  isNotFoundError,
  listUserLifecycleEvents,
  listUserTenantMemberships,
  type AccountLifecycleEventSchema,
  type AccountSchema,
  type UserTenantMembershipAdminSchema,
} from '@lib/api/rest-client';

type SessionUser = { is_administrator?: boolean };

const panelClass =
  'rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5';

export default function UserDetailPageClient() {
  const params = useParams();
  const userId = typeof params?.userId === 'string' ? params.userId : '';
  const { data: session, status } = useSession();
  const [account, setAccount] = useState<AccountSchema | null>(null);
  const [memberships, setMemberships] = useState<UserTenantMembershipAdminSchema[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AccountLifecycleEventSchema[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const isAdministrator = Boolean(
    (session?.user as SessionUser | undefined)?.is_administrator
  );

  const accessToken = (session as { accessToken?: string } | undefined)?.accessToken;
  const sessionOpts = useMemo(
    () => getRestClientOptions(accessToken ? { accessToken } : null),
    [accessToken]
  );

  const loadAccount = useCallback(async () => {
    if (!userId) return null;
    try {
      return await getUser(userId, sessionOpts, false);
    } catch (e) {
      if (isNotFoundError(e)) {
        try {
          return await getUser(userId, sessionOpts, true);
        } catch (e2) {
          if (isNotFoundError(e2)) return null;
          throw e2;
        }
      }
      throw e;
    }
  }, [userId, sessionOpts]);

  const fetchDetail = useCallback(async () => {
    if (status !== 'authenticated' || !isAdministrator || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const acc = await loadAccount();
      if (!acc) {
        setNotFound(true);
        setAccount(null);
        setMemberships([]);
        return;
      }
      setAccount(acc);
      const m = await listUserTenantMemberships(userId, sessionOpts);
      setMemberships(m);
    } catch (e) {
      setAccount(null);
      setMemberships([]);
      setError(
        isForbiddenError(e)
          ? 'Admin privileges required to view user details.'
          : e instanceof Error
            ? e.message
            : 'Failed to load user'
      );
    } finally {
      setLoading(false);
    }
  }, [status, isAdministrator, userId, loadAccount, sessionOpts]);

  useEffect(() => {
    if (status === 'loading') return;
    void fetchDetail();
  }, [status, fetchDetail]);

  const fetchAudit = useCallback(async () => {
    if (!userId || status !== 'authenticated' || !isAdministrator) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const rows = await listUserLifecycleEvents(userId, sessionOpts);
      setAuditEvents(rows);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : 'Failed to load audit trail');
      setAuditEvents([]);
    } finally {
      setAuditLoading(false);
    }
  }, [userId, status, isAdministrator, sessionOpts]);

  useEffect(() => {
    if (!auditOpen) return;
    void fetchAudit();
  }, [auditOpen, fetchAudit]);

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

  if (!isAdministrator) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          User details
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Only administrators can view user profiles and tenant assignments.
        </p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-400">Missing user id.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <Link
          href="/dashboard/users"
          className="inline-flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-4"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to users
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          User details
        </h1>
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
      ) : notFound ? (
        <p className="text-slate-600 dark:text-slate-400">User not found.</p>
      ) : account ? (
        <div className="space-y-6">
          <section className={panelClass} aria-labelledby="user-profile-heading">
            <h2
              id="user-profile-heading"
              className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-4"
            >
              Profile
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                <dd className="text-slate-900 dark:text-slate-100 font-medium">{account.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                <dd className="text-slate-900 dark:text-slate-100">{account.email}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Verified</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {account.verified ? 'Yes' : 'No'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Account status</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {account.deleted_at
                    ? 'Deactivated'
                    : account.enabled === false
                      ? 'Disabled'
                      : 'Active'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Created</dt>
                <dd className="text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {account.created_at ? new Date(account.created_at).toLocaleString() : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Last updated</dt>
                <dd className="text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {account.updated_at ? new Date(account.updated_at).toLocaleString() : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Last sign-in</dt>
                <dd className="text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {account.last_login_at
                    ? new Date(account.last_login_at).toLocaleString()
                    : '—'}
                </dd>
              </div>
              {account.deleted_at && (
                <>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500 dark:text-slate-400">Deactivated at</dt>
                    <dd className="text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {new Date(account.deleted_at).toLocaleString()}
                    </dd>
                  </div>
                  {account.deactivation_reason && (
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500 dark:text-slate-400">Deactivation reason</dt>
                      <dd className="text-slate-900 dark:text-slate-100 break-words">
                        {account.deactivation_reason}
                      </dd>
                    </div>
                  )}
                </>
              )}
            </dl>
            <div className="mt-4">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Metadata</p>
              <pre className="text-xs overflow-x-auto rounded-md bg-slate-50 dark:bg-slate-800/80 p-3 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                {JSON.stringify(account.metadata ?? {}, null, 2)}
              </pre>
            </div>
          </section>

          <section className={panelClass} aria-labelledby="user-tenants-heading">
            <h2
              id="user-tenants-heading"
              className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-4"
            >
              Tenants and roles
            </h2>
            {memberships.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                This user is not a member of any tenant.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-600">
                <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Tenant</th>
                      <th className="px-3 py-2 font-medium">Access</th>
                      <th className="px-3 py-2 font-medium">Membership</th>
                      <th className="px-3 py-2 font-medium">RBAC roles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberships.map((row) => (
                      <tr
                        key={row.tenant_id}
                        className="border-t border-slate-200 dark:border-slate-700"
                      >
                        <td className="px-3 py-2">
                          <Link
                            href={`/dashboard/tenants/${row.tenant_id}/members`}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                          >
                            {row.tenant_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 capitalize">{row.access_level}</td>
                        <td className="px-3 py-2">
                          {row.membership_enabled ? (
                            <span className="text-green-600 dark:text-green-400">Enabled</span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">Disabled</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.roles.length === 0 ? (
                            <span className="text-slate-500 dark:text-slate-400">—</span>
                          ) : (
                            <ul className="list-disc list-inside space-y-0.5">
                              {row.roles.map((r) => (
                                <li key={r.role_id}>
                                  <span className="font-mono text-xs">{r.key}</span>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    {' '}
                                    ({r.name})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={panelClass} aria-labelledby="user-audit-heading">
            <button
              type="button"
              id="user-audit-heading"
              onClick={() => setAuditOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 text-left text-lg font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-md"
            >
              <span>Optional audit trail</span>
              {auditOpen ? (
                <ChevronDown className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
              ) : (
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
              )}
            </button>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 mb-3">
              Lifecycle events recorded for this account (for example deactivation). Expand to
              load.
            </p>
            {auditOpen && (
              <div className="mt-2">
                {auditLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading…
                  </div>
                ) : auditError ? (
                  <p className="text-sm text-red-700 dark:text-red-300">{auditError}</p>
                ) : auditEvents.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    No lifecycle audit entries.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-600">
                    <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">When</th>
                          <th className="px-3 py-2 font-medium">Event</th>
                          <th className="px-3 py-2 font-medium">Reason</th>
                          <th className="px-3 py-2 font-medium">Actor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditEvents.map((ev) => (
                          <tr
                            key={ev.id}
                            className="border-t border-slate-200 dark:border-slate-700"
                          >
                            <td className="px-3 py-2 whitespace-nowrap">
                              {new Date(ev.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{ev.event_type}</td>
                            <td className="px-3 py-2 max-w-[220px] break-words">
                              {ev.reason ?? '—'}
                            </td>
                            <td className="px-3 py-2">
                              {ev.actor_id ? (
                                <Link
                                  href={`/dashboard/users/${encodeURIComponent(ev.actor_id)}`}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-mono text-xs"
                                >
                                  {ev.actor_id}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
