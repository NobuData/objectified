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
const BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StateBackupEnvelopeV2 {
  formatVersion: 2;
  checksum: string;
  savedAt: string;
  state: LocalVersionState;
  sourceTabId?: string;
}

type BackupLoadStatus =
  | 'ok'
  | 'missing'
  | 'corrupted'
  | 'incompatible'
  | 'invalid'
  | 'expired';

export interface BackupLoadResult {
  state: LocalVersionState | null;
  status: BackupLoadStatus;
  warning: string | null;
  savedAt: string | null;
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

function normalizeSavedAt(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) return null;
  return new Date(millis).toISOString();
}

function isBackupExpired(savedAtIso: string): boolean {
  const savedAtMillis = Date.parse(savedAtIso);
  if (Number.isNaN(savedAtMillis)) return true;
  return Date.now() - savedAtMillis > BACKUP_TTL_MS;
}

function tryLoadStateBackup(versionId: string): BackupLoadResult {
  try {
    if (typeof localStorage === 'undefined') {
      return { state: null, status: 'missing', warning: null, savedAt: null };
    }
    const raw = localStorage.getItem(backupStorageKey(versionId));
    if (!raw) {
      return { state: null, status: 'missing', warning: null, savedAt: null };
    }
    const parsed = JSON.parse(raw) as
      | Partial<StateBackupEnvelopeV2>
      | { state?: LocalVersionState; savedAt?: string };

    const formatVersion =
      typeof (parsed as Partial<StateBackupEnvelopeV2>).formatVersion === 'number'
        ? (parsed as Partial<StateBackupEnvelopeV2>).formatVersion
        : undefined;

    // v1 migration: old backup shape was { state, savedAt } with no formatVersion.
    // Migrate to v2 rather than discarding, to avoid losing unsynced work on upgrade.
    if (formatVersion === undefined) {
      const v1State = (parsed as { state?: LocalVersionState }).state;
      if (!v1State || typeof v1State !== 'object' || v1State.versionId !== versionId) {
        removeBackup(versionId);
        return {
          state: null,
          status: 'invalid',
          warning: 'A local Studio backup was invalid and has been cleared.',
          savedAt: null,
        };
      }
      // Preserve the original savedAt so migration does not extend TTL or make
      // an old draft appear newer than it is.  Fall back to now only when the
      // v1 record carries no parseable timestamp.
      const originalSavedAt = normalizeSavedAt((parsed as { savedAt?: string }).savedAt);
      if (originalSavedAt && isBackupExpired(originalSavedAt)) {
        removeBackup(versionId);
        return {
          state: null,
          status: 'expired',
          warning: 'A local Studio draft expired after 7 days and was cleared.',
          savedAt: null,
        };
      }
      const migratedSavedAt = originalSavedAt ?? new Date().toISOString();
      // Migrate: rewrite as v2 envelope so subsequent loads are version-checked.
      saveStateBackup(v1State, { savedAt: migratedSavedAt });
      return {
        state: v1State,
        status: 'ok',
        warning: null,
        savedAt: migratedSavedAt,
      };
    }

    if (formatVersion !== BACKUP_FORMAT_VERSION) {
      removeBackup(versionId);
      return {
        state: null,
        status: 'incompatible',
        warning:
          'A local Studio backup was created by an incompatible app version and was ignored.',
        savedAt: null,
      };
    }

    const v2 = parsed as Partial<StateBackupEnvelopeV2>;
    if (!v2.state || typeof v2.checksum !== 'string') {
      removeBackup(versionId);
      return {
        state: null,
        status: 'invalid',
        warning: 'A local Studio backup was invalid and has been cleared.',
        savedAt: null,
      };
    }
    if (v2.state.versionId !== versionId) {
      removeBackup(versionId);
      return {
        state: null,
        status: 'invalid',
        warning: 'A local Studio backup targeted another version and was ignored.',
        savedAt: null,
      };
    }
    const savedAt = normalizeSavedAt(v2.savedAt);
    if (!savedAt) {
      removeBackup(versionId);
      return {
        state: null,
        status: 'invalid',
        warning: 'A local Studio backup had an invalid timestamp and was cleared.',
        savedAt: null,
      };
    }
    if (isBackupExpired(savedAt)) {
      removeBackup(versionId);
      return {
        state: null,
        status: 'expired',
        warning: 'A local Studio draft expired after 7 days and was cleared.',
        savedAt: null,
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
        savedAt: null,
      };
    }
    return { state: v2.state, status: 'ok', warning: null, savedAt };
  } catch {
    removeBackup(versionId);
    return {
      state: null,
      status: 'corrupted',
      warning:
        'A local Studio backup failed integrity checks and was ignored as potentially corrupted.',
      savedAt: null,
    };
  }
}

/** Persist current state to localStorage as a backup, keyed by state.versionId. */
export function saveStateBackup(
  state: LocalVersionState,
  opts?: { sourceTabId?: string; savedAt?: string }
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const data: StateBackupEnvelopeV2 = {
      formatVersion: BACKUP_FORMAT_VERSION,
      checksum: computeStateChecksum(state),
      state,
      savedAt: opts?.savedAt ?? new Date().toISOString(),
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

/** Load valid backup state with saved timestamp metadata for restore prompts. */
export function loadStateBackupWithMetadata(
  versionId: string
): { state: LocalVersionState; savedAt: string } | null {
  const result = tryLoadStateBackup(versionId);
  if (!result.state || !result.savedAt) return null;
  return {
    state: result.state,
    savedAt: result.savedAt,
  };
}

/** Clear the backup for a given versionId (e.g. after a successful push). */
export function clearStateBackup(versionId: string): void {
  removeBackup(versionId);
}

