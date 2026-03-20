import {
  USER_UI_METADATA_KEY,
  mergeUserUiIntoMetadata,
  parseUserUiFromMetadata,
} from '../../lib/ui/userAppearanceMetadata';

describe('userAppearanceMetadata', () => {
  it('parses empty metadata', () => {
    expect(parseUserUiFromMetadata(undefined)).toEqual({
      theme: null,
      highContrast: false,
    });
  });

  it('parses valid ui.theme and ui.highContrast', () => {
    expect(
      parseUserUiFromMetadata({
        [USER_UI_METADATA_KEY]: { theme: 'dark', highContrast: true },
      })
    ).toEqual({ theme: 'dark', highContrast: true });
  });

  it('ignores invalid theme string', () => {
    expect(
      parseUserUiFromMetadata({
        [USER_UI_METADATA_KEY]: { theme: 'neon' },
      })
    ).toEqual({ theme: null, highContrast: false });
  });

  it('mergeUserUiIntoMetadata preserves other keys and nested ui', () => {
    const base = {
      other: 1,
      [USER_UI_METADATA_KEY]: { theme: 'light', prefs: { x: 1 } },
    };
    const merged = mergeUserUiIntoMetadata(base, {
      theme: 'system',
      highContrast: true,
    });
    expect(merged.other).toBe(1);
    const ui = merged[USER_UI_METADATA_KEY] as Record<string, unknown>;
    expect(ui.theme).toBe('system');
    expect(ui.highContrast).toBe(true);
    expect(ui.prefs).toEqual({ x: 1 });
  });
});
