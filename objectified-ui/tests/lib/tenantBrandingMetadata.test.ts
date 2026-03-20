import {
  TENANT_BRANDING_METADATA_KEY,
  parseTenantBrandingFromMetadata,
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
});
