'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export interface DashboardForbiddenProps {
  title?: string;
  message?: string;
}

export default function DashboardForbidden({
  title = 'Access denied',
  message = 'You do not have permission to view this page.',
}: DashboardForbiddenProps) {
  return (
    <div
      className="p-6 max-w-lg mx-auto flex flex-col items-center text-center gap-4"
      role="alert"
    >
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 flex items-center justify-center">
        <ShieldAlert className="h-7 w-7 text-amber-600 dark:text-amber-400" aria-hidden />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{message}</p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
