'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Context for requesting the class edit form from outside the sidebar
 * (e.g. double-click on a class node in the canvas).
 * Reference: GitHub #80.
 */
export interface EditClassRequestContextValue {
  /** When set, the sidebar should open the edit dialog for this class id. */
  requestEditClassId: string | null;
  requestEditClass: (classId: string) => void;
  clearRequest: () => void;
}

const EditClassRequestContext =
  createContext<EditClassRequestContextValue | null>(null);

export function EditClassRequestProvider({ children }: { children: ReactNode }) {
  const [requestEditClassId, setRequestEditClassId] = useState<string | null>(
    null
  );

  const requestEditClass = useCallback((classId: string) => {
    setRequestEditClassId(classId);
  }, []);

  const clearRequest = useCallback(() => {
    setRequestEditClassId(null);
  }, []);

  const value = useMemo<EditClassRequestContextValue>(
    () => ({ requestEditClassId, requestEditClass, clearRequest }),
    [requestEditClassId, requestEditClass, clearRequest]
  );

  return (
    <EditClassRequestContext.Provider value={value}>
      {children}
    </EditClassRequestContext.Provider>
  );
}

export function useEditClassRequest(): EditClassRequestContextValue {
  const ctx = useContext(EditClassRequestContext);
  if (!ctx) {
    throw new Error(
      'useEditClassRequest must be used within EditClassRequestProvider'
    );
  }
  return ctx;
}

export function useEditClassRequestOptional(): EditClassRequestContextValue | null {
  return useContext(EditClassRequestContext);
}
