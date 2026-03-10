'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Loader2 } from 'lucide-react';
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

function useAuthOptions() {
  const { data: session } = useSession();
  return getRestClientOptions((session as { accessToken?: string } | null) ?? null);
}

export default function ProjectVersionBar() {
  const options = useAuthOptions();
  const workspace = useWorkspaceOptional();
  const [tenants, setTenants] = useState<TenantSchema[]>([]);
  const [projects, setProjects] = useState<ProjectSchema[]>([]);
  const [versions, setVersions] = useState<VersionSchema[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    'overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg z-50';
  const itemClass =
    'px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800';

  return (
    <div className="flex items-center gap-4 h-12 px-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
      {error && (
        <span className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </span>
      )}
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
            <Select.Viewport>
              {tenants.map((t) => (
                <Select.Item key={t.id} value={t.id} className={itemClass}>
                  <Select.ItemText>{t.name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
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
            <Select.Viewport>
              {projects.map((p) => (
                <Select.Item key={p.id} value={p.id} className={itemClass}>
                  <Select.ItemText>{p.name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <Select.Root
        value={workspace.version?.id ?? undefined}
        onValueChange={onVersionChange}
        disabled={loadingVersions || !projectId}
      >
        <Select.Trigger
          className={triggerClass}
          style={{ minWidth: '140px' }}
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
            <Select.Viewport>
              {versions.map((v) => (
                <Select.Item key={v.id} value={v.id} className={itemClass}>
                  <Select.ItemText>{v.name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
