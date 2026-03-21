/**
 * Conventions for account.metadata.ui (GET/PATCH /me).
 * Dashboard and Data Designer read these keys for theme and accessibility.
 */

export const USER_UI_METADATA_KEY = 'ui';

export type UserThemePreference = 'light' | 'dark' | 'system';

export interface UserUiPreferences {
  theme: UserThemePreference | null;
  highContrast: boolean;
}

const THEME_IDS: UserThemePreference[] = ['light', 'dark', 'system'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseUserUiFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): UserUiPreferences {
  if (!metadata || !isRecord(metadata)) {
    return { theme: null, highContrast: false };
  }
  const ui = metadata[USER_UI_METADATA_KEY];
  if (!isRecord(ui)) {
    return { theme: null, highContrast: false };
  }
  const themeRaw = ui.theme;
  const theme =
    typeof themeRaw === 'string' && THEME_IDS.includes(themeRaw as UserThemePreference)
      ? (themeRaw as UserThemePreference)
      : null;
  const highContrast = ui.highContrast === true;
  return { theme, highContrast };
}

export interface UserUiPatch {
  theme?: UserThemePreference;
  highContrast?: boolean;
}

/**
 * Deep-shallow merge: preserves unrelated metadata keys and nested ui keys not touched.
 */
export function mergeUserUiIntoMetadata(
  base: Record<string, unknown>,
  patch: UserUiPatch
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base };
  const prevUi = next[USER_UI_METADATA_KEY];
  const ui: Record<string, unknown> = isRecord(prevUi) ? { ...prevUi } : {};
  if (patch.theme !== undefined) {
    ui.theme = patch.theme;
  }
  if (patch.highContrast !== undefined) {
    ui.highContrast = patch.highContrast;
  }
  next[USER_UI_METADATA_KEY] = ui;
  return next;
}
