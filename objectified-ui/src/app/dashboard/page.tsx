'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Clock3, ExternalLink, FolderPlus, History, Layers3, Loader2 } from 'lucide-react';
import {
  getRestClientOptions,
  listProjects,
  listVersions,
  pullVersion,
  type ProjectSchema,
  type VersionSchema,
} from '@lib/api/rest-client';
import { useTenantSelection } from '@/app/contexts/TenantSelectionContext';
import { dataDesignerDeepLink } from '@/lib/dashboard/deepLinks';
import { getCircularDependencyEdgeIds, getSchemaMaxDepth } from '@lib/studio/schemaMetrics';

const LAST_OPENED_VERSION_STORAGE_KEY = 'objectified:dashboard:last-opened-version';
const RECENT_LIMIT = 6;
const METRICS_LIMIT = 4;

type RecentVersion = {
  version: VersionSchema;
  project: ProjectSchema;
};

type LastOpenedVersion = {
  tenantId: string;
  projectId: string;
  projectName?: string;
  versionId: string;
  versionName?: string;
  readOnly?: boolean;
};

type VersionMetrics = {
  classCount: number;
  depth: number;
  circularRefs: number;
};

function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractRefs(obj: unknown, classNames: Set<string>): Set<string> {
  const out = new Set<string>();
  if (obj == null || typeof obj !== 'object') return out;

  const visit = (val: unknown): void => {
    if (val == null) return;
    if (Array.isArray(val)) {
      for (const item of val) visit(item);
      return;
    }
    if (typeof val === 'object') {
      const value = val as Record<string, unknown>;
      if (typeof value.$ref === 'string') {
        const ref = value.$ref;
        const match = ref.match(/#\/(?:components\/schemas|\$defs)\/(.+)$/);
        const name = match ? match[1].trim() : ref.split('/').pop()?.trim();
        if (name && classNames.has(name)) out.add(name);
      }
      for (const nested of Object.values(value)) {
        visit(nested);
      }
    }
  };

  visit(obj);
  return out;
}

function computeSchemaMetrics(classes: Record<string, unknown>[]): VersionMetrics {
  const classNames = new Set(
    classes
      .map((entry) => (typeof entry.name === 'string' ? entry.name.trim() : ''))
      .filter(Boolean)
  );
  const edgeSet = new Set<string>();
  const edges: Array<{ id: string; source: string; target: string }> = [];

  for (const cls of classes) {
    const source = typeof cls.name === 'string' ? cls.name.trim() : '';
    if (!source || !classNames.has(source)) continue;
    const properties = Array.isArray(cls.properties)
      ? (cls.properties as Array<Record<string, unknown>>)
      : [];
    for (const property of properties) {
      const data =
        (property.data as Record<string, unknown> | undefined) ??
        (property.property_data as Record<string, unknown> | undefined);
      if (!data) continue;
      const refs = extractRefs(data, classNames);
      for (const target of refs) {
        if (target === source) continue;
        const edgeId = `${source}->${target}`;
        if (edgeSet.has(edgeId)) continue;
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source,
          target,
        });
      }
    }
  }

  return {
    classCount: classNames.size,
    depth: getSchemaMaxDepth(edges),
    circularRefs: getCircularDependencyEdgeIds(edges).size,
  };
}

