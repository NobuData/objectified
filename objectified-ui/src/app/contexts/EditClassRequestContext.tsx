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
 * Reference: GitHub #80, #231 (add property / reference from canvas context menu).
 */
export interface EditClassRequestContextValue {
  /** When set, the sidebar should open the edit dialog for this class id. */
  requestEditClassId: string | null;
  requestEditClass: (classId: string) => void;
  clearRequest: () => void;
  /** When set, the sidebar should open "add class property" for this class (e.g. create reference). GitHub #231. */
  requestAddPropertyClassId: string | null;
  requestAddPropertyForClass: (classId: string) => void;
  clearAddPropertyRequest: () => void;
}

const EditClassRequestContext =
  createContext<EditClassRequestContextValue | null>(null);

export function EditClassRequestProvider({ children }: { children: ReactNode }) {
  const [requestEditClassId, setRequestEditClassId] = useState<string | null>(
    null
  );
  const [requestAddPropertyClassId, setRequestAddPropertyClassId] = useState<
    string | null
  >(null);

  const requestEditClass = useCallback((classId: string) => {
    setRequestEditClassId(classId);
  }, []);

  const clearRequest = useCallback(() => {
    setRequestEditClassId(null);
  }, []);

  const requestAddPropertyForClass = useCallback((classId: string) => {
    setRequestAddPropertyClassId(classId);
  }, []);

  const clearAddPropertyRequest = useCallback(() => {
    setRequestAddPropertyClassId(null);
  }, []);

  const value = useMemo<EditClassRequestContextValue>(
    () => ({
      requestEditClassId,
      requestEditClass,
      clearRequest,
      requestAddPropertyClassId,
      requestAddPropertyForClass,
      clearAddPropertyRequest,
    }),
    [
      requestEditClassId,
      requestEditClass,
      clearRequest,
      requestAddPropertyClassId,
      requestAddPropertyForClass,
      clearAddPropertyRequest,
    ]
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
