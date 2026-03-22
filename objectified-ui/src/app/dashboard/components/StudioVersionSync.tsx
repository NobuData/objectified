'use client';

import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getRestClientOptions } from '@lib/api/rest-client';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useDialog } from '@/app/components/providers/DialogProvider';
import { loadStateBackupWithDiagnostics } from '@lib/studio/stateBackup';

function isDraftNewerThanLastPushed(
  draftSavedAt: string,
  lastPushedAt: string | null | undefined
): boolean {
  if (!lastPushedAt) return true;
  const draftMillis = Date.parse(draftSavedAt);
  const pushedMillis = Date.parse(lastPushedAt);
  if (Number.isNaN(draftMillis)) return false;
  if (Number.isNaN(pushedMillis)) return true;
  return draftMillis > pushedMillis;
}

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
  const { confirm } = useDialog();
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
  const workspaceVersionLastCommittedAt = workspace?.version?.last_committed_at ?? null;
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
      void (async () => {
        const capturedVersionId = versionId;
        let draftBehavior: 'restore' | 'discard' | undefined;
        const canPromptForDraft =
          !hasUrlRevision && !urlReadOnly;
        const backupResult = canPromptForDraft
          ? loadStateBackupWithDiagnostics(capturedVersionId)
          : null;
        if (
          backupResult?.state &&
          backupResult.savedAt &&
          isDraftNewerThanLastPushed(
            backupResult.savedAt,
            workspaceVersionLastCommittedAt
          )
        ) {
          const restore = await confirm({
            title: 'Restore unsaved draft?',
            message:
              'A newer local draft was found for this version. Restore it now? Choosing "Discard draft" loads the latest server state and removes the local draft.',
            variant: 'warning',
            confirmLabel: 'Restore draft',
            cancelLabel: 'Discard draft',
          });
          draftBehavior = restore ? 'restore' : 'discard';
        }
        // Abort if the workspace version changed while the user was responding
        // to the confirm prompt, to prevent overwriting a newer load.
        if (capturedVersionId !== lastVersionIdRef.current) return;
        await studioValue.loadFromServer(capturedVersionId, optionsRef.current, {
          tenantId: tenantId ?? undefined,
          projectId: projectId ?? undefined,
          ...(hasUrlRevision
            ? { revision: revisionParsed, readOnly: urlReadOnly }
            : {}),
          ...(draftBehavior ? { draftBehavior } : {}),
          ...(backupResult ? { preloadedBackupResult: backupResult } : {}),
        });
      })();
    }
  }, [
    versionId,
    tenantId,
    projectId,
    workspaceVersionLastCommittedAt,
    hasUrlRevision,
    revisionParsed,
    urlReadOnly,
    confirm,
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