export default function DashboardHomePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { selectedTenantId, tenants, setSelectedTenantId } = useTenantSelection();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentVersions, setRecentVersions] = useState<RecentVersion[]>([]);
  const [metricsByVersionId, setMetricsByVersionId] = useState<Record<string, VersionMetrics>>({});
  const [lastOpenedVersion, setLastOpenedVersion] = useState<LastOpenedVersion | null>(null);
  const fetchRequestIdRef = useRef(0);

  const options = useMemo(
    () =>
      getRestClientOptions((session as { accessToken?: string } | null) ?? null),
    [(session as { accessToken?: string } | null)?.accessToken]
  );

  useEffect(() => {
    if (selectedTenantId || tenants.length === 0) return;
    setSelectedTenantId(tenants[0].id);
  }, [selectedTenantId, tenants, setSelectedTenantId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAST_OPENED_VERSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<LastOpenedVersion>;
      if (!parsed.tenantId || !parsed.projectId || !parsed.versionId) return;
      setLastOpenedVersion({
        tenantId: parsed.tenantId,
        projectId: parsed.projectId,
        projectName: parsed.projectName,
        versionId: parsed.versionId,
        versionName: parsed.versionName,
        readOnly: parsed.readOnly,
      });
    } catch {
      setLastOpenedVersion(null);
    }
  }, []);

  const fetchRecent = useCallback(async () => {
    if (status !== 'authenticated' || !selectedTenantId) {
      setLoading(false);
      setRecentVersions([]);
      setMetricsByVersionId({});
      return;
    }

    fetchRequestIdRef.current += 1;
    const requestId = fetchRequestIdRef.current;

    setLoading(true);
    setError(null);
    try {
      const projects = await listProjects(selectedTenantId, options);
      if (requestId !== fetchRequestIdRef.current) return;

      const versionsByProject = await Promise.all(
        projects.map(async (project) => ({
          project,
          versions: await listVersions(selectedTenantId, project.id, options),
        }))
      );
      if (requestId !== fetchRequestIdRef.current) return;

      const top: { project: ProjectSchema; version: VersionSchema }[] = [];

      versionsByProject.forEach(({ project, versions }) => {
        versions.forEach((version) => {
          const timestamp = new Date(version.updated_at ?? version.created_at).getTime();

          // Skip versions that can't displace the oldest entry when the heap is full.
          if (top.length >= RECENT_LIMIT) {
            const oldest = top[top.length - 1];
            const oldestTimestamp = new Date(
              oldest.version.updated_at ?? oldest.version.created_at
            ).getTime();
            if (timestamp < oldestTimestamp) return;
          }

          let insertIndex = 0;
          while (insertIndex < top.length) {
            const currentTimestamp = new Date(
              top[insertIndex].version.updated_at ?? top[insertIndex].version.created_at
            ).getTime();
            if (timestamp >= currentTimestamp) {
              break;
            }
            insertIndex += 1;
          }

          top.splice(insertIndex, 0, { project, version });
          if (top.length > RECENT_LIMIT) {
            top.pop();
          }
        });
      });

      const recent = top;

      if (requestId !== fetchRequestIdRef.current) return;
      setRecentVersions(recent);
      setMetricsByVersionId({});

      await Promise.all(
        recent.slice(0, METRICS_LIMIT).map(async ({ version }) => {
          try {
            const pulled = await pullVersion(version.id, options);
            const classes = Array.isArray(pulled.classes) ? pulled.classes : [];
            const metrics = computeSchemaMetrics(classes);
            if (requestId !== fetchRequestIdRef.current) return;
            setMetricsByVersionId((prev) => ({ ...prev, [version.id]: metrics }));
          } catch {
            // Keep metrics optional on cards if fetch/parse fails.
          }
        })
      );
    } catch (e) {
      if (requestId !== fetchRequestIdRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load recent activity.');
      setRecentVersions([]);
      setMetricsByVersionId({});
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [options, selectedTenantId, status]);

  useEffect(() => {
    void fetchRecent();
  }, [fetchRecent]);

  const canOpenLastVersion = lastOpenedVersion?.tenantId === selectedTenantId;

  return (
    <div className="p-6 print:bg-white space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2 print:text-black">
          Dashboard
        </h1>
        <p className="text-slate-600 dark:text-slate-400 print:text-slate-800">
          Quick actions and recent version activity for the selected tenant.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Quick actions
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push('/dashboard/projects?new=1')}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <FolderPlus className="h-4 w-4" />
            New project
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard/versions')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <History className="h-4 w-4" />
            Versions
          </button>
          <button
            type="button"
            onClick={() => {
              if (!lastOpenedVersion) return;
              router.push(
                dataDesignerDeepLink({
                  tenantId: lastOpenedVersion.tenantId,
                  projectId: lastOpenedVersion.projectId,
                  versionId: lastOpenedVersion.versionId,
                  readOnly: !!lastOpenedVersion.readOnly,
                })
              );
            }}
            disabled={!lastOpenedVersion || !canOpenLastVersion}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              !lastOpenedVersion
                ? 'Open a version in Studio to enable this quick action.'
                : !canOpenLastVersion
                  ? 'Last opened version belongs to a different tenant.'
                  : undefined
            }
          >
            <ExternalLink className="h-4 w-4" />
            Open last version
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recently updated
          </h2>
          <button
            type="button"
            onClick={() => void fetchRecent()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Clock3 className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading recent activity...
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/20">
            {error}
          </div>
        ) : recentVersions.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No version activity yet for this tenant.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {recentVersions.map(({ version, project }) => {
              const metrics = metricsByVersionId[version.id];
              return (
                <li key={version.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {version.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {project.name} - Updated {formatDateTime(version.updated_at ?? version.created_at)}
                      </p>
                      <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                        {metrics ? (
                          <span className="inline-flex items-center gap-3">
                            <span className="inline-flex items-center gap-1">
                              <Layers3 className="h-3.5 w-3.5" />
                              Classes {metrics.classCount}
                            </span>
                            <span>Depth {metrics.depth}</span>
                            <span>Circular refs {metrics.circularRefs}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">
                            Schema metrics pending...
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          dataDesignerDeepLink({
                            tenantId: selectedTenantId ?? project.tenant_id,
                            projectId: project.id,
                            versionId: version.id,
                            readOnly: !!version.published,
                          })
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      Open
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
