'use client';

/**
 * Toggles the docked code preview panel on the data designer (schema designer).
 * Reference: GitHub #120.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type CodeGenerationPanelContextValue = {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  /** Toolbar registers the handler that opens the full Generate code dialog */
  registerOpenGenerateCodeDialog: (fn: (() => void) | null) => void;
  requestOpenGenerateCodeDialog: () => void;
};

const CodeGenerationPanelContext = createContext<CodeGenerationPanelContextValue | null>(null);

export function CodeGenerationPanelProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const openDialogRef = useRef<(() => void) | null>(null);
  const togglePanel = useCallback(() => {
    setPanelOpen((o) => !o);
  }, []);

  const registerOpenGenerateCodeDialog = useCallback((fn: (() => void) | null) => {
    openDialogRef.current = fn;
  }, []);

  const requestOpenGenerateCodeDialog = useCallback(() => {
    openDialogRef.current?.();
  }, []);

  const value = useMemo(
    () => ({
      panelOpen,
      setPanelOpen,
      togglePanel,
      registerOpenGenerateCodeDialog,
      requestOpenGenerateCodeDialog,
    }),
    [panelOpen, togglePanel, registerOpenGenerateCodeDialog, requestOpenGenerateCodeDialog]
  );

  return (
    <CodeGenerationPanelContext.Provider value={value}>{children}</CodeGenerationPanelContext.Provider>
  );
}

export function useCodeGenerationPanelOptional(): CodeGenerationPanelContextValue | null {
  return useContext(CodeGenerationPanelContext);
}
