'use client';

import { Suspense, useEffect, useRef } from 'react';
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
  const opts = getRestClientOptions(
    (session as { accessToken?: string } | null) ?? null
  );
  const loadedKeyRef = useRef<string | null>(null);

  const tenantId = searchParams.get('tenantId');
  const projectId = searchParams.get('projectId');
  const versionId = searchParams.get('versionId');

  useEffect(() => {
    if (!workspace || !tenantId || !projectId || !versionId) return;

    const key = `${tenantId}:${projectId}:${versionId}`;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;

    void (async () => {
      try {
        const [tenant, project, version] = await Promise.all([
          getTenant(tenantId, opts),
          getProject(tenantId, projectId, opts),
          getVersion(versionId, opts),
        ]);
        // Set in order: tenant (resets project+version) → project (resets version) → version
        workspace.setTenant(tenant);
        workspace.setProject(project);
        workspace.setVersion(version);
      } catch (e) {
        console.error('[StudioUrlLoader] Failed to load version from URL params:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, projectId, versionId, workspace, opts.jwt, opts.apiKey]);

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

