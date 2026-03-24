/**
 * Persist recent workspace opens and pinned versions for the Data Designer bar (GitHub #223).
 */

const RECENTS_KEY = 'objectified.workspace.recents.v1';
const FAVORITES_KEY = 'objectified.workspace.favorites.v1';
export const MAX_RECENTS = 12;

export interface WorkspaceRecentEntry {
  tenantId: string;
  tenantName: string;
  projectId: string;
  projectName: string;
  versionId: string;
  versionName: string;
  openedAt: string;
}

export function workspaceFavoriteKey(
  tenantId: string,
  projectId: string,
  versionId: string
): string {
  return `${tenantId}\t${projectId}\t${versionId}`;
}

export function parseWorkspaceFavoriteKey(key: string): {
  tenantId: string;
  projectId: string;
  versionId: string;
} | null {
  const parts = key.split('\t');
  if (parts.length !== 3) return null;
  return { tenantId: parts[0], projectId: parts[1], versionId: parts[2] };
}

function readRecents(): WorkspaceRecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (raw == null || raw === '') return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is WorkspaceRecentEntry =>
        e != null &&
        typeof e === 'object' &&
        typeof e.tenantId === 'string' &&
        typeof e.tenantName === 'string' &&
        typeof e.projectId === 'string' &&
        typeof e.projectName === 'string' &&
        typeof e.versionId === 'string' &&
        typeof e.versionName === 'string' &&
        typeof e.openedAt === 'string'
    );
  } catch {
    return [];
  }
}

function writeRecents(entries: WorkspaceRecentEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage write errors (e.g., quota exceeded or private/restricted modes).
  }
}

function readFavoriteKeys(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (raw == null || raw === '') return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function writeFavoriteKeys(keys: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(keys));
  } catch {
    // Ignore storage write errors (e.g., quota exceeded or private/restricted modes).
  }
}

export function listWorkspaceRecents(): WorkspaceRecentEntry[] {
  return readRecents();
}

export function recordWorkspaceRecent(entry: WorkspaceRecentEntry): void {
  const prev = readRecents();
  const withoutDup = prev.filter(
    (e) =>
      !(
        e.tenantId === entry.tenantId &&
        e.projectId === entry.projectId &&
        e.versionId === entry.versionId
      )
  );
  const next = [entry, ...withoutDup].slice(0, MAX_RECENTS);
  writeRecents(next);
}

export function isWorkspaceVersionFavorite(
  tenantId: string,
  projectId: string,
  versionId: string
): boolean {
  const k = workspaceFavoriteKey(tenantId, projectId, versionId);
  return readFavoriteKeys().includes(k);
}

export function toggleWorkspaceVersionFavorite(
  tenantId: string,
  projectId: string,
  versionId: string
): boolean {
  const k = workspaceFavoriteKey(tenantId, projectId, versionId);
  const prev = readFavoriteKeys();
  const has = prev.includes(k);
  const next = has ? prev.filter((x) => x !== k) : [...prev, k];
  writeFavoriteKeys(next);
  return !has;
}

export function favoriteVersionIdsForProject(tenantId: string, projectId: string): string[] {
  const keys = readFavoriteKeys();
  const out: string[] = [];
  for (const key of keys) {
    const parsed = parseWorkspaceFavoriteKey(key);
    if (parsed && parsed.tenantId === tenantId && parsed.projectId === projectId) {
      out.push(parsed.versionId);
    }
  }
  return out;
}
