'use client';

import { useCallback, useEffect, useRef } from 'react';
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

  // Keep stable refs so the effect only fires on workspace selection changes,
  // not on every studio state / options identity change.
  const studioRef = useRef(studio);
  const optionsRef = useRef(options);
  useEffect(() => {
    studioRef.current = studio;
  }, [studio]);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const versionId = workspace?.version?.id ?? null;
  const tenantId = workspace?.tenant?.id ?? null;
  const projectId = workspace?.project?.id ?? null;

  const syncVersion = useCallback(() => {
    const studioValue = studioRef.current;
    if (!studioValue) return;

    if (versionId !== lastVersionIdRef.current) {
      lastVersionIdRef.current = versionId;
      studioValue.clear();
      if (!versionId) return;
      void studioValue.loadFromServer(versionId, optionsRef.current, {
        tenantId: tenantId ?? undefined,
        projectId: projectId ?? undefined,
      });
    }
  }, [versionId, tenantId, projectId]);

  useEffect(() => {
    syncVersion();
  }, [syncVersion]);

  return null;
}
