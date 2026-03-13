/**
 * localStorage backup helpers for the studio state.
 *
 * Persists the current LocalVersionState keyed by versionId so work is
 * not lost on accidental page refreshes.  The backup is cleared on a
 * successful push (the state has been sent to the server).
 *
 * Reference: GitHub #65 — Add localStorage backup keyed by versionId;
 * clear on successful push.
 */

import type { LocalVersionState } from './types';

const BACKUP_KEY_PREFIX = 'objectified:studio:backup:';

/** Returns the localStorage key for a given versionId backup. */
export function backupStorageKey(versionId: string): string {
  return `${BACKUP_KEY_PREFIX}${versionId}`;
}

/** Persist current state to localStorage as a backup, keyed by state.versionId. */
export function saveStateBackup(state: LocalVersionState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const data = {
      state,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(backupStorageKey(state.versionId), JSON.stringify(data));
  } catch {
    // Ignore localStorage errors (quota exceeded, SSR, private browsing, etc.)
  }
}

/** Load a previously saved backup from localStorage, or null if none exists. */
export function loadStateBackup(versionId: string): LocalVersionState | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(backupStorageKey(versionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state: LocalVersionState; savedAt: string };
    return parsed.state ?? null;
  } catch {
    return null;
  }
}

/** Clear the backup for a given versionId (e.g. after a successful push). */
export function clearStateBackup(versionId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(backupStorageKey(versionId));
  } catch {
    // Ignore localStorage errors
  }
}

