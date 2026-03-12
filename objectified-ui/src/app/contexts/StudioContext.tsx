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
  pullVersion,
  listProperties,
  commitVersion,
  type RestClientOptions,
} from '@lib/api/rest-client';
import type { LocalVersionState } from '@lib/studio/types';
import {
  pullResponseToState,
  stateToCommitPayload,
} from '@lib/studio/stateAdapter';

function deepClone<T>(x: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(x) as T;
  }
  return JSON.parse(JSON.stringify(x)) as T;
}

export interface StudioContextValue {
  /** Current local version state; null when no version loaded or not yet loaded. */
  state: LocalVersionState | null;
  /** Whether a load or save is in progress. */
  loading: boolean;
  /** Last load or save error message. */
  error: string | null;
  /** Load version from server (pull + optional project properties). Clears undo/redo. */
  loadFromServer: (
    versionId: string,
    options: RestClientOptions,
    opts?: { tenantId?: string; projectId?: string }
  ) => Promise<void>;
  /** Apply a mutation to state; pushes current state to undo stack and clears redo. */
  applyChange: (updater: (draft: LocalVersionState) => void) => void;
  /** Undo last change. */
  undo: () => void;
  /** Redo last undone change. */
  redo: () => void;
  /** Persist current state to server via commit. Updates revision on success. */
  save: (options: RestClientOptions) => Promise<void>;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Clear state and stacks (e.g. when switching version). */
  clear: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

const MAX_UNDO = 50;

interface StudioStackState {
  state: LocalVersionState | null;
  undoStack: LocalVersionState[];
  redoStack: LocalVersionState[];
}

const initialStack: StudioStackState = {
  state: null,
  undoStack: [],
  redoStack: [],
};

export function StudioProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<StudioStackState>(initialStack);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = stack.state;

  const clear = useCallback(() => {
    setStack(initialStack);
    setError(null);
  }, []);

  const loadFromServer = useCallback(
    async (
      versionId: string,
      options: RestClientOptions,
      opts?: { tenantId?: string; projectId?: string }
    ) => {
      setLoading(true);
      setError(null);
      try {
        const [pullRes, propertiesList] = await Promise.all([
          pullVersion(versionId, options),
          opts?.tenantId && opts?.projectId
            ? listProperties(opts.tenantId, opts.projectId, options)
            : Promise.resolve([]),
        ]);
        const newState = pullResponseToState(pullRes, propertiesList);
        setStack({
          state: newState,
          undoStack: [],
          redoStack: [],
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to load version';
        setError(message);
        setStack(initialStack);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const applyChange = useCallback((updater: (draft: LocalVersionState) => void) => {
    setStack((prev) => {
      if (!prev.state) return prev;
      const draft = deepClone(prev.state);
      updater(draft);
      const undoStack = [...prev.undoStack, deepClone(prev.state)];
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      return {
        state: draft,
        undoStack,
        redoStack: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setStack((prev) => {
      if (prev.undoStack.length === 0) return prev;
      const nextState = prev.undoStack[prev.undoStack.length - 1];
      const redoStack = prev.state ? [...prev.redoStack, prev.state] : prev.redoStack;
      return {
        state: nextState,
        undoStack: prev.undoStack.slice(0, -1),
        redoStack,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setStack((prev) => {
      if (prev.redoStack.length === 0) return prev;
      const nextState = prev.redoStack[prev.redoStack.length - 1];
      const undoStack = prev.state ? [...prev.undoStack, prev.state] : prev.undoStack;
      return {
        state: nextState,
        undoStack,
        redoStack: prev.redoStack.slice(0, -1),
      };
    });
  }, []);

  const save = useCallback(
    async (options: RestClientOptions) => {
      const current = state;
      if (!current) {
        setError('No version state to save');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload = stateToCommitPayload(current);
        const res = await commitVersion(current.versionId, payload, options);
        setStack((s) =>
          s.state
            ? {
                ...s,
                state: { ...s.state, revision: res.revision },
                undoStack: [],
                redoStack: [],
              }
            : s
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save');
      } finally {
        setLoading(false);
      }
    },
    [state]
  );

  const canUndo = stack.undoStack.length > 0;
  const canRedo = stack.redoStack.length > 0;

  const value = useMemo<StudioContextValue>(
    () => ({
      state,
      loading,
      error,
      loadFromServer,
      applyChange,
      undo,
      redo,
      save,
      canUndo,
      canRedo,
      clear,
    }),
    [
      state,
      loading,
      error,
      loadFromServer,
      applyChange,
      undo,
      redo,
      save,
      canUndo,
      canRedo,
      clear,
    ]
  );

  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  );
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudio must be used within StudioProvider');
  }
  return ctx;
}

export function useStudioOptional(): StudioContextValue | null {
  return useContext(StudioContext);
}
