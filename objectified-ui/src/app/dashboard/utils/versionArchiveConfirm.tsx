import type { ReactNode } from 'react';
import type { VersionSchema } from '@lib/api/rest-client';
import { getVersion, listVersions, type RestClientOptions } from '@lib/api/rest-client';

/**
 * When true, the remove UI may offer a permanent delete path. The current API only
 * soft-deletes versions; keep this false until a hard-delete endpoint exists.
 */
export const VERSION_DELETE_SUPPORTS_PERMANENT = false;

/** Active branch versions in the project that list this version as their source. */
export function countBranchVersionsFromSource(
  versions: VersionSchema[],
  sourceVersionId: string
): number {
  return versions.filter(
    (v) => v.source_version_id != null && v.source_version_id === sourceVersionId
  ).length;
}

export interface VersionArchiveImpact {
  branchCount: number;
  lastRevision: number | null;
}

/**
 * Resolves branch count and last revision for archive confirmation.
 * Prefer passing `projectVersions` (e.g. from the versions table) to avoid an extra list call.
 */
export async function resolveVersionArchiveImpact(
  versionId: string,
  ctx: {
    projectVersions?: VersionSchema[];
    tenantId?: string;
    projectId?: string;
    options: RestClientOptions;
  }
): Promise<VersionArchiveImpact> {
  if (ctx.projectVersions?.length) {
    const self = ctx.projectVersions.find((v) => v.id === versionId);
    return {
      branchCount: countBranchVersionsFromSource(ctx.projectVersions, versionId),
      lastRevision:
        self?.last_revision != null && self.last_revision > 0
          ? self.last_revision
          : null,
    };
  }
  if (ctx.tenantId && ctx.projectId) {
    const vers = await listVersions(ctx.tenantId, ctx.projectId, ctx.options);
    const self = vers.find((v) => v.id === versionId);
    return {
      branchCount: countBranchVersionsFromSource(vers, versionId),
      lastRevision:
        self?.last_revision != null && self.last_revision > 0
          ? self.last_revision
          : null,
    };
  }
  const self = await getVersion(versionId, ctx.options);
  return {
    branchCount: 0,
    lastRevision:
      self.last_revision != null && self.last_revision > 0 ? self.last_revision : null,
  };
}

export interface VersionArchiveConfirmMessageProps {
  displayName: string;
  lastRevision: number | null;
  branchCount: number;
}

/**
 * Rich confirm body for archiving (soft-deleting) a version: impact and optional cascade note.
 */
export function VersionArchiveConfirmMessage({
  displayName,
  lastRevision,
  branchCount,
}: VersionArchiveConfirmMessageProps): ReactNode {
  return (
    <div className="space-y-3 text-left text-sm text-slate-700 dark:text-slate-300">
      <p>
        This will <strong>archive</strong> (soft-delete){' '}
        <strong>{displayName}</strong>: it disappears from the active versions list and is
        disabled. Snapshot revision history stays on the server for audit.
      </p>
      {lastRevision != null && (
        <p>
          This line has <strong>{lastRevision}</strong> committed revision
          {lastRevision === 1 ? '' : 's'} recorded on the server; after archiving you will not
          be able to open it from the active versions list or Studio until it is restored (when
          your deployment allows that).
        </p>
      )}
      {branchCount > 0 && (
        <p
          className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-amber-950 dark:text-amber-100"
          role="status"
        >
          <strong>Branches:</strong>{' '}
          {branchCount === 1
            ? 'One other version in this project branches from this one.'
            : `${branchCount} other versions in this project branch from this one.`}{' '}
          Archiving does not remove those versions; confirm they no longer depend on this line
          before continuing.
        </p>
      )}
    </div>
  );
}
