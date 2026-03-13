'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  getTenant,
  getProject,
  getVersion,
  getRestClientOptions,
} from '@lib/api/rest-client';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';

/**
 * Inner component that reads tenantId, projectId, and versionId from the URL
 * query string and loads the corresponding objects into the workspace context.
 * When the workspace version changes, StudioVersionSync will automatically
 * pull the full version state and hydrate the canvas/sidebar.
 *
 * Must be rendered inside both WorkspaceProvider and a Suspense boundary
 * (useSearchParams requires Suspense in the Next.js App Router).
 */
function StudioUrlLoaderInner() {
  const searchParams = useSearchParams();
  const workspace = useWorkspaceOptional();
  const { data: session } = useSession();
  const sessionToken = (session as { accessToken?: string } | null)?.accessToken ?? null;
  const options = useMemo(
    () => getRestClientOptions(sessionToken ? { accessToken: sessionToken } : null),
    [sessionToken]
  );
  const loadedKeyRef = useRef<string | null>(null);

  const tenantId = searchParams.get('tenantId');
  const projectId = searchParams.get('projectId');
  const versionId = searchParams.get('versionId');

  useEffect(() => {
    if (!workspace || !tenantId || !projectId || !versionId) return;

    const key = `${tenantId}:${projectId}:${versionId}`;
    if (loadedKeyRef.current === key) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const callOptions = { ...options, signal: controller.signal };
        const [tenant, project, version] = await Promise.all([
          getTenant(tenantId, callOptions),
          getProject(tenantId, projectId, callOptions),
          getVersion(versionId, callOptions),
        ]);
        if (!controller.signal.aborted) {
          // Set in order: tenant (resets project+version) → project (resets version) → version
          loadedKeyRef.current = key;
          workspace.setTenant(tenant);
          workspace.setProject(project);
          workspace.setVersion(version);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          console.error('[StudioUrlLoader] Failed to load version from URL params:', e);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [tenantId, projectId, versionId, workspace, options]);

  return null;
}

/**
 * Wraps StudioUrlLoaderInner in a Suspense boundary as required by
 * Next.js App Router for components that call useSearchParams().
 */
export default function StudioUrlLoader() {
  return (
    <Suspense fallback={null}>
      <StudioUrlLoaderInner />
    </Suspense>
  );
}

