'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  const lastIdx = items.length - 1;

  return (
    <nav aria-label="Breadcrumbs" className={className}>
      <ol className="flex items-center gap-2 min-w-0">
        {items.map((item, idx) => {
          const isLast = idx === lastIdx;
          const content: ReactNode = item.href && !isLast ? (
            <Link
              href={item.href}
              className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
            >
              {item.label}
            </Link>
          ) : (
            <span
              className={`text-slate-800 dark:text-slate-100 font-medium truncate ${
                isLast ? '' : 'text-slate-600 dark:text-slate-300 font-normal'
              }`}
              aria-current={isLast ? 'page' : undefined}
            >
              {item.label}
            </span>
          );

          return (
            <li key={`${item.href ?? 'no-href'}:${item.label}:${idx}`} className="min-w-0 flex">
              {content}
              {!isLast && (
                <span
                  className="mx-1 text-slate-400 dark:text-slate-500 shrink-0"
                  aria-hidden
                >
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

