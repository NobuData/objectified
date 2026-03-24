'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import * as Select from '@radix-ui/react-select';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  Star,
} from 'lucide-react';
import {
  getRestBaseUrl,
  getRestClientOptions,
  listTenants,
  listProjects,
  listVersions,
  type TenantSchema,
  type ProjectSchema,
  type VersionSchema,
} from '@lib/api/rest-client';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import {
  favoriteVersionIdsForProject,
  isWorkspaceVersionFavorite,
  listWorkspaceRecents,
  recordWorkspaceRecent,
  toggleWorkspaceVersionFavorite,
  type WorkspaceRecentEntry,
} from '@/lib/dashboard/workspaceRecentsFavorites';

function useAuthOptions() {
  const { data: session } = useSession();
  return getRestClientOptions((session as { accessToken?: string } | null) ?? null);
}

function StarToggle({
  tenantId,
  projectId,
  versionId,
  onChange,
}: {
  tenantId: string;
  projectId: string;
  versionId: string;
  onChange: () => void;
}) {
  const active = isWorkspaceVersionFavorite(tenantId, projectId, versionId);
  return (
    <button
      type="button"
      className="inline-flex shrink-0 rounded p-0.5 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-400/10 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      aria-label={active ? 'Remove from pinned versions' : 'Pin version'}
      aria-pressed={active}
      onPointerDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        toggleWorkspaceVersionFavorite(tenantId, projectId, versionId);
        onChange();
      }}
    >
      <Star
        className={`h-3.5 w-3.5 ${active ? 'fill-amber-400 text-amber-500 dark:fill-amber-500 dark:text-amber-300' : 'text-slate-400 dark:text-slate-500'}`}
        strokeWidth={1.75}
      />
    </button>
  );
}

