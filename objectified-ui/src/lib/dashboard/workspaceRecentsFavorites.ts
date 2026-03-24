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

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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
  return safeParseJson<WorkspaceRecentEntry[]>(window.localStorage.getItem(RECENTS_KEY), []);
}

function writeRecents(entries: WorkspaceRecentEntry[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(entries));
}

function readFavoriteKeys(): string[] {
  if (typeof window === 'undefined') return [];
  return safeParseJson<string[]>(window.localStorage.getItem(FAVORITES_KEY), []);
}

function writeFavoriteKeys(keys: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(keys));
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
