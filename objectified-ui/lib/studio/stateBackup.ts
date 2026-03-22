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
const BACKUP_FORMAT_VERSION = 2;

interface StateBackupEnvelopeV2 {
  formatVersion: 2;
  checksum: string;
  savedAt: string;
  state: LocalVersionState;
  sourceTabId?: string;
}

type BackupLoadStatus = 'ok' | 'missing' | 'corrupted' | 'incompatible' | 'invalid';

interface BackupLoadResult {
  state: LocalVersionState | null;
  status: BackupLoadStatus;
  warning: string | null;
}

/** Returns the localStorage key for a given versionId backup. */
export function backupStorageKey(versionId: string): string {
  return `${BACKUP_KEY_PREFIX}${versionId}`;
}

/** Lightweight deterministic fingerprint used for backup integrity checks. */
export function computeStateChecksum(state: LocalVersionState): string {
  const payload = JSON.stringify(state);
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function removeBackup(versionId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(backupStorageKey(versionId));
  } catch {
    // Ignore localStorage errors
  }
}

function tryLoadStateBackup(versionId: string): BackupLoadResult {
  try {
    if (typeof localStorage === 'undefined') {
      return { state: null, status: 'missing', warning: null };
    }
    const raw = localStorage.getItem(backupStorageKey(versionId));
    if (!raw) {
      return { state: null, status: 'missing', warning: null };
    }
    const parsed = JSON.parse(raw) as
      | Partial<StateBackupEnvelopeV2>
      | { state?: LocalVersionState; savedAt?: string };

    const formatVersion =
      typeof (parsed as Partial<StateBackupEnvelopeV2>).formatVersion === 'number'
        ? (parsed as Partial<StateBackupEnvelopeV2>).formatVersion
        : 1;

    if (formatVersion !== BACKUP_FORMAT_VERSION) {
      removeBackup(versionId);
      return {
        state: null,
        status: 'incompatible',
        warning:
          'A local Studio backup was created by an incompatible app version and was ignored.',
      };
    }

    const v2 = parsed as Partial<StateBackupEnvelopeV2>;
    if (!v2.state || typeof v2.checksum !== 'string') {
      removeBackup(versionId);
      return {
        state: null,
        status: 'invalid',
        warning: 'A local Studio backup was invalid and has been cleared.',
      };
    }
    if (v2.state.versionId !== versionId) {
      removeBackup(versionId);
      return {
        state: null,
        status: 'invalid',
        warning: 'A local Studio backup targeted another version and was ignored.',
      };
    }
    const expected = computeStateChecksum(v2.state);
    if (expected !== v2.checksum) {
      removeBackup(versionId);
      return {
        state: null,
        status: 'corrupted',
        warning:
          'A local Studio backup failed integrity checks and was ignored as potentially corrupted.',
      };
    }
    return { state: v2.state, status: 'ok', warning: null };
  } catch {
    removeBackup(versionId);
    return {
      state: null,
      status: 'corrupted',
      warning:
        'A local Studio backup failed integrity checks and was ignored as potentially corrupted.',
    };
  }
}

/** Persist current state to localStorage as a backup, keyed by state.versionId. */
export function saveStateBackup(
  state: LocalVersionState,
  opts?: { sourceTabId?: string }
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const data: StateBackupEnvelopeV2 = {
      formatVersion: BACKUP_FORMAT_VERSION,
      checksum: computeStateChecksum(state),
      state,
      savedAt: new Date().toISOString(),
      sourceTabId: opts?.sourceTabId,
    };
    localStorage.setItem(backupStorageKey(state.versionId), JSON.stringify(data));
  } catch {
    // Ignore localStorage errors (quota exceeded, SSR, private browsing, etc.)
  }
}

/** Load a previously saved backup from localStorage, or null if none exists. */
export function loadStateBackup(versionId: string): LocalVersionState | null {
  return tryLoadStateBackup(versionId).state;
}

/** Load backup with integrity/version diagnostics for UI warnings. */
export function loadStateBackupWithDiagnostics(versionId: string): BackupLoadResult {
  return tryLoadStateBackup(versionId);
}

/** Clear the backup for a given versionId (e.g. after a successful push). */
export function clearStateBackup(versionId: string): void {
  removeBackup(versionId);
}

