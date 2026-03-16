'use client';

/**
 * Context for sidebar-driven canvas actions: zoom to class node.
 * Reference: GitHub #99 — Add sidebar updates for the Classes in the Canvas.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

export interface CanvasSidebarActionsContextValue {
  /** Zoom the canvas to the class node with the given id. */
  zoomToClass: (classId: string) => void;
  /** Register the zoom handler (called from DesignCanvas inside ReactFlow). */
  registerZoomToClass: (handler: ((classId: string) => void) | null) => void;
}

const CanvasSidebarActionsContext =
  createContext<CanvasSidebarActionsContextValue | null>(null);

export function CanvasSidebarActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const zoomRef = useRef<((classId: string) => void) | null>(null);

  const zoomToClass = useCallback((classId: string) => {
    zoomRef.current?.(classId);
  }, []);

  const registerZoomToClass = useCallback(
    (handler: ((classId: string) => void) | null) => {
      zoomRef.current = handler;
    },
    []
  );

  const value = useMemo<CanvasSidebarActionsContextValue>(
    () => ({ zoomToClass, registerZoomToClass }),
    [zoomToClass, registerZoomToClass]
  );

  return (
    <CanvasSidebarActionsContext.Provider value={value}>
      {children}
    </CanvasSidebarActionsContext.Provider>
  );
}

export function useCanvasSidebarActionsOptional(): CanvasSidebarActionsContextValue | null {
  return useContext(CanvasSidebarActionsContext);
}
