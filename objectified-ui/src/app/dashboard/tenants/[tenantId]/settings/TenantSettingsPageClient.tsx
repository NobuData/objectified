'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, BarChart3, ChevronDown, Loader2, Palette } from 'lucide-react';
import * as Label from '@radix-ui/react-label';
import * as Select from '@radix-ui/react-select';
import {
  getTenant,
  getTenantActivitySummary,
  updateTenantAppearance,
  getRestClientOptions,
  isForbiddenError,
  type TenantSchema,
  type TenantActivitySummarySchema,
  type TenantDefaultTheme,
} from '@lib/api/rest-client';
import {
  parseTenantBrandingFromMetadata,
  parseTenantDefaultTheme,
} from '@lib/ui/tenantBrandingMetadata';
import { useTenantPermissions } from '@/app/hooks/useTenantPermissions';

type SessionUser = { is_administrator?: boolean };

const selectTriggerClass =
  'inline-flex items-center justify-between gap-2 w-full max-w-md px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const selectContentClass =
  'overflow-hidden rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-[10003]';
const selectItemClass =
  'px-3 py-2 text-sm text-slate-900 dark:text-slate-100 cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-700';

function quotaLabel(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'Unlimited';
  return String(v);
}

export default function TenantSettingsPage() {
  const params = useParams();
  const tenantId = typeof params?.tenantId === 'string' ? params.tenantId : '';
  const { data: session, status } = useSession();
  const { permissions, loading: permLoading } = useTenantPermissions(tenantId);

  const [tenant, setTenant] = useState<TenantSchema | null>(null);
  const [summary, setSummary] = useState<TenantActivitySummarySchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [defaultTheme, setDefaultTheme] = useState<TenantDefaultTheme | ''>('');

  const isPlatformAdmin = Boolean(
    (session?.user as SessionUser | undefined)?.is_administrator
  );
  const canEditAppearance =
    isPlatformAdmin || Boolean(permissions?.is_tenant_admin);

  const load = useCallback(async () => {
    if (!tenantId || status !== 'authenticated' || !session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const opts = getRestClientOptions((session as { accessToken?: string } | null) ?? null);
    try {
      const [t, s] = await Promise.all([
        getTenant(tenantId, opts),
        getTenantActivitySummary(tenantId, opts).catch(() => null),
      ]);
      setTenant(t);
      setSummary(s);
      const meta = (t.metadata ?? {}) as Record<string, unknown>;
      const b = parseTenantBrandingFromMetadata(meta);
      setLogoUrl(b.logoUrl ?? '');
      setFaviconUrl(b.faviconUrl ?? '');
      setPrimaryColor(b.primaryColor ?? '');
      setDefaultTheme(parseTenantDefaultTheme(meta) ?? '');
    } catch (e) {
      setTenant(null);
      setSummary(null);
      setError(
        isForbiddenError(e)
          ? 'You do not have access to this tenant.'
          : e instanceof Error
            ? e.message
            : 'Failed to load tenant settings'
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId, status, session]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    load();
  }, [status, load]);

  const handleSaveAppearance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !tenantId || !canEditAppearance) return;
    setSaveMessage(null);
    setSaving(true);
    const opts = getRestClientOptions((session as { accessToken?: string } | null) ?? null);
    try {
      const body = {
        logo_url: logoUrl.trim() || null,
        favicon_url: faviconUrl.trim() || null,
        primary_color: primaryColor.trim() || null,
        default_theme: defaultTheme === '' ? null : defaultTheme,
      };
      const updated = await updateTenantAppearance(tenantId, body, opts);
      setTenant(updated);
      setSaveMessage('Appearance saved.');
    } catch (err) {
      setSaveMessage(
        isForbiddenError(err)
          ? 'You do not have permission to update appearance.'
          : err instanceof Error
            ? err.message
            : 'Failed to save'
      );
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || loading || permLoading) {
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
        <p className="text-slate-600 dark:text-slate-400">You must be signed in.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <Link
          href="/dashboard/tenants"
          className="inline-flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-4"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to tenants
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Palette className="h-6 w-6 text-indigo-500" aria-hidden />
          Tenant settings
          {tenant ? (
            <span className="text-slate-500 dark:text-slate-400 font-normal">
              — {tenant.name}
            </span>
          ) : null}
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

      {tenant && (
        <>
          <section
            className="mb-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5"
            aria-labelledby="activity-heading"
          >
            <h2
              id="activity-heading"
              className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4"
            >
              <BarChart3 className="h-4 w-4 text-indigo-500" aria-hidden />
              Activity summary
            </h2>
            {summary ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Active projects</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {summary.active_project_count}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Members</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {summary.active_member_count}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Schema versions</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {summary.schema_version_count}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Dashboard visits (7 days)
                  </dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {summary.dashboard_page_visits_last_7_days ?? '—'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Summary unavailable (check tenant access).
              </p>
            )}
          </section>

          <section
            className="mb-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-5"
            aria-labelledby="quotas-heading"
          >
            <h2
              id="quotas-heading"
              className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3"
            >
              Quotas &amp; limits
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Configured on the tenant record. Contact a platform administrator to change
              these values.
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">API rate limit (RPM)</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">
                  {quotaLabel(tenant.rate_limit_requests_per_minute)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Max projects</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">
                  {quotaLabel(tenant.max_projects)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Max versions / project</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">
                  {quotaLabel(tenant.max_versions_per_project)}
                </dd>
              </div>
            </dl>
          </section>

          <section
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5"
            aria-labelledby="appearance-heading"
          >
            <h2
              id="appearance-heading"
              className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4"
            >
              Branding &amp; theme
            </h2>
            {!canEditAppearance && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Only tenant or platform administrators can edit appearance settings.
              </p>
            )}
            <form onSubmit={handleSaveAppearance} className="space-y-4">
              <div className="space-y-2">
                <Label.Root
                  htmlFor="tenant-logo-url"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Logo URL
                </Label.Root>
                <input
                  id="tenant-logo-url"
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  disabled={!canEditAppearance || saving}
                  placeholder="https://…"
                  className="w-full max-w-md px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
              <div className="space-y-2">
                <Label.Root
                  htmlFor="tenant-favicon-url"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Favicon URL
                </Label.Root>
                <input
                  id="tenant-favicon-url"
                  type="url"
                  value={faviconUrl}
                  onChange={(e) => setFaviconUrl(e.target.value)}
                  disabled={!canEditAppearance || saving}
                  placeholder="https://…"
                  className="w-full max-w-md px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
              <div className="space-y-2">
                <Label.Root
                  htmlFor="tenant-primary-color"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Primary color
                </Label.Root>
                <input
                  id="tenant-primary-color"
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  disabled={!canEditAppearance || saving}
                  placeholder="#3366cc"
                  className="w-full max-w-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
              </div>
              <div className="space-y-2">
                <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Default theme
                </Label.Root>
                <Select.Root
                  value={defaultTheme === '' ? 'inherit' : defaultTheme}
                  onValueChange={(v) =>
                    setDefaultTheme(v === 'inherit' ? '' : (v as TenantDefaultTheme))
                  }
                  disabled={!canEditAppearance || saving}
                >
                  <Select.Trigger className={selectTriggerClass} aria-label="Default theme">
                    <Select.Value placeholder="System default" />
                    <Select.Icon>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      className={selectContentClass}
                      position="popper"
                      sideOffset={4}
                    >
                      <Select.Viewport>
                        <Select.Item value="inherit" className={selectItemClass}>
                          <Select.ItemText>System default (unset)</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="light" className={selectItemClass}>
                          <Select.ItemText>Light</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="dark" className={selectItemClass}>
                          <Select.ItemText>Dark</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="system" className={selectItemClass}>
                          <Select.ItemText>Match device</Select.ItemText>
                        </Select.Item>
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
              {saveMessage && (
                <p
                  className={`text-sm ${saveMessage.includes('saved') ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-300'}`}
                  role="status"
                >
                  {saveMessage}
                </p>
              )}
              {canEditAppearance && (
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    'Save appearance'
                  )}
                </button>
              )}
            </form>
          </section>
        </>
      )}
    </div>
  );
}
