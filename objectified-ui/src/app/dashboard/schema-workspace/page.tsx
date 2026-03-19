'use client';

/**
 * Multi-schema workspace: view and compare multiple schemas (versions or revisions)
 * side-by-side with diff summary. Supports code generation via "Open in Data Designer".
 * Reference: GitHub #124.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  Loader2,
  GitCompare,
  PenTool,
  Columns3,
  ArrowRight,
  FileCode,
} from 'lucide-react';
import {
  listMyTenants,
  listProjects,
  listVersions,
  pullVersion,
  listVersionSnapshotsMetadata,
  getRestClientOptions,
  isForbiddenError,
  type TenantSchema,
  type ProjectSchema,
  type VersionSchema,
  type VersionSnapshotMetadataSchema,
  type VersionPullResponse,
  type RestClientOptions,
} from '@lib/api/rest-client';
import {
  compareSchemas,
  type ClassLike,
  type CompareSchemasResult,
} from '@/app/dashboard/utils/compareSchemas';

const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';
const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

type SchemaSlot = {
  versionId: string;
  versionName: string;
  revision: number | null;
  loading: boolean;
  error: string | null;
  data: VersionPullResponse | null;
};

function getClasses(slot: SchemaSlot): Record<string, unknown>[] {
  if (!slot.data?.classes) return [];
  return slot.data.classes;
}

function slotLabel(slot: SchemaSlot): string {
  if (!slot.versionName) return '—';
  return slot.revision != null
    ? `${slot.versionName} (r${slot.revision})`
    : slot.versionName;
}

export default function SchemaWorkspacePage() {
  const { data: session, status } = useSession();
  const [tenants, setTenants] = useState<TenantSchema[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSchema[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionSchema[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leftSlot, setLeftSlot] = useState<SchemaSlot>({
    versionId: '',
    versionName: '',
    revision: null,
    loading: false,
    error: null,
    data: null,
  });
  const [rightSlot, setRightSlot] = useState<SchemaSlot>({
    versionId: '',
    versionName: '',
    revision: null,
    loading: false,
    error: null,
    data: null,
  });

  const [leftVersionId, setLeftVersionId] = useState('');
  const [leftRevision, setLeftRevision] = useState<number | ''>('');
  const [leftRevisions, setLeftRevisions] = useState<VersionSnapshotMetadataSchema[]>([]);
  const [rightVersionId, setRightVersionId] = useState('');
  const [rightRevision, setRightRevision] = useState<number | ''>('');
  const [rightRevisions, setRightRevisions] = useState<VersionSnapshotMetadataSchema[]>([]);

  const opts = useMemo<RestClientOptions>(
    () => getRestClientOptions((session as { accessToken?: string } | null) ?? null),
    [(session as { accessToken?: string } | null)?.accessToken]
  );

  const fetchTenants = useCallback(async () => {
    if (status !== 'authenticated' || !session) return;
    setError(null);
    setTenantsLoading(true);
    try {
      const data = await listMyTenants(opts);
      setTenants(data);
      setSelectedTenantId((prev) => (prev ? prev : data.length > 0 ? data[0].id : null));
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view tenants.'
          : e instanceof Error
            ? e.message
            : 'Failed to load tenants'
      );
    } finally {
      setTenantsLoading(false);
    }
  }, [status, session, opts]);

  const fetchProjects = useCallback(async () => {
    if (status !== 'authenticated' || !selectedTenantId) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await listProjects(selectedTenantId, opts);
      setProjects(data);
      setSelectedProjectId((prev) => (prev ? prev : data.length > 0 ? data[0].id : null));
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view projects.'
          : e instanceof Error
            ? e.message
            : 'Failed to load projects'
      );
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [status, selectedTenantId, opts]);

  const fetchVersions = useCallback(async () => {
    if (status !== 'authenticated' || !selectedTenantId || !selectedProjectId) {
      setVersions([]);
      return;
    }
    setError(null);
    try {
      const data = await listVersions(selectedTenantId, selectedProjectId, opts);
      setVersions(data);
    } catch (e) {
      setError(
        isForbiddenError(e)
          ? 'You do not have permission to view versions.'
          : e instanceof Error
            ? e.message
            : 'Failed to load versions'
      );
      setVersions([]);
    }
  }, [status, selectedTenantId, selectedProjectId, opts]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchVersions();
    } else {
      setVersions([]);
    }
  }, [selectedProjectId, fetchVersions]);

  const fetchRevisionsForVersion = useCallback(
    async (versionId: string): Promise<VersionSnapshotMetadataSchema[]> => {
      if (!versionId) return [];
      try {
        return await listVersionSnapshotsMetadata(versionId, opts);
      } catch {
        return [];
      }
    },
    [opts]
  );

  useEffect(() => {
    if (!leftVersionId) {
      setLeftRevisions([]);
      setLeftRevision('');
      return;
    }
    fetchRevisionsForVersion(leftVersionId).then((list) => {
      setLeftRevisions(list);
      setLeftRevision('');
    });
  }, [leftVersionId, fetchRevisionsForVersion]);

  useEffect(() => {
    if (!rightVersionId) {
      setRightRevisions([]);
      setRightRevision('');
      return;
    }
    fetchRevisionsForVersion(rightVersionId).then((list) => {
      setRightRevisions(list);
      setRightRevision('');
    });
  }, [rightVersionId, fetchRevisionsForVersion]);

  const loadSlot = useCallback(
    async (
      versionId: string,
      revision: number | null,
      versionName: string,
      setSlot: React.Dispatch<React.SetStateAction<SchemaSlot>>
    ) => {
      if (!versionId) return;
      setSlot((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await pullVersion(
          versionId,
          opts,
          revision ?? undefined,
          undefined
        );
        setSlot({
          versionId,
          versionName,
          revision,
          loading: false,
          error: null,
          data: res,
        });
      } catch (e) {
        setSlot((prev) => ({
          ...prev,
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load schema',
          data: null,
        }));
      }
    },
    [opts]
  );

  const handleLoadBoth = useCallback(() => {
    const leftVer = versions.find((v) => v.id === leftVersionId);
    const rightVer = versions.find((v) => v.id === rightVersionId);
    const leftRev = leftRevision === '' ? null : Number(leftRevision);
    const rightRev = rightRevision === '' ? null : Number(rightRevision);
    if (leftVersionId && leftVer) {
      loadSlot(leftVersionId, leftRev, leftVer.name ?? '', setLeftSlot);
    } else {
      setLeftSlot((prev) => ({ ...prev, data: null, error: null }));
    }
    if (rightVersionId && rightVer) {
      loadSlot(rightVersionId, rightRev, rightVer.name ?? '', setRightSlot);
    } else {
      setRightSlot((prev) => ({ ...prev, data: null, error: null }));
    }
  }, [
    leftVersionId,
    rightVersionId,
    leftRevision,
    rightRevision,
    versions,
    loadSlot,
  ]);

  const diffResult: CompareSchemasResult | null = useMemo(() => {
    const leftClasses = getClasses(leftSlot) as ClassLike[];
    const rightClasses = getClasses(rightSlot) as ClassLike[];
    if (leftClasses.length === 0 && rightClasses.length === 0) return null;
    return compareSchemas(leftClasses, rightClasses);
  }, [leftSlot.data, rightSlot.data]);

  const hasDiff =
    diffResult &&
    (diffResult.added_class_names.length > 0 ||
      diffResult.removed_class_names.length > 0 ||
      diffResult.modified_classes.length > 0);

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
          Schema workspace
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Select a tenant to compare schemas. You need access to at least one tenant.
        </p>
      </div>
    );
  }

  if (projects.length === 0 && selectedTenantId && !loading && !error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Schema workspace
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          No projects in this tenant. Create a project from the Projects page.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center">
            <Columns3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Schema workspace
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Compare multiple schemas side-by-side and generate code (GitHub #124)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedTenantId ?? ''}
            onChange={(e) => {
              const v = e.target.value || null;
              setSelectedTenantId(v);
              setSelectedProjectId(null);
              setProjects([]);
              setVersions([]);
              setLeftVersionId('');
              setRightVersionId('');
              setLeftRevision('');
              setRightRevision('');
              setLeftRevisions([]);
              setRightRevisions([]);
              setLeftSlot({ versionId: '', versionName: '', revision: null, loading: false, error: null, data: null });
              setRightSlot({ versionId: '', versionName: '', revision: null, loading: false, error: null, data: null });
            }}
            className={inputClass}
            style={{ width: 'auto', minWidth: 140 }}
            aria-label="Select tenant"
          >
            <option value="">Select tenant</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={selectedProjectId ?? ''}
            onChange={(e) => {
              setSelectedProjectId(e.target.value || null);
              setVersions([]);
              setLeftVersionId('');
              setRightVersionId('');
              setLeftRevision('');
              setRightRevision('');
              setLeftRevisions([]);
              setRightRevisions([]);
              setLeftSlot({ versionId: '', versionName: '', revision: null, loading: false, error: null, data: null });
              setRightSlot({ versionId: '', versionName: '', revision: null, loading: false, error: null, data: null });
            }}
            className={inputClass}
            style={{ width: 'auto', minWidth: 140 }}
            aria-label="Select project"
          >
            <option value="">Select project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
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

      {!selectedProjectId ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-8 text-center text-slate-500 dark:text-slate-400">
          Select a project to compare schemas.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Left schema
                </span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label htmlFor="left-version" className={labelClass}>
                    Version
                  </label>
                  <select
                    id="left-version"
                    value={leftVersionId}
                    onChange={(e) => setLeftVersionId(e.target.value)}
                    className={`${inputClass} mt-1`}
                    aria-label="Left version"
                  >
                    <option value="">Select version</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                {leftVersionId && leftRevisions.length > 0 && (
                  <div>
                    <label htmlFor="left-revision" className={labelClass}>
                      Revision (optional)
                    </label>
                    <select
                      id="left-revision"
                      value={leftRevision === '' ? '' : String(leftRevision)}
                      onChange={(e) =>
                        setLeftRevision(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className={`${inputClass} mt-1`}
                      aria-label="Left revision"
                    >
                      <option value="">Current</option>
                      {leftRevisions.map((s) => (
                        <option key={s.id} value={s.revision}>
                          r{s.revision}
                          {s.label ? ` ${s.label}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {leftSlot.error && (
                  <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                    {leftSlot.error}
                  </p>
                )}
                {leftSlot.loading && (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                )}
                {leftSlot.data && !leftSlot.loading && (
                  <>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {getClasses(leftSlot).length} class
                      {getClasses(leftSlot).length !== 1 ? 'es' : ''}
                    </div>
                    {selectedTenantId && selectedProjectId && leftSlot.versionId && (
                      <Link
                        href={`/data-designer?${new URLSearchParams({ tenantId: selectedTenantId, projectId: selectedProjectId, versionId: leftSlot.versionId }).toString()}`}
                        className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <PenTool className="h-4 w-4" />
                        Open in Data Designer
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Right schema
                </span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label htmlFor="right-version" className={labelClass}>
                    Version
                  </label>
                  <select
                    id="right-version"
                    value={rightVersionId}
                    onChange={(e) => setRightVersionId(e.target.value)}
                    className={`${inputClass} mt-1`}
                    aria-label="Right version"
                  >
                    <option value="">Select version</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                {rightVersionId && rightRevisions.length > 0 && (
                  <div>
                    <label htmlFor="right-revision" className={labelClass}>
                      Revision (optional)
                    </label>
                    <select
                      id="right-revision"
                      value={rightRevision === '' ? '' : String(rightRevision)}
                      onChange={(e) =>
                        setRightRevision(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className={`${inputClass} mt-1`}
                      aria-label="Right revision"
                    >
                      <option value="">Current</option>
                      {rightRevisions.map((s) => (
                        <option key={s.id} value={s.revision}>
                          r{s.revision}
                          {s.label ? ` ${s.label}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {rightSlot.error && (
                  <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                    {rightSlot.error}
                  </p>
                )}
                {rightSlot.loading && (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                )}
                {rightSlot.data && !rightSlot.loading && (
                  <>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {getClasses(rightSlot).length} class
                      {getClasses(rightSlot).length !== 1 ? 'es' : ''}
                    </div>
                    {selectedTenantId && selectedProjectId && rightSlot.versionId && (
                      <Link
                        href={`/data-designer?${new URLSearchParams({ tenantId: selectedTenantId, projectId: selectedProjectId, versionId: rightSlot.versionId }).toString()}`}
                        className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <PenTool className="h-4 w-4" />
                        Open in Data Designer
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button
              type="button"
              onClick={handleLoadBoth}
              disabled={(!leftVersionId && !rightVersionId) || leftSlot.loading || rightSlot.loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:pointer-events-none"
            >
              <GitCompare className="h-4 w-4" />
              Load & compare
            </button>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Load one or both sides to see schema and diff.
            </span>
          </div>

          {(leftSlot.data || rightSlot.data) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {slotLabel(leftSlot)}
                  </span>
                </div>
                <div className="p-4 max-h-64 overflow-auto">
                  {getClasses(leftSlot).length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No classes</p>
                  ) : (
                    <ul className="space-y-1 text-sm font-mono text-slate-700 dark:text-slate-300">
                      {(getClasses(leftSlot) as ClassLike[]).map(
                        (c, i) => (
                          <li key={i}>
                            {c.name ?? '—'}
                            {(c.properties?.length ?? 0) > 0 && (
                              <span className="text-slate-500 dark:text-slate-400 ml-2">
                                ({c.properties!.length} props)
                              </span>
                            )}
                          </li>
                        )
                      )}
                    </ul>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {slotLabel(rightSlot)}
                  </span>
                </div>
                <div className="p-4 max-h-64 overflow-auto">
                  {getClasses(rightSlot).length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No classes</p>
                  ) : (
                    <ul className="space-y-1 text-sm font-mono text-slate-700 dark:text-slate-300">
                      {(getClasses(rightSlot) as ClassLike[]).map(
                        (c, i) => (
                          <li key={i}>
                            {c.name ?? '—'}
                            {(c.properties?.length ?? 0) > 0 && (
                              <span className="text-slate-500 dark:text-slate-400 ml-2">
                                ({c.properties!.length} props)
                              </span>
                            )}
                          </li>
                        )
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {leftSlot.data && rightSlot.data && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                <GitCompare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Diff (left → right)
                </span>
              </div>
              <div className="p-4">
                {!hasDiff ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No differences between the two schemas.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {diffResult!.added_class_names.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-400 mb-2">
                          Added classes
                        </h4>
                        <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-300 space-y-0.5 font-mono">
                          {diffResult!.added_class_names.map((name) => (
                            <li key={name}>{name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {diffResult!.removed_class_names.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400 mb-2">
                          Removed classes
                        </h4>
                        <ul className="list-disc list-inside text-sm text-slate-700 dark:text-slate-300 space-y-0.5 font-mono">
                          {diffResult!.removed_class_names.map((name) => (
                            <li key={name}>{name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {diffResult!.modified_classes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">
                          Modified classes
                        </h4>
                        <ul className="space-y-3">
                          {diffResult!.modified_classes.map((mc) => (
                            <li
                              key={mc.class_name}
                              className="text-sm border-l-2 border-amber-400 dark:border-amber-500 pl-3"
                            >
                              <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                                {mc.class_name}
                              </span>
                              <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
                                {(mc.added_property_names?.length ?? 0) > 0 &&
                                  mc.added_property_names!.map((p) => (
                                    <li key={p} className="font-mono">
                                      + {p}
                                    </li>
                                  ))}
                                {(mc.removed_property_names?.length ?? 0) > 0 &&
                                  mc.removed_property_names!.map((p) => (
                                    <li key={p} className="font-mono">
                                      − {p}
                                    </li>
                                  ))}
                                {(mc.modified_property_names?.length ?? 0) > 0 &&
                                  mc.modified_property_names!.map((p) => (
                                    <li key={p} className="font-mono">
                                      ~ {p}
                                    </li>
                                  ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedProjectId && (leftSlot.data || rightSlot.data) && (
            <div className="mt-6 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <FileCode className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Code generation
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Open a schema in the Data Designer to generate TypeScript, Prisma, GraphQL, Go,
                Pydantic, SQL, or custom Mustache from that version. Use the &quot;Open in Data
                Designer&quot; links above for the left or right schema.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
