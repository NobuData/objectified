'use client';

/**
 * Context for canvas layout actions: open auto-layout preview.
 * Reference: GitHub #88 — Layout functions to the Canvas.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from 'react';

export interface CanvasLayoutContextValue {
  /** Open the auto-layout preview dialog (no-op if not registered). */
  openLayoutPreview: () => void;
  /** Register the open handler (called from DesignCanvas). */
  registerOpenLayoutPreview: (handler: (() => void) | null) => void;
}

const CanvasLayoutContext = createContext<CanvasLayoutContextValue | null>(
  null
);

export function useCanvasLayoutOptional(): CanvasLayoutContextValue | null {
  return useContext(CanvasLayoutContext);
}

export function CanvasLayoutProvider({ children }: { children: ReactNode }) {
  const openRef = useRef<(() => void) | null>(null);

  const openLayoutPreview = useCallback(() => {
    openRef.current?.();
  }, []);

  const registerOpenLayoutPreview = useCallback(
    (handler: (() => void) | null) => {
      openRef.current = handler;
    },
    []
  );

  const value: CanvasLayoutContextValue = {
    openLayoutPreview,
    registerOpenLayoutPreview,
  };

  return (
    <CanvasLayoutContext.Provider value={value}>
      {children}
    </CanvasLayoutContext.Provider>
  );
}
