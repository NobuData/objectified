'use client';

/**
 * Export dialog: PNG, SVG, JPEG, PDF, Mermaid, PlantUML, DOT, GraphML, JSON.
 * Reference: GitHub #92 — export dialog and export functions for the Canvas.
 */

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Image, FileCode, Loader2 } from 'lucide-react';
import { useExportFunctions } from '@/app/hooks/useExportFunctions';

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const btnClass =
  'flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left text-sm';

export default function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const exportFns = useExportFunctions();
  const [exporting, setExporting] = useState<string | null>(null);

  const handleImageExport = async (
    label: string,
    fn: () => Promise<void>
  ): Promise<void> => {
    setExporting(label);
    try {
      await fn();
      onOpenChange(false);
    } catch (err) {
      console.error(`Export ${label} failed:`, err);
    } finally {
      setExporting(null);
    }
  };

  const handleDataExport = (label: string, fn: () => void): void => {
    setExporting(label);
    try {
      fn();
      onOpenChange(false);
    } finally {
      setExporting(null);
    }
  };

  const imageDisabled = !exportFns.imageExportReady;
  const dataDisabled = !exportFns.dataExportReady;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9998] animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden z-[9999] animate-in focus:outline-none flex flex-col"
          aria-describedby="export-dialog-description"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div>
              <Dialog.Title className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Export canvas
              </Dialog.Title>
              <Dialog.Description
                id="export-dialog-description"
                className="text-sm text-slate-500 dark:text-slate-400 mt-1"
              >
                Export the current canvas view as an image or the graph as data.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4 p-4 overflow-y-auto">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Image className="w-4 h-4" />
                Image
              </h3>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className={btnClass}
                  disabled={imageDisabled}
                  onClick={() =>
                    handleImageExport('PNG', exportFns.exportAsPng)
                  }
                  title={imageDisabled ? 'Load the canvas first' : 'Export current view as PNG'}
                >
                  {exporting === 'PNG' ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  PNG
                </button>
                <button
                  type="button"
                  className={btnClass}
                  disabled={imageDisabled}
                  onClick={() =>
                    handleImageExport('SVG', exportFns.exportAsSvg)
                  }
                  title={imageDisabled ? 'Load the canvas first' : 'Export current view as SVG'}
                >
                  {exporting === 'SVG' ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  SVG
                </button>
                <button
                  type="button"
                  className={btnClass}
                  disabled={imageDisabled}
                  onClick={() =>
                    handleImageExport('JPEG', exportFns.exportAsJpeg)
                  }
                  title={imageDisabled ? 'Load the canvas first' : 'Export current view as JPEG'}
                >
                  {exporting === 'JPEG' ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  JPEG
                </button>
                <button
                  type="button"
                  className={btnClass}
                  disabled={imageDisabled}
                  onClick={() =>
                    handleImageExport('PDF', exportFns.exportAsPdf)
                  }
                  title={imageDisabled ? 'Load the canvas first' : 'Export current view as PDF'}
                >
                  {exporting === 'PDF' ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  PDF
                </button>
              </div>
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <FileCode className="w-4 h-4" />
                Data
              </h3>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className={btnClass}
                  disabled={dataDisabled}
                  onClick={() =>
                    handleDataExport('Mermaid', exportFns.exportAsMermaid)
                  }
                  title={dataDisabled ? 'Load a version with classes first' : 'Export as Mermaid class diagram'}
                >
                  {exporting === 'Mermaid' ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  Mermaid
                </button>
                <button
                  type="button"
                  className={btnClass}
                  disabled={dataDisabled}
                  onClick={() =>
                    handleDataExport('PlantUML', exportFns.exportAsPlantUML)
                  }
                  title={dataDisabled ? 'Load a version with classes first' : 'Export as PlantUML'}
                >
                  {exporting === 'PlantUML' ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  PlantUML
                </button>
                <button
                  type="button"
                  className={btnClass}
                  disabled={dataDisabled}
                  onClick={() =>
                    handleDataExport('DOT', exportFns.exportAsDot)
                  }
                  title={dataDisabled ? 'Load a version with classes first' : 'Export as Graphviz DOT'}
                >
                  {exporting === 'DOT' ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  DOT
                </button>
                <button
                  type="button"
                  className={btnClass}
                  disabled={dataDisabled}
                  onClick={() =>
                    handleDataExport('GraphML', exportFns.exportAsGraphML)
                  }
                  title={dataDisabled ? 'Load a version with classes first' : 'Export as GraphML'}
                >
                  {exporting === 'GraphML' ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  GraphML
                </button>
                <button
                  type="button"
                  className={btnClass}
                  disabled={dataDisabled}
                  onClick={() =>
                    handleDataExport('JSON', exportFns.exportAsJson)
                  }
                  title={dataDisabled ? 'Load a version with classes first' : 'Export as JSON'}
                >
                  {exporting === 'JSON' ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  JSON
                </button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
