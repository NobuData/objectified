'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getCanvasSettings,
  saveCanvasSettings,
  type CanvasSettings,
} from '@lib/studio/canvasSettings';

export interface CanvasSettingsContextValue {
  settings: CanvasSettings;
  setSettings: (settings: CanvasSettings) => void;
}

export const CanvasSettingsContext =
  createContext<CanvasSettingsContextValue | null>(null);

export function CanvasSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<CanvasSettings>(getCanvasSettings);

  const setSettings = useCallback((next: CanvasSettings) => {
    setSettingsState(next);
    saveCanvasSettings(next);
  }, []);

  const value = useMemo<CanvasSettingsContextValue>(
    () => ({ settings, setSettings }),
    [settings, setSettings]
  );

  return (
    <CanvasSettingsContext.Provider value={value}>
      {children}
    </CanvasSettingsContext.Provider>
  );
}

export function useCanvasSettings(): CanvasSettingsContextValue {
  const ctx = useContext(CanvasSettingsContext);
  if (!ctx) {
    throw new Error(
      'useCanvasSettings must be used within CanvasSettingsProvider'
    );
  }
  return ctx;
}

export function useCanvasSettingsOptional(): CanvasSettingsContextValue | null {
  return useContext(CanvasSettingsContext);
}
