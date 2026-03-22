/**
 * Persists a pre-pull snapshot of local studio state so "Stash and pull" can
 * recover work from localStorage if needed (separate from the main draft backup).
 */

import type { LocalVersionState } from './types';

const STASH_PREFIX = 'objectified:studio:pull-stash:';

export function pullStashStorageKey(versionId: string): string {
  return `${STASH_PREFIX}${versionId}`;
}

export function savePullStash(versionId: string, state: LocalVersionState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      pullStashStorageKey(versionId),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state,
      })
    );
  } catch {
    // Ignore quota / private mode errors
  }
}

export function clearPullStash(versionId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(pullStashStorageKey(versionId));
  } catch {
    // Ignore
  }
}
