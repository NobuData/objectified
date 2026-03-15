'use client';

/**
 * Registers canvas image export API with CanvasExportContext. Must be rendered inside ReactFlow.
 * Uses html-to-image to capture the flow viewport. Reference: GitHub #92.
 */

import { useCallback, useEffect, useRef } from 'react';
import { toPng, toSvg, toJpeg } from 'html-to-image';
import { useCanvasExportOptional } from '@/app/contexts/CanvasExportContext';

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
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

    const exportAsPng = async (): Promise<void> => {
      const el = getFlowElement();
      if (!el) return;
      try {
        const dataUrl = await toPng(el, {
          backgroundColor: 'white',
          pixelRatio: 2,
          cacheBust: true,
        });
        downloadDataUrl(dataUrl, 'canvas-export.png');
      } catch (err) {
        console.error('Export as PNG failed:', err);
      }
    };

    const exportAsSvg = async (): Promise<void> => {
      const el = getFlowElement();
      if (!el) return;
      try {
        const dataUrl = await toSvg(el, {
          backgroundColor: 'white',
          cacheBust: true,
        });
        downloadDataUrl(dataUrl, 'canvas-export.svg');
      } catch (err) {
        console.error('Export as SVG failed:', err);
      }
    };

    const exportAsJpeg = async (): Promise<void> => {
      const el = getFlowElement();
      if (!el) return;
      try {
        const dataUrl = await toJpeg(el, {
          backgroundColor: 'white',
          quality: 0.95,
          pixelRatio: 2,
          cacheBust: true,
        });
        downloadDataUrl(dataUrl, 'canvas-export.jpg');
      } catch (err) {
        console.error('Export as JPEG failed:', err);
      }
    };

    const exportAsPdf = async (): Promise<void> => {
      const el = getFlowElement();
      if (!el) return;
      try {
        const dataUrl = await toPng(el, {
          backgroundColor: 'white',
          pixelRatio: 2,
          cacheBust: true,
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
            <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;">
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
