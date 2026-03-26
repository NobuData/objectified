'use client';

/**
 * Registers canvas image export API with CanvasExportContext. Must be rendered inside ReactFlow.
 * Uses html-to-image to capture the flow viewport. Reference: GitHub #92, #93, #240 — scopes.
 */

import { useCallback, useEffect, useRef } from 'react';
import { toPng, toSvg, toJpeg } from 'html-to-image';
import { useReactFlow } from '@xyflow/react';
import {
  useCanvasExportOptional,
  type ImageExportOptions,
  type ImageExportScope,
} from '@/app/contexts/CanvasExportContext';
import { collectGroupDescendants } from '@lib/studio/canvasGroupLayout';
import type { StudioClass, StudioGroup } from '@lib/studio/types';
import { getStableClassId } from '@lib/studio/types';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function sanitizeFilePart(name: string): string {
  const s = name.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return s.slice(0, 80) || 'group';
}

function allowedNodeIdsForGroupExport(
  groupId: string,
  classes: StudioClass[],
  groups: StudioGroup[]
): Set<string> {
  const subtree = collectGroupDescendants(groups, groupId);
  const ids = new Set<string>([groupId]);
  for (const c of classes) {
    const gid = (c.canvas_metadata as { group?: string } | undefined)?.group;
    if (gid && subtree.has(gid)) {
      ids.add(getStableClassId(c));
    }
  }
  return ids;
}

/**
 * Optional filter for html-to-image: omit group frames, limit to node/edge ids, or both.
 */
function buildDomFilter(
  includeGroups: boolean,
  allowedNodeIds: Set<string> | null,
  allowedEdgeIds: Set<string> | null
): ((node: HTMLElement) => boolean) | undefined {
  const needNode = allowedNodeIds != null;
  const needEdge = allowedEdgeIds != null;
  if (includeGroups && !needNode && !needEdge) {
    return undefined;
  }

  return (node: HTMLElement): boolean => {
    if (!includeGroups && node.getAttribute?.('data-nodetype') === 'group') {
      return false;
    }

    const nodeWrap = node.closest?.('.react-flow__node') as HTMLElement | null;
    if (nodeWrap && needNode && allowedNodeIds) {
      const id = nodeWrap.getAttribute('data-id');
      if (id && !allowedNodeIds.has(id)) return false;
    }

    const edgeWrap = node.closest?.('.react-flow__edge') as HTMLElement | null;
    if (edgeWrap && needEdge && allowedEdgeIds) {
      const eid = edgeWrap.getAttribute('data-id');
      if (eid && !allowedEdgeIds.has(eid)) return false;
    }

    return true;
  };
}

export default function CanvasExportRegistration() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const exportContext = useCanvasExportOptional();
  const setImageExportApi = exportContext?.setImageExportApi;
  const classes = exportContext?.classes ?? [];
  const groups = exportContext?.groups ?? [];
  const rf = useReactFlow();
  const rfRef = useRef(rf);
  rfRef.current = rf;

  const getFlowElement = useCallback((): HTMLElement | null => {
    const el = containerRef.current?.closest('.react-flow');
    return el ? (el as HTMLElement) : null;
  }, []);

  useEffect(() => {
    if (!setImageExportApi) return;

    const exportWithFilter = async (
      options: ImageExportOptions | undefined,
      filter: ((node: HTMLElement) => boolean) | undefined,
      filename: string
    ): Promise<void> => {
      const el = getFlowElement();
      if (!el) return;
      const bg = options?.backgroundColor ?? 'white';
      const isSvg = filename.endsWith('.svg');
      const isJpeg = filename.endsWith('.jpg');
      try {
        if (isSvg) {
          const dataUrl = await toSvg(el, { backgroundColor: bg, cacheBust: true, filter });
          downloadDataUrl(dataUrl, filename);
          return;
        }
        if (isJpeg) {
          const dataUrl = await toJpeg(el, {
            backgroundColor: bg,
            quality: 0.95,
            pixelRatio: 2,
            cacheBust: true,
            filter,
          });
          downloadDataUrl(dataUrl, filename);
          return;
        }
        const dataUrl = await toPng(el, {
          backgroundColor: bg,
          pixelRatio: 2,
          cacheBust: true,
          filter,
        });
        downloadDataUrl(dataUrl, filename);
      } catch (err) {
        console.error('Canvas export failed:', err);
      }
    };

    const exportPdfWithFilter = async (
      options: ImageExportOptions | undefined,
      filter: ((node: HTMLElement) => boolean) | undefined
    ): Promise<void> => {
      const el = getFlowElement();
      if (!el) return;
      const bg = options?.backgroundColor ?? 'white';
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

    const runScopedExport = async (
      format: 'png' | 'svg' | 'jpeg' | 'pdf',
      options?: ImageExportOptions
    ): Promise<void> => {
      const scope: ImageExportScope = options?.scope ?? 'viewport';
      const includeGroups = options?.includeGroups ?? true;
      const r = rfRef.current;
      const allEdges = r.getEdges();
      const selectedIds = new Set(
        r.getNodes().filter((n) => n.selected).map((n) => n.id)
      );

      if (scope === 'full') {
        await r.fitView({ padding: 0.2, duration: 280 });
        await delay(320);
      }

      const ext = format === 'jpeg' ? 'jpg' : format === 'pdf' ? 'png' : format;
      const defaultName = `canvas-export.${format === 'pdf' ? 'png' : ext}`;

      if (scope === 'perGroup') {
        if (groups.length === 0) {
          const filter = buildDomFilter(includeGroups, null, null);
          if (format === 'pdf') await exportPdfWithFilter(options, filter);
          else await exportWithFilter(options, filter, defaultName);
          return;
        }
        for (const g of groups) {
          const allowed = allowedNodeIdsForGroupExport(g.id, classes, groups);
          const edgeIds = new Set(
            allEdges
              .filter((e) => allowed.has(e.source) && allowed.has(e.target))
              .map((e) => e.id)
          );
          const filter = buildDomFilter(includeGroups, allowed, edgeIds);
          const base = `canvas-group-${sanitizeFilePart(g.name)}`;
          if (format === 'pdf') {
            await exportPdfWithFilter(options, filter);
          } else {
            await exportWithFilter(options, filter, `${base}.${ext}`);
          }
          await delay(260);
        }
        return;
      }

      let allowedNodes: Set<string> | null = null;
      let allowedEdges: Set<string> | null = null;
      if (scope === 'selected' && selectedIds.size > 0) {
        allowedNodes = selectedIds;
        allowedEdges = new Set(
          allEdges
            .filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target))
            .map((e) => e.id)
        );
      }

      const filter = buildDomFilter(includeGroups, allowedNodes, allowedEdges);
      if (format === 'pdf') await exportPdfWithFilter(options, filter);
      else await exportWithFilter(options, filter, defaultName);
    };

    const exportAsPng = async (options?: ImageExportOptions): Promise<void> => {
      await runScopedExport('png', options);
    };

    const exportAsSvg = async (options?: ImageExportOptions): Promise<void> => {
      await runScopedExport('svg', options);
    };

    const exportAsJpeg = async (options?: ImageExportOptions): Promise<void> => {
      await runScopedExport('jpeg', options);
    };

    const exportAsPdf = async (options?: ImageExportOptions): Promise<void> => {
      await runScopedExport('pdf', options);
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
  }, [setImageExportApi, getFlowElement, classes, groups]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden"
    />
  );
}
