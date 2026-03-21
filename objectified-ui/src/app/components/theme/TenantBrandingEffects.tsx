'use client';

import { useEffect, useMemo } from 'react';
import type { TenantSchema } from '@lib/api/rest-client';
import { parseTenantBrandingFromMetadata } from '@lib/ui/tenantBrandingMetadata';

const FAVICON_LINK_ID = 'objectified-tenant-favicon';

/**
 * Applies tenant branding: CSS variable --tenant-primary, optional favicon link, data attribute on <html>.
 */
export default function TenantBrandingEffects({
  tenant,
}: {
  tenant: TenantSchema | null;
}) {
  const metadataFingerprint = useMemo(
    () => JSON.stringify(tenant?.metadata ?? {}),
    [tenant?.metadata]
  );

  useEffect(() => {
    const root = document.documentElement;
    const branding = parseTenantBrandingFromMetadata(tenant?.metadata ?? undefined);

    if (branding.primaryColor) {
      root.style.setProperty('--tenant-primary', branding.primaryColor);
    } else {
      root.style.removeProperty('--tenant-primary');
    }

    const hasBranding = Boolean(
      branding.logoUrl || branding.faviconUrl || branding.primaryColor
    );
    root.toggleAttribute('data-tenant-branded', hasBranding);

    let link = document.getElementById(FAVICON_LINK_ID) as HTMLLinkElement | null;
    if (branding.faviconUrl) {
      if (!link) {
        link = document.createElement('link');
        link.id = FAVICON_LINK_ID;
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = branding.faviconUrl;
    } else if (link?.parentNode) {
      link.parentNode.removeChild(link);
    }

    return () => {
      root.style.removeProperty('--tenant-primary');
      root.removeAttribute('data-tenant-branded');
      const leftover = document.getElementById(FAVICON_LINK_ID);
      if (leftover?.parentNode) {
        leftover.parentNode.removeChild(leftover);
      }
    };
  }, [tenant?.id, metadataFingerprint]);

  return null;
}
