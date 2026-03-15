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

/** Options for image export (GitHub #93 — export wizard). */
export interface ImageExportOptions {
  /** Background color (e.g. 'white', 'transparent', or hex). */
  backgroundColor?: string;
  /** When false, group nodes are excluded from the capture. */
  includeGroups?: boolean;
}

export interface ImageExportApi {
  exportAsPng: (options?: ImageExportOptions) => Promise<void>;
  exportAsSvg: (options?: ImageExportOptions) => Promise<void>;
  exportAsJpeg: (options?: ImageExportOptions) => Promise<void>;
  exportAsPdf: (options?: ImageExportOptions) => Promise<void>;
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
