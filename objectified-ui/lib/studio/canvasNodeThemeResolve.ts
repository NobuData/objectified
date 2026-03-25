/**
 * Merge automatic tag/tenant-derived node chrome with per-class manual theme overrides.
 *
 * Reference: GitHub #230 — Tag-based and tenant accent colors on class nodes
 */

import type { ClassNodeTheme } from './canvasClassNodeConfig';

/** Tag metadata used for canvas node styling (from version canvas_metadata.tag_definitions). */
export interface TagDefinitionForTheme {
  color?: string;
  icon?: string;
  /** When set, used as border color instead of `color`. */
  border?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface CanvasVersionNodeThemePrefs {
  /** Use tag definition colors/icons for node border and header tint when not overridden per class. */
  applyTagColorsToNodes: boolean;
  /** Use tenant primary color as a subtle default when no tag styling applies. */
  useTenantPrimaryAccent: boolean;
}

export const DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS: CanvasVersionNodeThemePrefs =
  {
    applyTagColorsToNodes: true,
    useTenantPrimaryAccent: false,
  };

/**
 * Light background tint from tag/tenant color for node body (works in light and dark themes).
 */
export function tintBackgroundFromAccent(color: string): string {
  const trimmed = color.trim();
  if (!trimmed) return 'transparent';
  return `color-mix(in srgb, ${trimmed} 16%, transparent)`;
}

/**
 * Derive automatic theme from tag order (first tag with styling wins) and optional tenant accent.
 * Priority: tag styling overrides tenant; both are overridden by per-class theme in mergeClassNodeThemes.
 */
export function resolveAutoClassNodeTheme(params: {
  tags: string[];
  tagDefinitions: Record<string, TagDefinitionForTheme>;
  tenantPrimaryColor: string | null;
  prefs: CanvasVersionNodeThemePrefs;
}): ClassNodeTheme | undefined {
  const { tags, tagDefinitions, tenantPrimaryColor, prefs } = params;

  let theme: ClassNodeTheme | undefined;

  if (prefs.useTenantPrimaryAccent && tenantPrimaryColor) {
    theme = {
      border: tenantPrimaryColor,
      backgroundColor: tintBackgroundFromAccent(tenantPrimaryColor),
      borderStyle: 'solid',
    };
  }

  if (prefs.applyTagColorsToNodes && tags.length > 0) {
    for (const tag of tags) {
      const def = tagDefinitions[tag];
      if (!def) continue;
      const borderColor = def.border ?? def.color;
      const hasIcon = Boolean(def.icon?.trim());
      if (!borderColor && !hasIcon) continue;

      theme = {
        ...theme,
        ...(borderColor
          ? {
              border: borderColor,
              borderStyle: def.borderStyle ?? 'solid',
              backgroundColor: def.color
                ? tintBackgroundFromAccent(def.color)
                : theme?.backgroundColor,
            }
          : {}),
        ...(hasIcon && def.icon ? { icon: def.icon.trim() } : {}),
      };
      break;
    }
  }

  return theme;
}

/**
 * Later layer wins for each defined field. Used to apply manual per-class theme on top of auto theme.
 */
export function mergeClassNodeThemes(
  base: ClassNodeTheme | undefined,
  override: ClassNodeTheme | undefined
): ClassNodeTheme | undefined {
  if (!base && !override) return undefined;
  return { ...base, ...override };
}
