'use client';

/**
 * Registers canvas image export API with CanvasExportContext. Must be rendered inside ReactFlow.
 * Uses html-to-image to capture the flow viewport. Reference: GitHub #92, #93 — export wizard.
 */

import { useCallback, useEffect, useRef } from 'react';
import { toPng, toSvg, toJpeg } from 'html-to-image';
import {
  useCanvasExportOptional,
  type ImageExportOptions,
} from '@/app/contexts/CanvasExportContext';

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function buildFilter(includeGroups: boolean): ((node: HTMLElement) => boolean) | undefined {
  if (includeGroups) return undefined;
  return (node: HTMLElement) => node.getAttribute?.('data-nodetype') !== 'group';
}

export default function CanvasExportRegistration() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const exportContext = useCanvasExportOptional();
  const setImageExportApi = exportContext?.setImageExportApi;

  const getFlowElement = useCallback((): HTMLElement | null => {
    const el = containerRef.current?.closest('.react-flow');
    return el ? (el as HTMLElement) : null;
  }, []);

  useEffect(() => {
    if (!setImageExportApi) return;

    const exportAsPng = async (options?: ImageExportOptions): Promise<void> => {
      const el = getFlowElement();
      if (!el) return;
      const bg = options?.backgroundColor ?? 'white';
      const filter = buildFilter(options?.includeGroups ?? true);
      try {
        const dataUrl = await toPng(el, {
          backgroundColor: bg,
          pixelRatio: 2,
          cacheBust: true,
          filter,
        });
        downloadDataUrl(dataUrl, 'canvas-export.png');
      } catch (err) {
        console.error('Export as PNG failed:', err);
      }
    };

    const exportAsSvg = async (options?: ImageExportOptions): Promise<void> => {
      const el = getFlowElement();
      if (!el) return;
      const bg = options?.backgroundColor ?? 'white';
      const filter = buildFilter(options?.includeGroups ?? true);
      try {
        const dataUrl = await toSvg(el, {
          backgroundColor: bg,
          cacheBust: true,
          filter,
        });
        downloadDataUrl(dataUrl, 'canvas-export.svg');
      } catch (err) {
        console.error('Export as SVG failed:', err);
      }
    };

    const exportAsJpeg = async (options?: ImageExportOptions): Promise<void> => {
      const el = getFlowElement();
      if (!el) return;
      const bg = options?.backgroundColor ?? 'white';
      const filter = buildFilter(options?.includeGroups ?? true);
      try {
        const dataUrl = await toJpeg(el, {
          backgroundColor: bg,
          quality: 0.95,
          pixelRatio: 2,
          cacheBust: true,
          filter,
        });
        downloadDataUrl(dataUrl, 'canvas-export.jpg');
      } catch (err) {
        console.error('Export as JPEG failed:', err);
      }
    };

    const exportAsPdf = async (options?: ImageExportOptions): Promise<void> => {
      const el = getFlowElement();
      if (!el) return;
      const bg = options?.backgroundColor ?? 'white';
      const filter = buildFilter(options?.includeGroups ?? true);
      try {
        const dataUrl = await toPng(el, {
          backgroundColor: bg,
          pixelRatio: 2,
          cacheBust: true,
          filter,
        });
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          console.warn('Export as PDF: popup blocked; allow popups to print/save as PDF.');
          return;
        }
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head><title>Canvas Export</title></head>
            <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:${bg};">
              <img src="${dataUrl}" alt="Canvas export" style="max-width:100%;height:auto;" />
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.onafterprint = () => printWindow.close();
        const doPrint = () => setTimeout(() => printWindow.print(), 100);
        if (printWindow.document.readyState === 'complete') {
          doPrint();
        } else {
          printWindow.addEventListener('load', doPrint, { once: true });
        }
      } catch (err) {
        console.error('Export as PDF failed:', err);
      }
    };

    setImageExportApi({
      exportAsPng,
      exportAsSvg,
      exportAsJpeg,
      exportAsPdf,
    });

    return () => {
      setImageExportApi(null);
    };
  }, [setImageExportApi, getFlowElement]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden"
    />
  );
}
