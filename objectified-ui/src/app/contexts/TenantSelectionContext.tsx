'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TenantSchema } from '@lib/api/rest-client';

export interface TenantSelectionContextValue {
  tenants: TenantSchema[];
  tenantsLoading: boolean;
  selectedTenantId: string | null;
  setSelectedTenantId: (tenantId: string | null) => void;
}

export const TenantSelectionContext =
  createContext<TenantSelectionContextValue | null>(null);

export function TenantSelectionProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: TenantSelectionContextValue;
}) {
  return (
    <TenantSelectionContext.Provider value={value}>
      {children}
    </TenantSelectionContext.Provider>
  );
}

export function useTenantSelection(): TenantSelectionContextValue {
  const ctx = useContext(TenantSelectionContext);
  if (!ctx) {
    throw new Error(
      'useTenantSelection must be used within TenantSelectionProvider'
    );
  }
  return ctx;
}

export function useTenantSelectionOptional(): TenantSelectionContextValue | null {
  return useContext(TenantSelectionContext);
}
