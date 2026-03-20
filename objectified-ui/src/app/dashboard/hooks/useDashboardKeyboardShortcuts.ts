'use client';

import { useEffect } from 'react';

type DashboardRouter = { push: (href: string) => void };

const OPEN_GLOBAL_SEARCH = 'objectified:open-global-search';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[role="textbox"]'));
}

export function useDashboardKeyboardShortcuts(
  router: DashboardRouter,
  options: { onOpenMobileNav?: () => void }
) {
  const onOpenMobileNav = options.onOpenMobileNav;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey) return;
      if (e.metaKey || e.ctrlKey) return;
      if (isTypingTarget(e.target)) return;

      const raw = e.key;
      const key = raw.length === 1 ? raw.toLowerCase() : raw.toLowerCase();

      const routes: Record<string, string> = {
        h: '/',
        d: '/dashboard',
        e: '/data-designer',
        a: '/dashboard/profile',
        p: '/dashboard/projects',
        v: '/dashboard/versions',
        u: '/dashboard/users',
      };

      if (key === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(OPEN_GLOBAL_SEARCH));
        return;
      }

      if (key === 'm') {
        if (onOpenMobileNav) {
          e.preventDefault();
          onOpenMobileNav();
        }
        return;
      }

      const href = routes[key];
      if (!href) return;

      e.preventDefault();
      router.push(href);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, onOpenMobileNav]);
}
