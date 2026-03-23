/**
 * Shared UI for branching / copy-from-revision (GitHub #220).
 * Preference is stored client-side so Studio opens in the same tab or a new tab consistently.
 */
export type BranchFromRevisionSuccessMeta = {
  openInNewTab: boolean;
};

export const BRANCH_OPEN_STUDIO_NEW_TAB_KEY = 'objectified-branch-open-studio-new-tab';

export function readBranchOpenStudioNewTab(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(BRANCH_OPEN_STUDIO_NEW_TAB_KEY) === '1';
}

export function writeBranchOpenStudioNewTab(value: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BRANCH_OPEN_STUDIO_NEW_TAB_KEY, value ? '1' : '0');
}

/**
 * Suggested new-version name when branching from a named version at a revision
 * (e.g. my-version-rev-3).
 */
export function suggestBranchVersionName(
  versionName: string | undefined,
  revision: number
): string {
  const base = (versionName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const prefix = base || 'branch';
  return `${prefix}-rev-${revision}`;
}
