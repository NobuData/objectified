import {
  BRANCH_OPEN_STUDIO_NEW_TAB_KEY,
  readBranchOpenStudioNewTab,
  suggestBranchVersionName,
  writeBranchOpenStudioNewTab,
} from '@/lib/dashboard/branchFromRevisionUi';

describe('branchFromRevisionUi', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('suggestBranchVersionName', () => {
    it('builds slug from version name and revision', () => {
      expect(suggestBranchVersionName('My Version', 123)).toBe('my-version-rev-123');
    });

    it('uses branch prefix when name is empty', () => {
      expect(suggestBranchVersionName(undefined, 1)).toBe('branch-rev-1');
      expect(suggestBranchVersionName('   ', 2)).toBe('branch-rev-2');
    });
  });

  describe('localStorage preference', () => {
    it('defaults to same tab when unset', () => {
      expect(readBranchOpenStudioNewTab()).toBe(false);
    });

    it('reads and writes 1/0', () => {
      writeBranchOpenStudioNewTab(true);
      expect(window.localStorage.getItem(BRANCH_OPEN_STUDIO_NEW_TAB_KEY)).toBe('1');
      expect(readBranchOpenStudioNewTab()).toBe(true);
      writeBranchOpenStudioNewTab(false);
      expect(readBranchOpenStudioNewTab()).toBe(false);
    });
  });
});
