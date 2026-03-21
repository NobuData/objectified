'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getRestClientOptions, recordDashboardPageVisit } from '@lib/api/rest-client';
import { useTenantSelection } from '@/app/contexts/TenantSelectionContext';

/**
 * Fire-and-forget audit of dashboard navigations when the API has audit enabled (GitHub #188).
 */
export default function DashboardPageVisitLogger() {
  const pathname = usePathname() ?? '';
  const { data: session, status } = useSession();
  const { selectedTenantId } = useTenantSelection();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken ?? null;

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) return;
    if (!pathname.startsWith('/dashboard')) return;

    const handle = window.setTimeout(() => {
      void recordDashboardPageVisit(
        { route: pathname, tenant_id: selectedTenantId ?? null },
        getRestClientOptions({ accessToken })
      ).catch(() => {
        /* optional audit — ignore client errors */
      });
    }, 400);

    return () => window.clearTimeout(handle);
  }, [pathname, selectedTenantId, status, accessToken]);

  return null;
}