export default function ProjectVersionBar() {
  const options = useAuthOptions();
  const workspace = useWorkspaceOptional();
  const studio = useStudioOptional();
  const [tenants, setTenants] = useState<TenantSchema[]>([]);
  const [projects, setProjects] = useState<ProjectSchema[]>([]);
  const [versions, setVersions] = useState<VersionSchema[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favoritesTick, setFavoritesTick] = useState(0);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [recentsSnapshot, setRecentsSnapshot] = useState<WorkspaceRecentEntry[]>([]);

  const baseUrl = getRestBaseUrl();
  const tenantId = workspace?.tenant?.id ?? null;
  const projectId = workspace?.project?.id ?? null;

  const loadTenants = useCallback(async () => {
    if (!baseUrl) {
      setLoadingTenants(false);
      return;
    }
    setError(null);
    setLoadingTenants(true);
    try {
      const list = await listTenants(options);
      setTenants(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tenants');
      setTenants([]);
    } finally {
      setLoadingTenants(false);
    }
  }, [baseUrl, options.jwt, options.apiKey]);

  const loadProjects = useCallback(async () => {
    if (!baseUrl || !tenantId) {
      setProjects([]);
      setLoadingProjects(false);
      return;
    }
    setError(null);
    setLoadingProjects(true);
    try {
      const list = await listProjects(tenantId, options);
      setProjects(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, [baseUrl, tenantId, options.jwt, options.apiKey]);

  const loadVersions = useCallback(async () => {
    if (!baseUrl || !tenantId || !projectId) {
      setVersions([]);
      setLoadingVersions(false);
      return;
    }
    setError(null);
    setLoadingVersions(true);
    try {
      const list = await listVersions(tenantId, projectId, options);
      setVersions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load versions');
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  }, [baseUrl, tenantId, projectId, options.jwt, options.apiKey]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    if (tenantId) {
      loadProjects();
    } else {
      setProjects([]);
    }
  }, [tenantId, loadProjects]);

  useEffect(() => {
    if (tenantId && projectId) {
      loadVersions();
    } else {
      setVersions([]);
    }
  }, [tenantId, projectId, loadVersions]);

  useEffect(() => {
    if (
      !workspace?.tenant ||
      !workspace.project ||
      !workspace.version ||
      typeof window === 'undefined'
    ) {
      return;
    }
    recordWorkspaceRecent({
      tenantId: workspace.tenant.id,
      tenantName: workspace.tenant.name,
      projectId: workspace.project.id,
      projectName: workspace.project.name,
      versionId: workspace.version.id,
      versionName: workspace.version.name,
      openedAt: new Date().toISOString(),
    });
  }, [
    workspace?.tenant,
    workspace?.project,
    workspace?.version,
  ]);

  useEffect(() => {
    if (!recentsOpen || typeof window === 'undefined') return;
    setRecentsSnapshot(listWorkspaceRecents());
  }, [recentsOpen]);

  const onTenantChange = useCallback(
    (id: string) => {
      if (!workspace) return;
      const t = tenants.find((x) => x.id === id) ?? null;
      workspace.setTenant(t);
    },
    [workspace, tenants]
  );

  const onProjectChange = useCallback(
    (id: string) => {
      if (!workspace) return;
      const p = projects.find((x) => x.id === id) ?? null;
      workspace.setProject(p);
    },
    [workspace, projects]
  );

  const onVersionChange = useCallback(
    (id: string) => {
      if (!workspace) return;
      const v = versions.find((x) => x.id === id) ?? null;
      workspace.setVersion(v);
    },
    [workspace, versions]
  );

  const applyRecentEntry = useCallback(
    (entry: WorkspaceRecentEntry) => {
      if (!workspace) return;
      const tenant: TenantSchema = {
        id: entry.tenantId,
        name: entry.tenantName,
      } as TenantSchema;
      const project: ProjectSchema = {
        id: entry.projectId,
        name: entry.projectName,
      } as ProjectSchema;
      const version: VersionSchema = {
        id: entry.versionId,
        name: entry.versionName,
      } as VersionSchema;
      workspace.replaceWorkspace(tenant, project, version);
      setRecentsOpen(false);
    },
    [workspace]
  );

  const { favoritesList, othersList } = useMemo(() => {
    if (!tenantId || !projectId) {
      return { favoritesList: [] as VersionSchema[], othersList: versions };
    }
    void favoritesTick;
    const favoriteIdsOrdered = favoriteVersionIdsForProject(tenantId, projectId);
    const favSet = new Set(favoriteIdsOrdered);
    const favoritesListInner = favoriteIdsOrdered
      .map((id) => versions.find((v) => v.id === id))
      .filter((v): v is VersionSchema => v != null);
    const othersListInner = versions.filter((v) => !favSet.has(v.id));
    return { favoritesList: favoritesListInner, othersList: othersListInner };
  }, [tenantId, projectId, versions, favoritesTick]);

  const studioMatchesSelection =
    Boolean(studio?.state?.versionId) &&
    Boolean(workspace?.version?.id) &&
    studio?.state?.versionId === workspace?.version?.id;

  const syncBadges = useMemo(() => {
    if (!studioMatchesSelection || !studio) return [];
    const out: { key: string; label: string; className: string; title: string }[] = [];
    if (studio.isDirty) {
      out.push({
        key: 'dirty',
        label: 'Uncommitted',
        title: 'Local edits are not committed yet',
        className:
          'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
      });
    }
    if (studio.hasUnpushedCommits) {
      out.push({
        key: 'unpushed',
        label: 'Unpushed',
        title: 'Commits exist that have not been pushed to another version',
        className:
          'bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200',
      });
    }
    if (studio.serverHasNewChanges) {
      out.push({
        key: 'server',
        label: 'Server updates',
        title: 'The server has newer changes — pull when ready',
        className:
          'bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200',
      });
    }
    return out;
  }, [studio, studioMatchesSelection]);

  if (!workspace) {
    return (
      <div className="flex items-center gap-4 h-12 px-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Select tenant, project, and version (use Data Designer with WorkspaceProvider).
        </span>
      </div>
    );
  }

  const triggerClass =
    'inline-flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 min-w-[180px] hover:bg-slate-50 dark:hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900';
  const contentClass =
    'overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg z-50 max-h-[min(24rem,var(--radix-select-content-available-height))]';
  const itemClass =
    'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800 data-[state=checked]:font-medium';

  const breadcrumbParts = [
    workspace.tenant?.name,
    workspace.project?.name,
    workspace.version?.name,
  ].filter(Boolean) as string[];

  const recentTriggerClass =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900';

  const renderVersionItems = (list: VersionSchema[]) =>
    list.map((v) => (
      <Select.Item key={v.id} value={v.id} className={itemClass} textValue={v.name}>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Select.ItemText className="truncate">{v.name}</Select.ItemText>
          {tenantId && projectId ? (
            <StarToggle
              tenantId={tenantId}
              projectId={projectId}
              versionId={v.id}
              onChange={() => setFavoritesTick((n) => n + 1)}
            />
          ) : null}
        </span>
      </Select.Item>
    ));

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-slate-50/50 px-4 py-2 dark:border-slate-700 dark:bg-slate-900/50 print:hidden">
      {error && (
        <span className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </span>
      )}
      <nav
        className="order-1 flex min-w-0 max-w-full flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-400 md:max-w-[min(100%,36rem)]"
        aria-label="Workspace path"
      >
        {breadcrumbParts.length === 0 ? (
          <span className="truncate italic text-slate-500 dark:text-slate-500">
            Select tenant, project, and version
          </span>
        ) : (
          breadcrumbParts.map((part, i) => (
            <span key={`${part}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 ? (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500"
                  aria-hidden
                />
              ) : null}
              <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                {part}
              </span>
            </span>
          ))
        )}
      </nav>

      <div className="order-2 flex flex-wrap items-center gap-2">
        <DropdownMenu.Root open={recentsOpen} onOpenChange={setRecentsOpen}>
          <DropdownMenu.Trigger
            type="button"
            className={recentTriggerClass}
            aria-label="Recent workspaces"
            title="Open a recently used tenant, project, and version"
          >
            <History className="h-4 w-4" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 min-w-[16rem] max-w-[22rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
              sideOffset={4}
              align="start"
            >
              {recentsSnapshot.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                  No recent workspaces yet
                </div>
              ) : (
                recentsSnapshot.map((entry) => (
                  <DropdownMenu.Item
                    key={`${entry.tenantId}-${entry.projectId}-${entry.versionId}-${entry.openedAt}`}
                    className="cursor-pointer px-3 py-2 text-sm text-slate-700 outline-none hover:bg-slate-100 focus:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800"
                    onSelect={() => applyRecentEntry(entry)}
                  >
                    <span className="line-clamp-2">
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        {entry.tenantName}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500"> → </span>
                      <span>{entry.projectName}</span>
                      <span className="text-slate-400 dark:text-slate-500"> → </span>
                      <span>{entry.versionName}</span>
                    </span>
                  </DropdownMenu.Item>
                ))
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <Select.Root
          value={tenantId ?? undefined}
          onValueChange={onTenantChange}
          disabled={loadingTenants}
        >
          <Select.Trigger className={triggerClass} aria-label="Select tenant">
            {loadingTenants ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Select.Value placeholder="Select tenant" />
                <Select.Icon>
                  <ChevronDown className="h-4 w-4" />
                </Select.Icon>
              </>
            )}
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={contentClass} position="popper" sideOffset={4}>
              <Select.ScrollUpButton className="flex justify-center py-1 text-slate-500">
                <ChevronDown className="h-4 w-4 rotate-180" />
              </Select.ScrollUpButton>
              <Select.Viewport className="p-1">
                {tenants.map((t) => (
                  <Select.Item key={t.id} value={t.id} className={itemClass} textValue={t.name}>
                    <Select.ItemText>{t.name}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
              <Select.ScrollDownButton className="flex justify-center py-1 text-slate-500">
                <ChevronDown className="h-4 w-4" />
              </Select.ScrollDownButton>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Select.Root
          value={projectId ?? undefined}
          onValueChange={onProjectChange}
          disabled={loadingProjects || !tenantId}
        >
          <Select.Trigger className={triggerClass} aria-label="Select project">
            {loadingProjects ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Select.Value placeholder="Select project" />
                <Select.Icon>
                  <ChevronDown className="h-4 w-4" />
                </Select.Icon>
              </>
            )}
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={contentClass} position="popper" sideOffset={4}>
              <Select.ScrollUpButton className="flex justify-center py-1 text-slate-500">
                <ChevronDown className="h-4 w-4 rotate-180" />
              </Select.ScrollUpButton>
              <Select.Viewport className="p-1">
                {projects.map((p) => (
                  <Select.Item key={p.id} value={p.id} className={itemClass} textValue={p.name}>
                    <Select.ItemText>{p.name}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
              <Select.ScrollDownButton className="flex justify-center py-1 text-slate-500">
                <ChevronDown className="h-4 w-4" />
              </Select.ScrollDownButton>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <div className="flex flex-wrap items-center gap-2">
          <Select.Root
            value={workspace.version?.id ?? undefined}
            onValueChange={onVersionChange}
            disabled={loadingVersions || !projectId}
          >
            <Select.Trigger
              className={`${triggerClass} min-w-[140px]`}
              aria-label="Select version"
            >
              {loadingVersions ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Select.Value placeholder="Select version" />
                  <Select.Icon>
                    <ChevronDown className="h-4 w-4" />
                  </Select.Icon>
                </>
              )}
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className={contentClass} position="popper" sideOffset={4}>
                <Select.ScrollUpButton className="flex justify-center py-1 text-slate-500">
                  <ChevronDown className="h-4 w-4 rotate-180" />
                </Select.ScrollUpButton>
                <Select.Viewport className="p-1">
                  {favoritesList.length > 0 ? (
                    <Select.Group>
                      <Select.Label className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Pinned
                      </Select.Label>
                      {renderVersionItems(favoritesList)}
                    </Select.Group>
                  ) : null}
                  {favoritesList.length > 0 && othersList.length > 0 ? (
                    <Select.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
                  ) : null}
                  {othersList.length > 0 ? (
                    <Select.Group>
                      {favoritesList.length > 0 ? (
                        <Select.Label className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Versions
                        </Select.Label>
                      ) : null}
                      {renderVersionItems(othersList)}
                    </Select.Group>
                  ) : null}
                  {favoritesList.length === 0 && othersList.length === 0 && !loadingVersions ? (
                    <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                      No versions
                    </div>
                  ) : null}
                </Select.Viewport>
                <Select.ScrollDownButton className="flex justify-center py-1 text-slate-500">
                  <ChevronDown className="h-4 w-4" />
                </Select.ScrollDownButton>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          {syncBadges.length > 0 ? (
            <div
              className="flex flex-wrap items-center gap-1"
              aria-label="Version sync status"
            >
              {syncBadges.map((b) => (
                <span
                  key={b.key}
                  title={b.title}
                  className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${b.className}`}
                >
                  {b.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
