'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LayoutDashboard, User, UserCircle, PenTool } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

const SIDEBAR_WIDTH = 280;

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  const isProfileActive = pathname?.endsWith('/profile') ?? false;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="flex items-center justify-between h-14 px-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-6">
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
            v0.1.0
          </span>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
            <Link
              href="/data-designer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <PenTool className="h-4 w-4" />
              Data Designer
            </Link>
            <Link
              href="/dashboard/profile"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <UserCircle className="h-4 w-4" />
              Account
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
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

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          className="flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          style={{ width: SIDEBAR_WIDTH }}
          aria-label="Account navigation"
        >
          <nav className="p-3 flex flex-col gap-1">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              ACCOUNT
            </div>
            <Link
              href="/dashboard/profile"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isProfileActive
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <UserCircle className="h-4 w-4 shrink-0" />
              Profile
            </Link>
          </nav>
        </aside>

        <main className="flex-1 min-w-0 min-h-0 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
