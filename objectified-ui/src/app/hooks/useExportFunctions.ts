/**
 * Hook that returns canvas export functions (image + data formats).
 * Reference: GitHub #92, #93 — export dialog and export wizard.
 */

import { useCallback } from 'react';
import {
  useCanvasExportOptional,
  type ImageExportOptions,
} from '@/app/contexts/CanvasExportContext';
import {
  exportAsMermaid,
  exportAsPlantUML,
  exportAsDot,
  exportAsGraphML,
  exportAsJson,
  type ExportGraphOptions,
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
  exportAsPng: (options?: ImageExportOptions) => Promise<void>;
  exportAsSvg: (options?: ImageExportOptions) => Promise<void>;
  exportAsJpeg: (options?: ImageExportOptions) => Promise<void>;
  exportAsPdf: (options?: ImageExportOptions) => Promise<void>;
  exportAsMermaid: (options?: ExportGraphOptions) => void;
  exportAsPlantUML: (options?: ExportGraphOptions) => void;
  exportAsDot: (options?: ExportGraphOptions) => void;
  exportAsGraphML: (options?: ExportGraphOptions) => void;
  exportAsJson: (options?: ExportGraphOptions) => void;
  imageExportReady: boolean;
  dataExportReady: boolean;
}

export function useExportFunctions(): ExportFunctions {
  const ctx = useCanvasExportOptional();

  const noop = useCallback(async () => {}, []);

  const exportAsPng = useCallback(
    (opts?: ImageExportOptions) =>
      ctx?.imageExportApi ? ctx.imageExportApi.exportAsPng(opts) : noop(),
    [ctx?.imageExportApi, noop]
  );
  const exportAsSvg = useCallback(
    (opts?: ImageExportOptions) =>
      ctx?.imageExportApi ? ctx.imageExportApi.exportAsSvg(opts) : noop(),
    [ctx?.imageExportApi, noop]
  );
  const exportAsJpeg = useCallback(
    (opts?: ImageExportOptions) =>
      ctx?.imageExportApi ? ctx.imageExportApi.exportAsJpeg(opts) : noop(),
    [ctx?.imageExportApi, noop]
  );
  const exportAsPdf = useCallback(
    (opts?: ImageExportOptions) =>
      ctx?.imageExportApi ? ctx.imageExportApi.exportAsPdf(opts) : noop(),
    [ctx?.imageExportApi, noop]
  );

  const exportAsMermaidFn = useCallback(
    (opts?: ExportGraphOptions) => {
      if (!ctx?.classes?.length) return;
      const content = exportAsMermaid(ctx.classes, opts);
      downloadString(content, 'diagram.mmd', 'text/plain');
    },
    [ctx?.classes]
  );

  const exportAsPlantUMLFn = useCallback(
    (opts?: ExportGraphOptions) => {
      if (!ctx?.classes?.length) return;
      const content = exportAsPlantUML(ctx.classes, opts);
      downloadString(content, 'diagram.puml', 'text/plain');
    },
    [ctx?.classes]
  );

  const exportAsDotFn = useCallback(
    (opts?: ExportGraphOptions) => {
      if (!ctx?.classes?.length) return;
      const content = exportAsDot(ctx.classes, opts);
      downloadString(content, 'graph.dot', 'text/plain');
    },
    [ctx?.classes]
  );

  const exportAsGraphMLFn = useCallback(
    (opts?: ExportGraphOptions) => {
      if (!ctx?.classes?.length) return;
      const content = exportAsGraphML(ctx.classes, opts);
      downloadString(content, 'graph.graphml', 'application/xml');
    },
    [ctx?.classes]
  );

  const exportAsJsonFn = useCallback(
    (opts?: ExportGraphOptions) => {
      if (!ctx?.classes?.length) return;
      const content = exportAsJson(ctx.classes, opts);
      downloadString(content, 'graph.json', 'application/json');
    },
    [ctx?.classes]
  );

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
