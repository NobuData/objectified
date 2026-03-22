/**
 * localStorage persistence for last commit metadata (unpushed indicator, etc.).
 */

const STORAGE_KEY_PREFIX = 'objectified:studio:';

export interface PersistedCommitInfo {
  revision: number | null;
  lastCommittedAt: string;
  hasUnpushedCommits: boolean;
  message?: string | null;
  externalId?: string | null;
}

export function commitStorageKey(versionId: string): string {
  return `${STORAGE_KEY_PREFIX}${versionId}:lastCommit`;
}

export function loadPersistedCommitInfo(versionId: string): PersistedCommitInfo | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(commitStorageKey(versionId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedCommitInfo;
  } catch {
    return null;
  }
}

export function savePersistedCommitInfo(versionId: string, info: PersistedCommitInfo): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(commitStorageKey(versionId), JSON.stringify(info));
  } catch {
    // Ignore localStorage errors (e.g. private browsing quota exceeded)
  }
}
