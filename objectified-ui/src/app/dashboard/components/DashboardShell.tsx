'use client';

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { User, UserCircle, PenTool, Menu, X, LayoutDashboard, Palette, Home, ChevronLeft, ChevronRight, Building2, ChevronDown } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import DashboardSideNav from './DashboardSideNav';
import ThemeSelector from '@/app/components/theme/ThemeSelector';
import { useTheme } from 'next-themes';
import Breadcrumbs, { type BreadcrumbItem } from '@/app/components/Breadcrumbs';
import GlobalSearchDialog from '@/app/components/GlobalSearchDialog';
import { getRestClientOptions, listMyTenants, type TenantSchema } from '@lib/api/rest-client';
import { useTenantPermissions } from '@/app/hooks/useTenantPermissions';
import { usePersistedTenantSelection } from '@/app/dashboard/hooks/usePersistedTenantSelection';
import { TenantSelectionProvider } from '@/app/contexts/TenantSelectionContext';
import { useDashboardKeyboardShortcuts } from '@/app/dashboard/hooks/useDashboardKeyboardShortcuts';
import TenantBrandingEffects from '@/app/components/theme/TenantBrandingEffects';
import { parseTenantBrandingFromMetadata } from '@lib/ui/tenantBrandingMetadata';

const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'objectified:dashboard:sidebarCollapsed';

type SessionUser = { is_administrator?: boolean };

