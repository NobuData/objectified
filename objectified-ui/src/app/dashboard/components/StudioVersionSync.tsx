'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getRestClientOptions } from '@lib/api/rest-client';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';

/**
 * When workspace version changes, loads that version into studio local state (or clears studio).
 * Must be rendered inside both WorkspaceProvider and StudioProvider.
 */
export default function StudioVersionSync() {
  const workspace = useWorkspaceOptional();
  const studio = useStudioOptional();
  const options = getRestClientOptions(
    (useSession().data as { accessToken?: string } | null) ?? null
  );
  const lastVersionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!studio) return;
    const versionId = workspace?.version?.id ?? null;
    const tenantId = workspace?.tenant?.id ?? null;
    const projectId = workspace?.project?.id ?? null;

    if (versionId !== lastVersionIdRef.current) {
      lastVersionIdRef.current = versionId;
      if (!versionId) {
        studio.clear();
        return;
      }
      void studio.loadFromServer(versionId, options, {
        tenantId: tenantId ?? undefined,
        projectId: projectId ?? undefined,
      });
    }
  }, [
    workspace?.version?.id,
    workspace?.tenant?.id,
    workspace?.project?.id,
    studio,
    options.jwt,
    options.apiKey,
  ]);

  return null;
}
