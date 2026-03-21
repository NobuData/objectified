/**
 * Tenant branding from tenant.metadata.branding (optional).
 * URLs must be http(s). primaryColor: #RGB or #RRGGBB / #RRGGBBAA.
 */

export const TENANT_BRANDING_METADATA_KEY = 'branding';

export const TENANT_DEFAULT_THEME_KEY = 'defaultTheme';

export type TenantDefaultTheme = 'light' | 'dark' | 'system';

export interface TenantBranding {
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
}

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function safeColor(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const s = raw.trim();
  return HEX_COLOR.test(s) ? s : null;
}

export function parseTenantBrandingFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): TenantBranding {
  if (!metadata || !isRecord(metadata)) {
    return { logoUrl: null, faviconUrl: null, primaryColor: null };
  }
  const b = metadata[TENANT_BRANDING_METADATA_KEY];
  if (!isRecord(b)) {
    return { logoUrl: null, faviconUrl: null, primaryColor: null };
  }
  return {
    logoUrl: safeHttpUrl(b.logoUrl),
    faviconUrl: safeHttpUrl(b.faviconUrl),
    primaryColor: safeColor(b.primaryColor),
  };
}

export function parseTenantDefaultTheme(
  metadata: Record<string, unknown> | null | undefined
): TenantDefaultTheme | null {
  if (!metadata || !isRecord(metadata)) return null;
  const raw = metadata[TENANT_DEFAULT_THEME_KEY];
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return null;
}
