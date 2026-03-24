/**
 * @jest-environment jsdom
 */

import {
  favoriteVersionIdsForProject,
  isWorkspaceVersionFavorite,
  listWorkspaceRecents,
  MAX_RECENTS,
  recordWorkspaceRecent,
  toggleWorkspaceVersionFavorite,
  workspaceFavoriteKey,
} from '../../src/lib/dashboard/workspaceRecentsFavorites';

describe('workspaceRecentsFavorites', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('recordWorkspaceRecent prepends and dedupes by triple', () => {
    const a = {
      tenantId: 't1',
      tenantName: 'T1',
      projectId: 'p1',
      projectName: 'P1',
      versionId: 'v1',
      versionName: 'V1',
      openedAt: '2026-01-01T00:00:00.000Z',
    };
    const b = { ...a, versionId: 'v2', versionName: 'V2', openedAt: '2026-01-02T00:00:00.000Z' };
    recordWorkspaceRecent(a);
    recordWorkspaceRecent(b);
    recordWorkspaceRecent({ ...a, openedAt: '2026-01-03T00:00:00.000Z' });
    const list = listWorkspaceRecents();
    expect(list.map((e) => e.versionId)).toEqual(['v1', 'v2']);
  });

  it('recordWorkspaceRecent caps at MAX_RECENTS', () => {
    for (let i = 0; i < MAX_RECENTS + 5; i += 1) {
      recordWorkspaceRecent({
        tenantId: 't',
        tenantName: 'T',
        projectId: 'p',
        projectName: 'P',
        versionId: `v${i}`,
        versionName: `V${i}`,
        openedAt: new Date(i).toISOString(),
      });
    }
    expect(listWorkspaceRecents()).toHaveLength(MAX_RECENTS);
  });

  it('toggleWorkspaceVersionFavorite tracks membership', () => {
    expect(isWorkspaceVersionFavorite('t', 'p', 'v')).toBe(false);
    expect(toggleWorkspaceVersionFavorite('t', 'p', 'v')).toBe(true);
    expect(isWorkspaceVersionFavorite('t', 'p', 'v')).toBe(true);
    expect(toggleWorkspaceVersionFavorite('t', 'p', 'v')).toBe(false);
    expect(isWorkspaceVersionFavorite('t', 'p', 'v')).toBe(false);
  });

  it('favoriteVersionIdsForProject filters by tenant and project', () => {
    toggleWorkspaceVersionFavorite('t1', 'p1', 'va');
    toggleWorkspaceVersionFavorite('t1', 'p2', 'vb');
    toggleWorkspaceVersionFavorite('t2', 'p1', 'vc');
    expect(favoriteVersionIdsForProject('t1', 'p1')).toEqual(['va']);
    expect(workspaceFavoriteKey('a', 'b', 'c')).toBe('a\tb\tc');
  });

  it('listWorkspaceRecents returns [] when storage contains non-array JSON', () => {
    window.localStorage.setItem('objectified.workspace.recents.v1', JSON.stringify({ bad: true }));
    expect(listWorkspaceRecents()).toEqual([]);
  });

  it('listWorkspaceRecents returns [] when storage contains invalid JSON', () => {
    window.localStorage.setItem('objectified.workspace.recents.v1', 'not-json{{{');
    expect(listWorkspaceRecents()).toEqual([]);
  });

  it('listWorkspaceRecents filters out entries missing required fields', () => {
    const valid = {
      tenantId: 't1',
      tenantName: 'T1',
      projectId: 'p1',
      projectName: 'P1',
      versionId: 'v1',
      versionName: 'V1',
      openedAt: '2026-01-01T00:00:00.000Z',
    };
    window.localStorage.setItem(
      'objectified.workspace.recents.v1',
      JSON.stringify([valid, { tenantId: 't2' }, null, 42])
    );
    const list = listWorkspaceRecents();
    expect(list).toHaveLength(1);
    expect(list[0].versionId).toBe('v1');
  });

  it('isWorkspaceVersionFavorite returns false when storage contains non-array JSON', () => {
    window.localStorage.setItem('objectified.workspace.favorites.v1', JSON.stringify({ bad: true }));
    expect(isWorkspaceVersionFavorite('t', 'p', 'v')).toBe(false);
  });

  it('isWorkspaceVersionFavorite returns false when storage contains invalid JSON', () => {
    window.localStorage.setItem('objectified.workspace.favorites.v1', 'not-json{{{');
    expect(isWorkspaceVersionFavorite('t', 'p', 'v')).toBe(false);
  });

  it('favoriteVersionIdsForProject returns [] when storage contains non-string array items', () => {
    window.localStorage.setItem(
      'objectified.workspace.favorites.v1',
      JSON.stringify([123, null, { id: 'x' }])
    );
    expect(favoriteVersionIdsForProject('t', 'p')).toEqual([]);
  });
});