export default function DashboardShell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tenants, setTenants] = useState<TenantSchema[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const { theme, resolvedTheme } = useTheme();
  const { selectedTenantId, setSelectedTenantId } = usePersistedTenantSelection(tenants);
  const tenantPermissions = useTenantPermissions(selectedTenantId);
  const accessToken = (session as { accessToken?: string } | null)?.accessToken ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gate theme label until client mount
    setMounted(true);

    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      setSidebarCollapsed(raw === '1');
    } catch {
      // Ignore localStorage errors (e.g. private browsing quota exceeded)
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        sidebarCollapsed ? '1' : '0'
      );
    } catch {
      // Ignore localStorage errors.
    }
  }, [mounted, sidebarCollapsed]);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  const getThemeDisplayName = () => {
    if (!mounted) return '';
    if (theme === 'system') {
      return `System (${resolvedTheme === 'dark' ? 'Dark' : 'Light'})`;
    }
    if (theme === 'dark') return 'Dark';
    return 'Light';
  };

  const isAdministrator = Boolean(
    (session?.user as SessionUser | undefined)?.is_administrator
  );
  const navRole: 'admin' | 'tenant-admin' | 'member' = isAdministrator
    ? 'admin'
    : tenantPermissions.permissions?.is_tenant_admin
      ? 'tenant-admin'
      : 'member';
  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  const tenantBranding = useMemo(
    () => parseTenantBrandingFromMetadata(selectedTenant?.metadata),
    [selectedTenant?.metadata]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadTenants() {
      if (status !== 'authenticated' || !session) {
        if (!cancelled) { setTenants([]); setTenantsLoading(false); }
        return;
      }
      if (!accessToken) {
        if (!cancelled) { setTenants([]); setTenantsLoading(false); }
        return;
      }
      if (!cancelled) setTenantsLoading(true);
      try {
        const opts = getRestClientOptions(accessToken ? { accessToken } : null);
        const list = await listMyTenants(opts);
        if (!cancelled) { setTenants(list); setTenantsLoading(false); }
      } catch {
        if (!cancelled) { setTenants([]); setTenantsLoading(false); }
      }
    }
    void loadTenants();
    return () => {
      cancelled = true;
    };
  }, [status, accessToken]);

  const breadcrumbs = (() => {
    if (pathname === '/dashboard') return [{ label: 'Dashboard', href: '/dashboard' }] satisfies BreadcrumbItem[];
    if (pathname === '/dashboard/profile') return [{ label: 'Account', href: '/dashboard/profile' }] satisfies BreadcrumbItem[];
    if (pathname === '/dashboard/users')
      return [{ label: 'Users', href: '/dashboard/users' }] satisfies BreadcrumbItem[];
    if (pathname === '/dashboard/projects')
      return [{ label: 'Projects', href: '/dashboard/projects' }] satisfies BreadcrumbItem[];
    if (pathname === '/dashboard/versions')
      return [{ label: 'Versions', href: '/dashboard/versions' }] satisfies BreadcrumbItem[];
    if (pathname === '/dashboard/publish')
      return [{ label: 'Publish', href: '/dashboard/publish' }] satisfies BreadcrumbItem[];
    if (pathname === '/dashboard/published')
      return [{ label: 'Published', href: '/dashboard/published' }] satisfies BreadcrumbItem[];
    if (pathname === '/dashboard/schema-workspace')
      return [
        { label: 'Schema Workspace', href: '/dashboard/schema-workspace' },
      ] satisfies BreadcrumbItem[];

    if (pathname === '/dashboard/tenants' || pathname.startsWith('/dashboard/tenants/')) {
      const crumbs: BreadcrumbItem[] = [
        { label: 'Tenants', href: '/dashboard/tenants' },
      ];

      if (pathname.endsWith('/members')) crumbs.push({ label: 'Members' });
      else if (pathname.endsWith('/administrators')) crumbs.push({ label: 'Administrators' });
      else if (pathname.endsWith('/sso')) crumbs.push({ label: 'SSO' });
      return crumbs;
    }

    return [{ label: 'Dashboard', href: '/dashboard' }] satisfies BreadcrumbItem[];
  })();

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((v) => !v);
  }, []);

  const openMobileNav = useCallback(() => setSidebarOpen(true), []);

  useDashboardKeyboardShortcuts(router, { onOpenMobileNav: openMobileNav });

  return (
    <TenantSelectionProvider value={{ tenants, tenantsLoading, selectedTenantId, setSelectedTenantId }}>
    <TenantBrandingEffects tenant={selectedTenant} />
    <div className="relative flex flex-col h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 print:bg-white print:text-black">
      <a
        href="#dashboard-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
      >
        Skip to main content
      </a>
      <header className="flex items-center justify-between h-14 px-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 print:hidden">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            aria-label="Open dashboard menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-6">
            {tenantBranding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- tenant URLs are external/dynamic
              <img
                src={tenantBranding.logoUrl}
                alt=""
                className="h-8 w-auto max-w-[140px] object-contain hidden sm:block"
              />
            ) : null}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              v0.1.0
            </span>
            <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
              <Link
                href="/"
                title="Home (Alt+Shift+H)"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Home className="h-4 w-4" />
                Home
              </Link>
              <Link
                href="/dashboard"
                title="Dashboard (Alt+Shift+D)"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link
                href="/data-designer"
                title="Data Designer (Alt+Shift+E)"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <PenTool className="h-4 w-4" />
                Data Designer
              </Link>
              <Link
                href="/dashboard/profile"
                title="Account (Alt+Shift+A)"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <UserCircle className="h-4 w-4" />
                Account
              </Link>
            </nav>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {tenants.length > 1 && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                  aria-label="Switch tenant"
                >
                  <Building2 className="h-4 w-4" />
                  <span className="max-w-[160px] truncate">
                    {selectedTenant?.name ?? 'Select tenant'}
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[220px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1 z-50"
                  sideOffset={6}
                  align="end"
                >
                  <DropdownMenu.RadioGroup
                    value={selectedTenantId ?? ''}
                    onValueChange={(next) => setSelectedTenantId(next || null)}
                  >
                    {tenants.map((tenant) => (
                      <DropdownMenu.RadioItem
                        key={tenant.id}
                        value={tenant.id}
                        className="rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800"
                      >
                        {tenant.name}
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
          <GlobalSearchDialog />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                aria-label="Profile menu"
              >
                <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                  <User className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span className="text-sm font-medium max-w-[120px] truncate hidden sm:inline">
                  {session?.user?.name ?? session?.user?.email ?? 'Profile'}
                </span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[180px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1 z-50"
                sideOffset={6}
                align="end"
              >
                <DropdownMenu.Item
                  onSelect={() => setShowThemeSelector(true)}
                  className="rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Theme
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    {getThemeDisplayName()}
                  </span>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                <DropdownMenu.Item
                  onSelect={handleSignOut}
                  className="rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800"
                >
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <div className="shrink-0 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 print:hidden">
        <Breadcrumbs items={breadcrumbs} />
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          className="hidden md:flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:hidden"
          style={{ width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
          aria-label="Dashboard navigation"
        >
          <div className="flex items-center justify-end gap-2 px-2 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              aria-label={sidebarCollapsed ? 'Expand dashboard sidebar' : 'Collapse dashboard sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          <DashboardSideNav
            role={navRole}
            selectedTenantId={selectedTenantId}
            collapsed={sidebarCollapsed}
          />
        </aside>

        <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <Dialog.Content
              className="fixed top-0 left-0 z-50 h-full w-[280px] max-w-[85vw] border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left focus:outline-none md:hidden"
              aria-describedby={undefined}
            >
              <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200 dark:border-slate-700">
                <Dialog.Title className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Menu
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors focus:outline-none"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </Dialog.Close>
              </div>
              <DashboardSideNav
                role={navRole}
                selectedTenantId={selectedTenantId}
                onNavigate={closeSidebar}
                collapsed={false}
              />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <main
          id="dashboard-main-content"
          tabIndex={-1}
          className="flex-1 min-w-0 min-h-0 overflow-auto bg-transparent print:overflow-visible focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-inset dark:focus-visible:ring-offset-slate-900"
        >
          {children}
        </main>
      </div>

      {/* Theme Selector Dialog */}
      <ThemeSelector
        isOpen={showThemeSelector}
        onClose={() => setShowThemeSelector(false)}
      />
    </div>
    </TenantSelectionProvider>
  );
}
