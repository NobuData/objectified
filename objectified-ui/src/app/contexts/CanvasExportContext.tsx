'use client';

/**
 * Context for canvas export: image export API (set from inside ReactFlow) and classes for data export.
 * Reference: GitHub #92 — export dialog and export functions for the Canvas.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { StudioClass } from '@lib/studio/types';
import { useStudioOptional } from '@/app/contexts/StudioContext';

export interface ImageExportApi {
  exportAsPng: () => Promise<void>;
  exportAsSvg: () => Promise<void>;
  exportAsJpeg: () => Promise<void>;
  exportAsPdf: () => Promise<void>;
}

export interface CanvasExportContextValue {
  imageExportApi: ImageExportApi | null;
  setImageExportApi: (api: ImageExportApi | null) => void;
  classes: StudioClass[];
}

const CanvasExportContext = createContext<CanvasExportContextValue | null>(null);

export function CanvasExportProvider({ children }: { children: ReactNode }) {
  const studio = useStudioOptional();
  const classes = studio?.state?.classes ?? [];
  const [imageExportApi, setImageExportApi] = useState<ImageExportApi | null>(null);
  const value = useMemo<CanvasExportContextValue>(
    () => ({ imageExportApi, setImageExportApi, classes }),
    [imageExportApi, classes]
  );
  return (
    <CanvasExportContext.Provider value={value}>
      {children}
    </CanvasExportContext.Provider>
  );
}

export function useCanvasExport(): CanvasExportContextValue {
  const ctx = useContext(CanvasExportContext);
  if (!ctx) {
    throw new Error('useCanvasExport must be used within CanvasExportProvider');
  }
  return ctx;
}

export function useCanvasExportOptional(): CanvasExportContextValue | null {
  return useContext(CanvasExportContext);
}
