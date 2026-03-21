'use client';

import { useSession, signOut } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const DISMISS_STORAGE_PREFIX = 'objectified:sessionExpiryDismissed:';

function warningLeadSeconds(): number {
  if (typeof process === 'undefined') return 5 * 60;
  const raw = process.env.NEXT_PUBLIC_SESSION_EXPIRY_WARNING_SECONDS;
  if (raw === '0') return 0;
  const n = Number(raw ?? 5 * 60);
  return Number.isFinite(n) && n >= 0 ? n : 5 * 60;
}

function parseExpiresMs(expires: string | undefined): number | null {
  if (!expires) return null;
  const t = Date.parse(expires);
  return Number.isFinite(t) ? t : null;
}

export default function SessionExpiryWarning() {
  const { data: session, status } = useSession();
  const leadSeconds = useMemo(() => warningLeadSeconds(), []);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const expiresAt = useMemo(
    () => parseExpiresMs(session?.expires),
    [session?.expires]
  );

  const dismissStorageKey = useMemo(() => {
    if (!expiresAt) return null;
    return `${DISMISS_STORAGE_PREFIX}${expiresAt}`;
  }, [expiresAt]);

  useEffect(() => {
    if (leadSeconds <= 0 || status !== 'authenticated' || !expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [leadSeconds, status, expiresAt]);

  useEffect(() => {
    if (!dismissStorageKey || typeof window === 'undefined') return;
    try {
      const v = sessionStorage.getItem(dismissStorageKey);
      setDismissedKey(v === '1' ? dismissStorageKey : null);
    } catch {
      setDismissedKey(null);
    }
  }, [dismissStorageKey]);

  const dismiss = useCallback(() => {
    if (!dismissStorageKey) return;
    try {
      sessionStorage.setItem(dismissStorageKey, '1');
    } catch {
      // ignore
    }
    setDismissedKey(dismissStorageKey);
  }, [dismissStorageKey]);

  const handleSignOut = useCallback(() => {
    void signOut({ callbackUrl: '/login' });
  }, []);

  if (
    leadSeconds <= 0 ||
    status !== 'authenticated' ||
    !expiresAt ||
    dismissedKey === dismissStorageKey
  ) {
    return null;
  }

  const secondsLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));
  if (secondsLeft > leadSeconds) {
    return null;
  }

  const minutesLeft = Math.max(1, Math.ceil(secondsLeft / 60));

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-2.5 border-b border-amber-200/80 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/35 text-amber-950 dark:text-amber-100 print:hidden"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm">
        Your session expires in about {minutesLeft} minute{minutesLeft === 1 ? '' : 's'}. Sign out
        and sign in again to avoid losing work.
      </p>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-amber-900 dark:bg-amber-200 text-white dark:text-amber-950 text-sm font-medium hover:bg-amber-800 dark:hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          Sign out and sign in again
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-amber-800/30 dark:border-amber-400/40 text-sm font-medium text-amber-950 dark:text-amber-100 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
