'use client';

/**
 * Context for canvas focus mode: focus on a node or group and show only its
 * N-degree neighbors. Exit with Escape.
 * Reference: GitHub #87 — Implement Focus Mode into the Canvas.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  defaultFocusModeState,
  type FocusModeState,
} from '@lib/studio/canvasFocusMode';

export interface CanvasFocusModeContextValue {
  state: FocusModeState;
  /** Enter focus mode anchored on a single node id. */
  enterFocusOnNode: (nodeId: string) => void;
  /** Enter focus mode anchored on all members of a group. */
  enterFocusOnGroup: (groupId: string) => void;
  /** Change the neighbor degree (N-hops). */
  setDegree: (degree: number) => void;
  /** Exit focus mode entirely. */
  exitFocusMode: () => void;
}

const CanvasFocusModeContext =
  createContext<CanvasFocusModeContextValue | null>(null);

export function CanvasFocusModeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<FocusModeState>(defaultFocusModeState);

  const enterFocusOnNode = useCallback((nodeId: string) => {
    setState((prev) => ({
      ...prev,
      focusModeEnabled: true,
      focusNodeId: nodeId,
      focusGroupId: null,
    }));
  }, []);

  const enterFocusOnGroup = useCallback((groupId: string) => {
    setState((prev) => ({
      ...prev,
      focusModeEnabled: true,
      focusNodeId: null,
      focusGroupId: groupId,
    }));
  }, []);

  const setDegree = useCallback((degree: number) => {
    setState((prev) => ({
      ...prev,
      focusModeDegree: Math.max(0, degree),
    }));
  }, []);

  const exitFocusMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      focusModeEnabled: false,
      focusNodeId: null,
      focusGroupId: null,
    }));
  }, []);

  const value = useMemo<CanvasFocusModeContextValue>(
    () => ({
      state,
      enterFocusOnNode,
      enterFocusOnGroup,
      setDegree,
      exitFocusMode,
    }),
    [state, enterFocusOnNode, enterFocusOnGroup, setDegree, exitFocusMode]
  );

  return (
    <CanvasFocusModeContext.Provider value={value}>
      {children}
    </CanvasFocusModeContext.Provider>
  );
}

export function useCanvasFocusMode(): CanvasFocusModeContextValue {
  const ctx = useContext(CanvasFocusModeContext);
  if (!ctx) {
    throw new Error(
      'useCanvasFocusMode must be used within CanvasFocusModeProvider'
    );
  }
  return ctx;
}

export function useCanvasFocusModeOptional(): CanvasFocusModeContextValue | null {
  return useContext(CanvasFocusModeContext);
}

