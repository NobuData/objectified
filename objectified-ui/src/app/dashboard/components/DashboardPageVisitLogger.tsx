'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getRestClientOptions, recordDashboardPageVisit } from '@lib/api/rest-client';
import { useTenantSelection } from '@/app/contexts/TenantSelectionContext';

/**
 * Fire-and-forget audit of dashboard navigations when the API has audit enabled (GitHub #188).
 * Logs at most once per distinct pathname to prevent duplicate rows when tenant context
 * resolves after the initial render.
 */
export default function DashboardPageVisitLogger() {
  const pathname = usePathname() ?? '';
  const { data: session, status } = useSession();
  const { selectedTenantId } = useTenantSelection();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken ?? null;
  const lastLoggedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) return;
    if (!pathname.startsWith('/dashboard')) return;
    if (lastLoggedPathRef.current === pathname) return;

    const handle = window.setTimeout(() => {
      lastLoggedPathRef.current = pathname;
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
