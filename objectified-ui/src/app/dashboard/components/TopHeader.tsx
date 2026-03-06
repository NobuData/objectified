'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { LayoutDashboard, User, Building2 } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export default function TopHeader() {
  const { data: session } = useSession();

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  return (
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
            Design Canvas
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm">
          <Building2 className="h-4 w-4" />
          <span>Default Tenant</span>
        </div>
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
