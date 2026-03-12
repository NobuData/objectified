'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import * as Tabs from '@radix-ui/react-tabs';
import { Search, Plus, LayoutGrid, Tag, Loader2 } from 'lucide-react';
import {
  getRestClientOptions,
  listClassesWithPropertiesAndTags,
  listProperties,
} from '@lib/api/rest-client';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';

function SearchableList({
  items,
  emptyMessage,
  addLabel,
  loading,
}: {
  items: string[];
  emptyMessage: string;
  addLabel: string;
  loading?: boolean;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        query.trim() ? item.toLowerCase().includes(query.toLowerCase()) : true
      ),
    [items, query]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            aria-label="Search list"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            <ul className="p-2 space-y-0.5">
              {filtered.map((item) => (
                <li
                  key={item}
                  className="px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-default"
                >
                  {item}
                </li>
              ))}
            </ul>
            {filtered.length === 0 && (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                {emptyMessage}
              </p>
            )}
          </>
        )}
      </div>
      <div className="p-2 border-t border-slate-200 dark:border-slate-700 shrink-0">
        <button
          type="button"
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </button>
      </div>
    </div>
  );
}

export default function DesignCanvasSidebar() {
  const { data: session } = useSession();
  const options = getRestClientOptions(
    (session as { accessToken?: string } | null) ?? null
  );
  const workspace = useWorkspaceOptional();
  const studio = useStudioOptional();
  const [classNames, setClassNames] = useState<string[]>([]);
  const [propertyNames, setPropertyNames] = useState<string[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(false);

  const versionId = workspace?.version?.id ?? null;
  const tenantId = workspace?.tenant?.id ?? null;
  const projectId = workspace?.project?.id ?? null;

  const loadClasses = useCallback(async () => {
    if (!versionId) {
      setClassNames([]);
      setLoadingClasses(false);
      return;
    }
    setLoadingClasses(true);
    try {
      const classes = await listClassesWithPropertiesAndTags(versionId, options);
      setClassNames(classes.map((c) => c.name).sort((a, b) => a.localeCompare(b)));
    } catch {
      setClassNames([]);
    } finally {
      setLoadingClasses(false);
    }
  }, [versionId, options.jwt, options.apiKey]);

  const loadProperties = useCallback(async () => {
    if (!tenantId || !projectId) {
      setPropertyNames([]);
      setLoadingProperties(false);
      return;
    }
    setLoadingProperties(true);
    try {
      const list = await listProperties(tenantId, projectId, options);
      setPropertyNames(list.map((p) => p.name).sort((a, b) => a.localeCompare(b)));
    } catch {
      setPropertyNames([]);
    } finally {
      setLoadingProperties(false);
    }
  }, [tenantId, projectId, options.jwt, options.apiKey]);

  useEffect(() => {
    if (studio?.state) return;
    loadClasses();
  }, [loadClasses, studio?.state]);

  useEffect(() => {
    if (studio?.state) return;
    loadProperties();
  }, [loadProperties, studio?.state]);

  const noVersion = !versionId;
  const noProject = !tenantId || !projectId;

  const classNamesFromStudio = studio?.state?.classes?.map((c) => c.name).sort((a, b) => a.localeCompare(b)) ?? null;
  const propertyNamesFromStudio = studio?.state?.properties?.map((p) => p.name).sort((a, b) => a.localeCompare(b)) ?? null;
  const useStudioData = Boolean(studio?.state);
  const classesLoading = useStudioData ? (studio?.loading ?? false) : loadingClasses;
  const classesItems = useStudioData ? (classNamesFromStudio ?? []) : classNames;
  const propertiesLoading = useStudioData ? false : loadingProperties;
  const propertiesItems = useStudioData ? (propertyNamesFromStudio ?? []) : propertyNames;

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col shrink-0">
      <Tabs.Root defaultValue="classes" className="flex flex-col flex-1 min-h-0">
        <Tabs.List className="flex shrink-0 border-b border-slate-200 dark:border-slate-700">
          <Tabs.Trigger
            value="classes"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-400 border-b-2 border-transparent hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <LayoutGrid className="h-4 w-4" />
            Classes
          </Tabs.Trigger>
          <Tabs.Trigger
            value="properties"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-400 border-b-2 border-transparent hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <Tag className="h-4 w-4" />
            Properties
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="classes" className="flex-1 min-h-0 mt-0">
          {noVersion ? (
            <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
              Select a tenant, project, and version to load classes.
            </p>
          ) : (
            <SearchableList
              items={classesItems}
              emptyMessage="No classes match your search."
              addLabel="Add class"
              loading={classesLoading}
            />
          )}
        </Tabs.Content>
        <Tabs.Content value="properties" className="flex-1 min-h-0 mt-0">
          {noProject ? (
            <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
              Select a tenant and project to load properties.
            </p>
          ) : (
            <SearchableList
              items={propertiesItems}
              emptyMessage="No properties match your search."
              addLabel="Add property"
              loading={propertiesLoading}
            />
          )}
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
