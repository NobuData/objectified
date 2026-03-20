'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type MotionPreference = 'system' | 'reduce' | 'full';

const STORAGE_KEY = 'objectified:motionPreference';

function readStored(): MotionPreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'reduce' || v === 'full' || v === 'system') return v;
  } catch {
    // Ignore storage errors.
  }
  return 'system';
}

function effectiveReduce(pref: MotionPreference): boolean {
  if (pref === 'reduce') return true;
  if (pref === 'full') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function applyReduceClass(pref: MotionPreference) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('reduce-motion', effectiveReduce(pref));
}

type MotionPreferenceContextValue = {
  motionPreference: MotionPreference;
  setMotionPreference: (value: MotionPreference) => void;
};

const MotionPreferenceContext = createContext<MotionPreferenceContextValue | null>(null);

export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  const [motionPreference, setMotionPreferenceState] = useState<MotionPreference>('system');

  // Read persisted preference after mount so SSR markup matches the first client paint.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only localStorage; avoids hydration mismatch vs useState(readStored)
    setMotionPreferenceState(readStored());
  }, []);

  useEffect(() => {
    applyReduceClass(motionPreference);
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => {
      if (motionPreference === 'system') applyReduceClass('system');
    };
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, [motionPreference]);

  const setMotionPreference = useCallback((value: MotionPreference) => {
    setMotionPreferenceState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage errors.
    }
    applyReduceClass(value);
  }, []);

  const value = useMemo(
    () => ({ motionPreference, setMotionPreference }),
    [motionPreference, setMotionPreference]
  );

  return (
    <MotionPreferenceContext.Provider value={value}>
      {children}
    </MotionPreferenceContext.Provider>
  );
}

export function useMotionPreference(): MotionPreferenceContextValue {
  const ctx = useContext(MotionPreferenceContext);
  if (!ctx) {
    throw new Error('useMotionPreference must be used within MotionPreferenceProvider');
  }
  return ctx;
}

export function useMotionPreferenceOptional(): MotionPreferenceContextValue | null {
  return useContext(MotionPreferenceContext);
}
