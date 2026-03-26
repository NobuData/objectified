'use client';

/**
 * Context for sidebar-driven canvas actions: zoom to class or group on the canvas.
 * Reference: GitHub #99 — Add sidebar updates for the Classes in the Canvas.
 * GitHub #238 — zoom to group (including members).
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
  /** Zoom to fit a group and its member nodes (GitHub #238). */
  zoomToGroup: (groupId: string) => void;
  registerZoomToGroup: (handler: ((groupId: string) => void) | null) => void;
}

const CanvasSidebarActionsContext =
  createContext<CanvasSidebarActionsContextValue | null>(null);

export function CanvasSidebarActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const zoomRef = useRef<((classId: string) => void) | null>(null);
  const zoomGroupRef = useRef<((groupId: string) => void) | null>(null);

  const zoomToClass = useCallback((classId: string) => {
    zoomRef.current?.(classId);
  }, []);

  const zoomToGroup = useCallback((groupId: string) => {
    zoomGroupRef.current?.(groupId);
  }, []);

  const registerZoomToClass = useCallback(
    (handler: ((classId: string) => void) | null) => {
      zoomRef.current = handler;
    },
    []
  );

  const registerZoomToGroup = useCallback(
    (handler: ((groupId: string) => void) | null) => {
      zoomGroupRef.current = handler;
    },
    []
  );

  const value = useMemo<CanvasSidebarActionsContextValue>(
    () => ({
      zoomToClass,
      registerZoomToClass,
      zoomToGroup,
      registerZoomToGroup,
    }),
    [zoomToClass, registerZoomToClass, zoomToGroup, registerZoomToGroup]
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
