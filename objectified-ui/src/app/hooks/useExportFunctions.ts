/**
 * Hook that returns canvas export functions (image + data formats).
 * Reference: GitHub #92 — export dialog and export functions for the Canvas.
 */

import { useCallback } from 'react';
import { useCanvasExportOptional } from '@/app/contexts/CanvasExportContext';
import {
  exportAsMermaid,
  exportAsPlantUML,
  exportAsDot,
  exportAsGraphML,
  exportAsJson,
} from '@lib/studio/canvasExportFormats';

function downloadString(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export interface ExportFunctions {
  exportAsPng: () => Promise<void>;
  exportAsSvg: () => Promise<void>;
  exportAsJpeg: () => Promise<void>;
  exportAsPdf: () => Promise<void>;
  exportAsMermaid: () => void;
  exportAsPlantUML: () => void;
  exportAsDot: () => void;
  exportAsGraphML: () => void;
  exportAsJson: () => void;
  imageExportReady: boolean;
  dataExportReady: boolean;
}

export function useExportFunctions(): ExportFunctions {
  const ctx = useCanvasExportOptional();

  const noop = useCallback(async () => {}, []);

  const exportAsPng = useCallback(
    () => (ctx?.imageExportApi ? ctx.imageExportApi.exportAsPng() : noop()),
    [ctx?.imageExportApi, noop]
  );
  const exportAsSvg = useCallback(
    () => (ctx?.imageExportApi ? ctx.imageExportApi.exportAsSvg() : noop()),
    [ctx?.imageExportApi, noop]
  );
  const exportAsJpeg = useCallback(
    () => (ctx?.imageExportApi ? ctx.imageExportApi.exportAsJpeg() : noop()),
    [ctx?.imageExportApi, noop]
  );
  const exportAsPdf = useCallback(
    () => (ctx?.imageExportApi ? ctx.imageExportApi.exportAsPdf() : noop()),
    [ctx?.imageExportApi, noop]
  );

  const exportAsMermaidFn = useCallback(() => {
    if (!ctx?.classes?.length) return;
    const content = exportAsMermaid(ctx.classes);
    downloadString(content, 'diagram.mmd', 'text/plain');
  }, [ctx?.classes]);

  const exportAsPlantUMLFn = useCallback(() => {
    if (!ctx?.classes?.length) return;
    const content = exportAsPlantUML(ctx.classes);
    downloadString(content, 'diagram.puml', 'text/plain');
  }, [ctx?.classes]);

  const exportAsDotFn = useCallback(() => {
    if (!ctx?.classes?.length) return;
    const content = exportAsDot(ctx.classes);
    downloadString(content, 'graph.dot', 'text/plain');
  }, [ctx?.classes]);

  const exportAsGraphMLFn = useCallback(() => {
    if (!ctx?.classes?.length) return;
    const content = exportAsGraphML(ctx.classes);
    downloadString(content, 'graph.graphml', 'application/xml');
  }, [ctx?.classes]);

  const exportAsJsonFn = useCallback(() => {
    if (!ctx?.classes?.length) return;
    const content = exportAsJson(ctx.classes);
    downloadString(content, 'graph.json', 'application/json');
  }, [ctx?.classes]);

  return {
    exportAsPng,
    exportAsSvg,
    exportAsJpeg,
    exportAsPdf,
    exportAsMermaid: exportAsMermaidFn,
    exportAsPlantUML: exportAsPlantUMLFn,
    exportAsDot: exportAsDotFn,
    exportAsGraphML: exportAsGraphMLFn,
    exportAsJson: exportAsJsonFn,
    imageExportReady: Boolean(ctx?.imageExportApi),
    dataExportReady: Boolean(ctx?.classes?.length),
  };
}
