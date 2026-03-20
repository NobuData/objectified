'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Search,
  X,
  ChevronRight,
} from 'lucide-react';
import {
  getRestClientOptions,
  listMyTenants,
  listProjects,
  listVersions,
  type ProjectSchema,
  type VersionSchema,
  type TenantSchema,
} from '@lib/api/rest-client';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useCanvasSidebarActionsOptional } from '@/app/contexts/CanvasSidebarActionsContext';
import { useCanvasFocusModeOptional } from '@/app/contexts/CanvasFocusModeContext';
import { getStableClassId, type StudioClass } from '@lib/studio/types';
import { getModifierLabel } from '@lib/studio/useUndoKeyboard';

type SearchProjectResult = {
  kind: 'project';
  project: ProjectSchema;
};

type SearchVersionResult = {
  kind: 'version';
  version: VersionSchema;
};

type SearchClassResult = {
  kind: 'class';
  classId: string;
  label: string;
};

type SearchResult = SearchProjectResult | SearchVersionResult | SearchClassResult;

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export default function GlobalSearchDialog({
  triggerClassName,
}: {
  triggerClassName?: string;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const workspace = useWorkspaceOptional();
  const studio = useStudioOptional();
  const canvasSidebarActions = useCanvasSidebarActionsOptional();
  const focusMode = useCanvasFocusModeOptional();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenants, setTenants] = useState<TenantSchema[]>([]);
  const [projects, setProjects] = useState<ProjectSchema[]>([]);
  const [versions, setVersions] = useState<VersionSchema[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const queryNorm = useMemo(() => normalizeQuery(query), [query]);
  const projectsForSearch = projects;
  const versionsForSearch = versions;

  const studioClasses = useMemo((): StudioClass[] => studio?.state?.classes ?? [], [studio?.state]);

  const classResults = useMemo(() => {
    if (!queryNorm) return [];
    if (!studioClasses.length) return [];

    const matches = studioClasses
      .map((cls) => {
        const label = (cls.name ?? '').trim();
        return label ? { classId: getStableClassId(cls), label } : null;
      })
      .filter((x): x is { classId: string; label: string } => x !== null)
      .filter((x) => x.label.toLowerCase().includes(queryNorm));

    return matches.sort((a, b) => a.label.localeCompare(b.label)).slice(0, 8);
  }, [queryNorm, studioClasses]);

  const projectResults = useMemo(() => {
    const list = projectsForSearch;
    if (!queryNorm) return list.slice(0, 8);
    return list
      .filter((p) => p.name.toLowerCase().includes(queryNorm))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [projectsForSearch, queryNorm]);

  const versionResults = useMemo(() => {
    const list = versionsForSearch;
    if (!queryNorm) return list.slice(0, 8);
    return list
      .filter((v) => v.name.toLowerCase().includes(queryNorm))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [versionsForSearch, queryNorm]);

  const selectedWorkspaceTenantId = workspace?.tenant?.id ?? null;
  const selectedWorkspaceProjectId = workspace?.project?.id ?? null;

  const refreshSearchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const sessionToken = (session as { accessToken?: string } | null)?.accessToken ?? null;
      const opts = getRestClientOptions(sessionToken ? { accessToken: sessionToken } : null);

      const effectiveTenantId = selectedWorkspaceTenantId;

      if (effectiveTenantId) {
        const [projList, verList] = await Promise.all([
          listProjects(effectiveTenantId, opts),
          selectedWorkspaceProjectId
            ? listVersions(effectiveTenantId, selectedWorkspaceProjectId, opts)
            : Promise.resolve([] as VersionSchema[]),
        ]);
        setProjects(projList);
        setVersions(verList);
        setTenants([]);
        return;
      }

      // Fallback: no workspace context (e.g. dashboard pages) — use the first tenant.
      const tenantList = await listMyTenants(opts);
      setTenants(tenantList);
      const fallbackTenant = tenantList[0] ?? null;
      if (!fallbackTenant) {
        setProjects([]);
        setVersions([]);
        return;
      }
      const projList = await listProjects(fallbackTenant.id, opts);
      setProjects(projList);
      const fallbackProject = projList[0] ?? null;
      if (!fallbackProject) {
        setVersions([]);
        return;
      }
      const verList = await listVersions(fallbackTenant.id, fallbackProject.id, opts);
      setVersions(verList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setProjects([]);
      setVersions([]);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [session, selectedWorkspaceTenantId, selectedWorkspaceProjectId]);

  useEffect(() => {
    if (!open) return;
    void refreshSearchData();
  }, [open, refreshSearchData]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Cmd/Ctrl + K opens the palette.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key !== 'k') return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping =
        tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      if (isTyping) return;

      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (result.kind === 'project') {
        if (workspace) {
          workspace.setProject(result.project);
          setOpen(false);
          return;
        }
        setOpen(false);
        router.push('/dashboard/projects');
        return;
      }

      if (result.kind === 'version') {
        if (workspace) {
          workspace.setVersion(result.version);
          setOpen(false);
          return;
        }
        setOpen(false);
        router.push('/dashboard/versions');
        return;
      }

      if (result.kind === 'class') {
        canvasSidebarActions?.zoomToClass(result.classId);
        focusMode?.enterFocusOnNode(result.classId);
        setOpen(false);
      }
    },
    [canvasSidebarActions, focusMode, router, workspace]
  );

  const modLabel = useMemo(() => getModifierLabel(), []);

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700/70 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
        triggerClassName ?? ''
      }`}
      aria-label="Global search"
      title="Global search (Cmd/Ctrl+K)"
    >
      <Search className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Search</span>
      <span className="hidden md:inline-flex items-center gap-1 ml-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
          {modLabel}+K
        </span>
      </span>
    </button>
  );

  const projectItems: SearchResult[] = projectResults.map((p) => ({
    kind: 'project',
    project: p,
  }));
  const versionItems: SearchResult[] = versionResults.map((v) => ({
    kind: 'version',
    version: v,
  }));
  const classItems: SearchResult[] = classResults.map((c) => ({
    kind: 'class',
    classId: c.classId,
    label: c.label,
  }));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {trigger}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-[20%] -translate-x-1/2 z-[10051] w-[95vw] max-w-2xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
          aria-label="Global search dialog"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 min-w-0">
              <Search className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  Global search
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Find projects, versions, or classes
                </span>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                aria-label="Search query"
              />
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Tip: use {modLabel}+K anytime.
            </div>
          </div>

          <div className="px-4 py-3 max-h-[60vh] overflow-auto">
            {error && (
              <div
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm mb-3"
                role="alert"
              >
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-6 text-slate-500 dark:text-slate-400">
                Loading…
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Projects
                    </span>
                  </div>
                  {projectItems.length === 0 ? (
                    <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      No matching projects.
                    </div>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {projectItems.map((item) => {
                        if (item.kind !== 'project') return null;
                        const p = item.project;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                              onClick={() => handleSelect(item)}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {p.name}
                                </span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {p.slug}
                                </span>
                              </span>
                              <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Versions
                    </span>
                  </div>
                  {versionItems.length === 0 ? (
                    <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      No matching versions.
                    </div>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {versionItems.map((item) => {
                        if (item.kind !== 'version') return null;
                        const v = item.version;
                        return (
                          <li key={v.id}>
                            <button
                              type="button"
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                              onClick={() => handleSelect(item)}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {v.name}
                                </span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {v.published ? 'Published' : 'Draft'}
                                </span>
                              </span>
                              <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Classes
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {studioClasses.length ? `${studioClasses.length} available` : 'Load a version to see classes'}
                    </span>
                  </div>
                  {classItems.length === 0 ? (
                    <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      No matching classes.
                    </div>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {classItems.map((item) => {
                        if (item.kind !== 'class') return null;
                        return (
                          <li key={item.classId}>
                            <button
                              type="button"
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                              onClick={() => handleSelect(item)}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {item.label}
                                </span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {item.classId}
                                </span>
                              </span>
                              <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

