import {
  TENANT_BRANDING_METADATA_KEY,
  TENANT_DEFAULT_THEME_KEY,
  parseTenantBrandingFromMetadata,
  parseTenantDefaultTheme,
} from '../../lib/ui/tenantBrandingMetadata';

describe('tenantBrandingMetadata', () => {
  it('returns nulls for empty metadata', () => {
    expect(parseTenantBrandingFromMetadata(undefined)).toEqual({
      logoUrl: null,
      faviconUrl: null,
      primaryColor: null,
    });
  });

  it('accepts https URLs and hex colors', () => {
    expect(
      parseTenantBrandingFromMetadata({
        [TENANT_BRANDING_METADATA_KEY]: {
          logoUrl: 'https://example.com/logo.png',
          faviconUrl: 'https://cdn.example.com/f.ico',
          primaryColor: '#4f46e5',
        },
      })
    ).toEqual({
      logoUrl: 'https://example.com/logo.png',
      faviconUrl: 'https://cdn.example.com/f.ico',
      primaryColor: '#4f46e5',
    });
  });

  it('rejects javascript: URLs and invalid colors', () => {
    expect(
      parseTenantBrandingFromMetadata({
        [TENANT_BRANDING_METADATA_KEY]: {
          logoUrl: 'javascript:alert(1)',
          primaryColor: 'red',
        },
      })
    ).toEqual({
      logoUrl: null,
      faviconUrl: null,
      primaryColor: null,
    });
  });

  it('parses defaultTheme from metadata', () => {
    expect(parseTenantDefaultTheme({ [TENANT_DEFAULT_THEME_KEY]: 'dark' })).toBe('dark');
    expect(parseTenantDefaultTheme({ [TENANT_DEFAULT_THEME_KEY]: ' system ' })).toBe('system');
    expect(parseTenantDefaultTheme({ [TENANT_DEFAULT_THEME_KEY]: 'invalid' })).toBeNull();
    expect(parseTenantDefaultTheme(undefined)).toBeNull();
  });
});
