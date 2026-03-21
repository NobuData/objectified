'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  GitBranch,
  Building2,
  Users,
  User,
  Upload,
  BookOpen,
  Columns3,
} from 'lucide-react';

export interface DashboardSideNavProps {
  role?: 'admin' | 'tenant-admin' | 'member';
  selectedTenantId?: string | null;
  onNavigate?: () => void;
  /** When true, render only icons (collapsed sidebar). */
  collapsed?: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  roles: Array<'admin' | 'tenant-admin' | 'member'>;
  tenantScoped?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'tenant-admin', 'member'] },
  { label: 'Profile', href: '/dashboard/profile', icon: User, roles: ['admin', 'tenant-admin', 'member'] },
  { label: 'Projects', href: '/dashboard/projects', icon: FolderKanban, roles: ['admin', 'tenant-admin', 'member'] },
  { label: 'Versions', href: '/dashboard/versions', icon: GitBranch, roles: ['admin', 'tenant-admin', 'member'] },
  { label: 'Tenants', href: '/dashboard/tenants', icon: Building2, roles: ['admin'] },
  {
    label: 'Members',
    href: '/dashboard/tenants',
    icon: Users,
    roles: ['tenant-admin'],
    tenantScoped: true,
  },
  { label: 'Schema Workspace', href: '/dashboard/schema-workspace', icon: Columns3, roles: ['admin', 'tenant-admin'] },
  { label: 'Publish', href: '/dashboard/publish', icon: Upload, roles: ['admin', 'tenant-admin'] },
  { label: 'Published', href: '/dashboard/published', icon: BookOpen, roles: ['admin', 'tenant-admin'] },
  {
    label: 'Users',
    href: '/dashboard/users',
    icon: Users,
    roles: ['admin'],
  },
];

export default function DashboardSideNav({
  role = 'member',
  selectedTenantId = null,
  onNavigate,
  collapsed = false,
}: DashboardSideNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const prefetchRoute = (href: string) => {
    router.prefetch(href);
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    // Use exact match for /dashboard/publish so /dashboard/published does not match
    if (href === '/dashboard/publish') {
      return pathname === '/dashboard/publish';
    }
    return pathname?.startsWith(href) ?? false;
  };

  const items = navItems
    .filter((item) => item.roles.includes(role))
    .map((item) => ({
      ...item,
      href:
        item.tenantScoped && selectedTenantId
          ? `/dashboard/tenants/${encodeURIComponent(selectedTenantId)}/members`
          : item.href,
    }));

  return (
    <nav
      className={`flex flex-col overflow-auto w-full ${collapsed ? 'p-2' : 'p-4'}`}
      aria-label="Sidebar links"
    >
      {!collapsed && (
        <div className="px-3 py-2 flex items-center gap-2 font-bold text-[0.65rem] uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span
            className="w-1 h-1 rounded-full opacity-60 bg-indigo-500"
            aria-hidden
          />
          Navigation
        </div>
      )}
      <ul className="mt-1 space-y-1 list-none p-0 m-0">
        {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            const linkClassName = collapsed
              ? `flex items-center justify-center py-2 px-2 rounded-lg transition-colors ${
                  active
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-indigo-500/5 hover:text-indigo-600 dark:hover:text-indigo-400'
                }`
              : `flex items-center gap-3 py-2.5 px-3 rounded-lg transition-all duration-200 hover:bg-indigo-500/10 hover:translate-x-0.5 ${
                  active
                    ? 'bg-indigo-500/10 border-l-[3px] border-indigo-500 -ml-0.5 pl-[13px] rounded-l-none'
                    : ''
                }`;
            return (
              <li key={item.href} className="mb-1">
                <Link
                  href={item.href}
                  prefetch={false}
                  onMouseEnter={() => prefetchRoute(item.href)}
                  onFocus={() => prefetchRoute(item.href)}
                  onClick={onNavigate}
                  className={linkClassName}
                  style={
                    collapsed
                      ? undefined
                      : {
                          borderLeftColor: active ? undefined : 'transparent',
                        }
                  }
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                >
                  <Icon
                    size={20}
                    className={`flex-shrink-0 transition-colors ${
                      active
                        ? 'text-indigo-500 dark:text-indigo-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  {!collapsed && (
                    <span
                      className={`text-sm flex-1 font-medium ${
                        active
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </span>
                  )}
                  {!collapsed && active && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-indigo-500 dark:bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                      aria-hidden
                    />
                  )}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
