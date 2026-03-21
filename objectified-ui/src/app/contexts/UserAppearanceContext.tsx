'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import {
  getMe,
  updateMe,
  getRestClientOptions,
} from '@lib/api/rest-client';
import {
  mergeUserUiIntoMetadata,
  parseUserUiFromMetadata,
  type UserThemePreference,
  type UserUiPatch,
} from '@lib/ui/userAppearanceMetadata';

function setHighContrastDocumentClass(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('high-contrast', enabled);
}

export interface UserAppearanceContextValue {
  highContrast: boolean;
  setHighContrast: (next: boolean) => Promise<void>;
  /** After theme change, persist to server (merges into account.metadata). */
  persistTheme: (theme: UserThemePreference) => Promise<void>;
  /** Sync local state from saved metadata (e.g. after profile form save). */
  ingestServerMetadata: (metadata: Record<string, unknown> | null | undefined) => void;
  persistError: string | null;
  clearPersistError: () => void;
}

const UserAppearanceContext = createContext<UserAppearanceContextValue | null>(null);

export function UserAppearanceProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const { setTheme } = useTheme();
  const accessToken =
    (session as { accessToken?: string } | null)?.accessToken ?? null;

  const metadataRef = useRef<Record<string, unknown>>({});
  const metadataHydratedRef = useRef(false);
  const inflightRef = useRef<Promise<void>>(Promise.resolve());
  const [highContrast, setHighContrastState] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  const clearPersistError = useCallback(() => setPersistError(null), []);

  const ingestServerMetadata = useCallback(
    (metadata: Record<string, unknown> | null | undefined) => {
      metadataHydratedRef.current = true;
      const m = metadata ?? {};
      metadataRef.current = { ...m };
      const ui = parseUserUiFromMetadata(metadataRef.current);
      setHighContrastState(ui.highContrast);
      setHighContrastDocumentClass(ui.highContrast);
      if (ui.theme) {
        setTheme(ui.theme);
      }
    },
    [setTheme]
  );

  useEffect(() => {
    if (status === 'unauthenticated') {
      metadataRef.current = {};
      metadataHydratedRef.current = false;
      setHighContrastState(false);
      setHighContrastDocumentClass(false);
    }
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (status !== 'authenticated' || !accessToken) return;
      try {
        const opts = getRestClientOptions({ accessToken });
        const me = await getMe(opts);
        if (cancelled) return;
        metadataHydratedRef.current = true;
        ingestServerMetadata(me.metadata ?? {});
      } catch {
        /* keep localStorage theme from next-themes */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, accessToken, ingestServerMetadata]);

  const persistPatch = useCallback(
    async (patch: UserUiPatch) => {
      if (status !== 'authenticated' || !accessToken) return;
      setPersistError(null);

      // Serialize all persistence calls to avoid last-write-wins races.
      // Chain the task onto the queue; swallow errors on the stored ref so a
      // failed call doesn't prevent subsequent calls from running.
      const task = inflightRef.current.then(async () => {
        if (!metadataHydratedRef.current) {
          try {
            const opts = getRestClientOptions({ accessToken });
            const me = await getMe(opts);
            metadataRef.current = { ...(me.metadata ?? {}) };
            metadataHydratedRef.current = true;
          } catch {
            /* merge from empty preserves unrelated keys as absent */
          }
        }
        // Merge patch into the latest known server state (updated by prior tasks).
        const merged = mergeUserUiIntoMetadata(metadataRef.current, patch);
        try {
          const opts = getRestClientOptions({ accessToken });
          const me = await updateMe({ metadata: merged }, opts);
          metadataRef.current = { ...(me.metadata ?? {}) };
        } catch (e) {
          setPersistError(
            e instanceof Error ? e.message : 'Failed to save appearance settings'
          );
          throw e;
        }
      });

      // Keep the queue alive even if this task errors so subsequent calls can still run.
      inflightRef.current = task.catch(() => {});

      await task;
    },
    [status, accessToken]
  );

  const persistTheme = useCallback(
    async (theme: UserThemePreference) => {
      await persistPatch({ theme });
    },
    [persistPatch]
  );

  const setHighContrast = useCallback(
    async (next: boolean) => {
      setHighContrastState(next);
      setHighContrastDocumentClass(next);
      try {
        await persistPatch({ highContrast: next });
      } catch {
        /* error state set in persistPatch */
      }
    },
    [persistPatch]
  );

  const value = useMemo<UserAppearanceContextValue>(
    () => ({
      highContrast,
      setHighContrast,
      persistTheme,
      ingestServerMetadata,
      persistError,
      clearPersistError,
    }),
    [
      highContrast,
      setHighContrast,
      persistTheme,
      ingestServerMetadata,
      persistError,
      clearPersistError,
    ]
  );

  return (
    <UserAppearanceContext.Provider value={value}>
      {children}
    </UserAppearanceContext.Provider>
  );
}

export function useUserAppearance(): UserAppearanceContextValue {
  const ctx = useContext(UserAppearanceContext);
  if (!ctx) {
    throw new Error('useUserAppearance must be used within UserAppearanceProvider');
  }
  return ctx;
}

export function useUserAppearanceOptional(): UserAppearanceContextValue | null {
  return useContext(UserAppearanceContext);
}
