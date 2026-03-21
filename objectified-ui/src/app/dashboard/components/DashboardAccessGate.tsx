'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { useTenantSelection } from '@/app/contexts/TenantSelectionContext';
import { useTenantPermissions } from '@/app/hooks/useTenantPermissions';
import DashboardForbidden from './DashboardForbidden';

type SessionUser = { is_administrator?: boolean };

export default function DashboardAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const { data: session, status } = useSession();
  const { selectedTenantId } = useTenantSelection();

  const isAdministrator = Boolean(
    (session?.user as SessionUser | undefined)?.is_administrator
  );

  const tenantSubmatch = useMemo(
    () =>
      pathname.match(/^\/dashboard\/tenants\/([^/]+)\/(members|administrators|sso)(?:\/|$)/),
    [pathname]
  );
  const pathTenantId = tenantSubmatch?.[1] ?? null;

  const selectedPerms = useTenantPermissions(selectedTenantId);
  const pathTenantPerms = useTenantPermissions(pathTenantId);

  if (status === 'loading') {
    return (
      <div className="p-6 flex items-center justify-center text-slate-500 dark:text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (pathname === '/dashboard/users' && !isAdministrator) {
    return (
      <DashboardForbidden message="Only platform administrators can manage users." />
    );
  }

  if (pathname === '/dashboard/tenants' && !isAdministrator) {
    return (
      <DashboardForbidden message="Only platform administrators can manage tenants." />
    );
  }

  if (pathTenantId) {
    if (pathTenantPerms.loading) {
      return (
        <div className="p-6 flex items-center justify-center text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" aria-label="Checking access" />
        </div>
      );
    }
    const ok =
      isAdministrator || Boolean(pathTenantPerms.permissions?.is_tenant_admin);
    if (!ok) {
      return (
        <DashboardForbidden message="Tenant administrators or platform administrators only." />
      );
    }
  }

  const needsTenantAdmin =
    pathname === '/dashboard/schema-workspace' ||
    pathname === '/dashboard/publish' ||
    pathname === '/dashboard/published';

  if (needsTenantAdmin) {
    if (selectedPerms.loading && selectedTenantId) {
      return (
        <div className="p-6 flex items-center justify-center text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" aria-label="Checking access" />
        </div>
      );
    }
    const ok =
      isAdministrator ||
      (Boolean(selectedTenantId) && Boolean(selectedPerms.permissions?.is_tenant_admin));
    if (!ok) {
      return (
        <DashboardForbidden message="Schema workspace and publishing require tenant administrator access for the selected tenant." />
      );
    }
  }

  return <>{children}</>;
}
