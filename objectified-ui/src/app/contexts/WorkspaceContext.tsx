'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ProjectSchema, TenantSchema, VersionSchema } from '@lib/api/rest-client';

export interface WorkspaceSelection {
  tenant: TenantSchema | null;
  project: ProjectSchema | null;
  version: VersionSchema | null;
}

interface WorkspaceContextValue extends WorkspaceSelection {
  setTenant: (t: TenantSchema | null) => void;
  setProject: (p: ProjectSchema | null) => void;
  setVersion: (v: VersionSchema | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenantState] = useState<TenantSchema | null>(null);
  const [project, setProjectState] = useState<ProjectSchema | null>(null);
  const [version, setVersionState] = useState<VersionSchema | null>(null);

  const setTenant = useCallback((t: TenantSchema | null) => {
    setTenantState(t);
    setProjectState(null);
    setVersionState(null);
  }, []);

  const setProject = useCallback((p: ProjectSchema | null) => {
    setProjectState(p);
    setVersionState(null);
  }, []);

  const setVersion = useCallback((v: VersionSchema | null) => {
    setVersionState(v);
  }, []);

  const value = useMemo(
    () => ({
      tenant,
      project,
      version,
      setTenant,
      setProject,
      setVersion,
    }),
    [tenant, project, version, setTenant, setProject, setVersion]
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return ctx;
}

export function useWorkspaceOptional(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
