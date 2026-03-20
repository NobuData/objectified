'use client';

import { useEffect, useRef, useState } from 'react';
import type { TenantSchema } from '@lib/api/rest-client';

export const DASHBOARD_TENANT_STORAGE_KEY = 'objectified:dashboard:selectedTenantId';

function readPersistedTenantId(): string | null {
  try {
    return localStorage.getItem(DASHBOARD_TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function usePersistedTenantSelection(tenants: TenantSchema[]): {
  selectedTenantId: string | null;
  setSelectedTenantId: (tenantId: string | null) => void;
} {
  // Initialize directly from localStorage so we never erase a persisted id on mount.
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(readPersistedTenantId);
  // Only write/remove localStorage after the tenant list has been validated at least once.
  const tenantsLoaded = useRef(false);

  useEffect(() => {
    if (tenants.length === 0) {
      return;
    }

    tenantsLoaded.current = true;

    setSelectedTenantId((current) => {
      if (current && tenants.some((tenant) => tenant.id === current)) {
        return current;
      }
      const persisted = readPersistedTenantId();
      if (persisted && tenants.some((tenant) => tenant.id === persisted)) {
        return persisted;
      }
      return tenants[0].id;
    });
  }, [tenants]);

  useEffect(() => {
    // Do not touch localStorage before the tenant list has been loaded and validated;
    // this prevents erasing a stored tenant id during initial mount.
    if (!tenantsLoaded.current) return;
    try {
      if (selectedTenantId) {
        localStorage.setItem(DASHBOARD_TENANT_STORAGE_KEY, selectedTenantId);
      } else {
        localStorage.removeItem(DASHBOARD_TENANT_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage errors.
    }
  }, [selectedTenantId]);

  return { selectedTenantId, setSelectedTenantId };
}
