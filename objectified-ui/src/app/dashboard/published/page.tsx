'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Loader2, BookOpen, ExternalLink, Lock, LockOpen } from 'lucide-react';
import {
  listProjects,
  listVersions,
  getRestClientOptions,
  isForbiddenError,
  type VersionSchema,
} from '@lib/api/rest-client';
import { useTenantSelection } from '@/app/contexts/TenantSelectionContext';
import { dashboardProjectVersionPath } from '@/lib/dashboard/deepLinks';

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

function getVisibilityLabel(visibility: string | null | undefined): string {
  if (visibility === 'public') return 'Public';
  if (visibility === 'private') return 'Private';
  return '—';
}

interface PublishedVersionRow extends VersionSchema {
  projectName: string;
  tenantId: string;
}

export default function PublishedPage() {
  const { data: session, status } = useSession();
  const { tenants, tenantsLoading, selectedTenantId, setSelectedTenantId } = useTenantSelection();
  const [publishedVersions, setPublishedVersions] = useState<PublishedVersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opts = useMemo(
    () =>
      getRestClientOptions(
        (session as { accessToken?: string } | null) ?? null
      ),
    [(session as { accessToken?: string } | null)?.accessToken]
  );

  const fetchPublishedVersions = useCallback(async () => {
    if (status !== 'authenticated' || !selectedTenantId) {
      setPublishedVersions([]);
      setLoading(false);
      return;
    }
    const tenantIdAtStart = selectedTenantId;
    setError(null);
    setLoading(true);
    try {
      const projectList = await listProjects(tenantIdAtStart, opts);
      const projectVersionRowsPromises = projectList.map(async (project) => {
        const versions = await listVersions(tenantIdAtStart, project.id, opts);
        const published = versions.filter((v) => v.published);
          return published.map<PublishedVersionRow>((v) => ({
              ...v,
              projectName: project.name,
              tenantId: tenantIdAtStart,
            }));
      });
      const projectVersionRowsNested = await Promise.all(projectVersionRowsPromises);
      const rows: PublishedVersionRow[] = projectVersionRowsNested.flat();
      rows.sort(
        (a, b) =>
          new Date(b.published_at ?? 0).getTime() -
          new Date(a.published_at ?? 0).getTime()
      );
      if (selectedTenantId !== tenantIdAtStart) return;
      setPublishedVersions(rows);
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view versions.'
          : e instanceof Error
            ? e.message
            : 'Failed to load published versions'
      );
      setPublishedVersions([]);
    } finally {
      setLoading(false);
    }
  }, [status, selectedTenantId, opts]);

  useEffect(() => {
    if (selectedTenantId) {
      fetchPublishedVersions();
    } else {
      setPublishedVersions([]);
    }
  }, [selectedTenantId, fetchPublishedVersions]);

  if (status === 'loading') {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (status === 'unauthenticated' || !session) {
    return null;
  }

  if (tenantsLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (tenants.length === 0 && !error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Published
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Select a tenant to view published versions. You need access to at
          least one tenant.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Published
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Browse published specification versions and open them in Studio
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedTenantId ?? ''}
            onChange={(e) => {
              const newTenantId = e.target.value || null;
              setSelectedTenantId(newTenantId);
              setPublishedVersions([]);
            }}
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Select tenant"
          >
            <option value="">Select tenant</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      ) : publishedVersions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-slate-400 dark:text-slate-500 mb-3" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">
            No published versions
          </p>
          <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">
            Publish versions from the Publish page to see them here.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Visibility
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Published at
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {publishedVersions.map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {v.projectName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                          {v.name}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                          title="Published"
                        >
                          {v.visibility === 'public' ? (
                            <LockOpen className="h-3 w-3" />
                          ) : (
                            <Lock className="h-3 w-3" />
                          )}
                          {getVisibilityLabel(v.visibility)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate">
                        {v.description ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {getVisibilityLabel(v.visibility)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {v.published_at
                        ? formatDateTime(v.published_at)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={dashboardProjectVersionPath(v.project_id, v.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        aria-label={`Open ${v.name} in Studio`}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open in Studio
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
