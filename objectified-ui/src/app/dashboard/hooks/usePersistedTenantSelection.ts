'use client';

import { useEffect, useState } from 'react';
import type { TenantSchema } from '@lib/api/rest-client';

export const DASHBOARD_TENANT_STORAGE_KEY = 'objectified:dashboard:selectedTenantId';

export function usePersistedTenantSelection(tenants: TenantSchema[]): {
  selectedTenantId: string | null;
  setSelectedTenantId: (tenantId: string | null) => void;
} {
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (tenants.length === 0) {
      setSelectedTenantId(null);
      return;
    }

    let persistedTenantId: string | null = null;
    try {
      persistedTenantId = localStorage.getItem(DASHBOARD_TENANT_STORAGE_KEY);
    } catch {
      // Ignore localStorage errors.
    }

    setSelectedTenantId((current) => {
      if (current && tenants.some((tenant) => tenant.id === current)) {
        return current;
      }
      if (persistedTenantId && tenants.some((tenant) => tenant.id === persistedTenantId)) {
        return persistedTenantId;
      }
      return tenants[0].id;
    });
  }, [tenants]);

  useEffect(() => {
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
