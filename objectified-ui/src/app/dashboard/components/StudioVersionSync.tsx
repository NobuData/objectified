'use client';

import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getRestClientOptions } from '@lib/api/rest-client';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';

/**
 * When workspace version changes, loads that version into studio local state (or clears studio).
 * Honors `revision` and `readOnly` query params when the `versionId` URL query param matches the
 * workspace version, or when no `versionId` is present in the URL (deep link from Versions →
 * history → open at revision).
 * Must be rendered inside both WorkspaceProvider and StudioProvider.
 */
function StudioVersionSyncInner() {
  const workspace = useWorkspaceOptional();
  const studio = useStudioOptional();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const options = getRestClientOptions(
    (session as { accessToken?: string } | null) ?? null
  );
  const lastVersionIdRef = useRef<string | null>(null);
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
  const urlVersionId = searchParams.get('versionId');
  const urlMatchesWorkspace =
    !urlVersionId || !versionId || urlVersionId === versionId;
  const revisionRaw = searchParams.get('revision');
  const revisionParsed =
    revisionRaw != null && urlMatchesWorkspace ? parseInt(revisionRaw, 10) : NaN;
  const hasUrlRevision =
    urlMatchesWorkspace &&
    !Number.isNaN(revisionParsed) &&
    revisionParsed > 0;
  const urlReadOnly =
    searchParams.get('readOnly') === '1' || searchParams.get('view') === '1';

  const syncVersion = useCallback(() => {
    const studioValue = studioRef.current;
    if (!studioValue) return;

    if (versionId !== lastVersionIdRef.current) {
      lastVersionIdRef.current = versionId;
      studioValue.clear({ clearBackup: true });
      if (!versionId) return;
      void studioValue.loadFromServer(versionId, optionsRef.current, {
        tenantId: tenantId ?? undefined,
        projectId: projectId ?? undefined,
        ...(hasUrlRevision
          ? { revision: revisionParsed, readOnly: urlReadOnly }
          : {}),
      });
    }
  }, [
    versionId,
    tenantId,
    projectId,
    hasUrlRevision,
    revisionParsed,
    urlReadOnly,
  ]);

  useEffect(() => {
    syncVersion();
  }, [syncVersion]);

  return null;
}

export default function StudioVersionSync() {
  return (
    <Suspense fallback={null}>
      <StudioVersionSyncInner />
    </Suspense>
  );
}
