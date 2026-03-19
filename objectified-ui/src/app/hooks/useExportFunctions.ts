/**
 * Hook that returns canvas export functions (image + data formats).
 * Reference: GitHub #92, #93 — export dialog and export wizard.
 */

import { useCallback } from 'react';
import {
  useCanvasExportOptional,
  type ImageExportOptions,
} from '@/app/contexts/CanvasExportContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import {
  exportAsMermaid,
  exportAsPlantUML,
  exportAsDot,
  exportAsGraphML,
  exportAsJson,
  exportAsOpenApi,
  exportAsSqlDdl,
  exportAsDocsMarkdown,
  exportAsDocsHtml,
  type ExportDocsOptions,
  type ExportGraphOptions,
} from '@lib/studio/canvasExportFormats';
import { getSchemaMode, type SchemaMode } from '@lib/studio/schemaMode';

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
  exportAsOpenApi: () => void;
  exportAsSqlDdl: () => void;
  exportAsDocsMarkdown: (options?: ExportDocsOptions) => void;
  exportAsDocsHtml: (options?: ExportDocsOptions) => void;
  imageExportReady: boolean;
  dataExportReady: boolean;
  schemaMode: SchemaMode;
}

export function useExportFunctions(): ExportFunctions {
  const ctx = useCanvasExportOptional();
  const studio = useStudioOptional();
  const schemaMode: SchemaMode = studio?.state ? getSchemaMode(studio.state) : 'openapi';

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

  const exportAsOpenApiFn = useCallback(() => {
    if (!ctx?.classes?.length) return;
    const content = exportAsOpenApi(ctx.classes);
    downloadString(content, 'openapi.json', 'application/json');
  }, [ctx?.classes]);

  const exportAsDocsMarkdownFn = useCallback(
    (opts?: ExportDocsOptions) => {
      if (!ctx?.classes?.length) return;
      const content = exportAsDocsMarkdown(ctx.classes, opts);
      downloadString(content, 'api-docs.md', 'text/markdown');
    },
    [ctx?.classes]
  );

  const exportAsDocsHtmlFn = useCallback(
    (opts?: ExportDocsOptions) => {
      if (!ctx?.classes?.length) return;
      const content = exportAsDocsHtml(ctx.classes, opts);
      downloadString(content, 'api-docs.html', 'text/html');
    },
    [ctx?.classes]
  );

  const exportAsSqlDdlFn = useCallback(() => {
    if (!ctx?.classes?.length) return;
    const content = exportAsSqlDdl(ctx.classes);
    downloadString(content, 'schema.sql', 'text/plain');
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
    exportAsOpenApi: exportAsOpenApiFn,
    exportAsDocsMarkdown: exportAsDocsMarkdownFn,
    exportAsDocsHtml: exportAsDocsHtmlFn,
    exportAsSqlDdl: exportAsSqlDdlFn,
    imageExportReady: Boolean(ctx?.imageExportApi),
    dataExportReady: Boolean(ctx?.classes?.length),
    schemaMode,
  };
}
