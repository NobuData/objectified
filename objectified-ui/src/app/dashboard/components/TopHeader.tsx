'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useMemo } from 'react';
import { LayoutDashboard, User, Building2, UserCircle, PenTool, Home } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import GlobalSearchDialog from '@/app/components/GlobalSearchDialog';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useCanvasFocusModeOptional } from '@/app/contexts/CanvasFocusModeContext';
import { getStableClassId } from '@lib/studio/types';

export default function TopHeader() {
  const { data: session } = useSession();
  const workspace = useWorkspaceOptional();
  const studio = useStudioOptional();
  const focusMode = useCanvasFocusModeOptional();

  const focusedClassName = useMemo(() => {
    const focusNodeId = focusMode?.state.focusNodeId;
    if (!focusNodeId) return null;
    const classes = studio?.state?.classes ?? [];
    const cls = classes.find((c) => getStableClassId(c) === focusNodeId);
    return cls?.name ?? null;
  }, [focusMode?.state.focusNodeId, studio?.state?.classes]);

  const breadcrumbs = useMemo(() => {
    const items: { label: string }[] = [{ label: 'Data Designer' }];

    if (workspace?.project?.name) items.push({ label: workspace.project.name });
    if (workspace?.version?.name) items.push({ label: workspace.version.name });

    if (focusMode?.state.focusModeEnabled && focusMode?.state.focusNodeId) {
      items.push({ label: focusedClassName ?? 'Class' });
    } else if (focusMode?.state.focusModeEnabled && focusMode?.state.focusGroupId) {
      items.push({ label: 'Group' });
    }

    return items;
  }, [
    workspace?.project?.name,
    workspace?.version?.name,
    focusMode?.state.focusModeEnabled,
    focusMode?.state.focusNodeId,
    focusMode?.state.focusGroupId,
    focusedClassName,
  ]);

  const breadcrumbItems = useMemo(() => breadcrumbs.map((b) => ({ label: b.label })), [breadcrumbs]);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  return (
    <header className="flex items-start justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 gap-3">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-6">
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
            v0.1.0
          </span>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
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
        <div className="pt-1">
          <Breadcrumbs items={breadcrumbItems} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm hidden md:flex">
          <Building2 className="h-4 w-4" />
          <span>Default Tenant</span>
        </div>
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
              <span className="text-sm font-medium max-w-[120px] truncate">
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
  );
}
