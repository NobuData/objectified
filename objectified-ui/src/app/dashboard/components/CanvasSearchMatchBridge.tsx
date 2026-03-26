'use client';

/**
 * Syncs canvas search match navigation with React Flow selection and optional zoom.
 * GitHub #242 — find next/previous, zoom to match / fit all matches.
 */

import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasSearchOptional } from '@/app/contexts/CanvasSearchContext';
import type { CanvasSearchContextValue } from '@/app/contexts/CanvasSearchContext';

export default function CanvasSearchMatchBridge({
  orderedMatchIds,
  animateViewport,
}: {
  orderedMatchIds: string[];
  animateViewport: boolean;
}) {
  const rf = useReactFlow();
  const canvasSearch = useCanvasSearchOptional();
  const orderedRef = useRef(orderedMatchIds);
  orderedRef.current = orderedMatchIds;
  const searchRef = useRef<CanvasSearchContextValue | null>(canvasSearch);
  searchRef.current = canvasSearch;
  const lastSelectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!canvasSearch) return;
    const fitActive = () => {
      const cs = searchRef.current;
      const ids = orderedRef.current;
      if (!cs || ids.length === 0) return;
      let i = cs.activeSearchMatchIndex;
      if (i < 0) i = 0;
      const id = ids[Math.min(i, ids.length - 1)];
      const node = rf.getNode(id);
      if (node) {
        rf.fitView({
          nodes: [{ id }],
          padding: 0.22,
          duration: animateViewport ? 240 : 0,
          maxZoom: 1.75,
        });
      }
    };
    const fitAll = () => {
      const ids = orderedRef.current;
      if (ids.length === 0) return;
      rf.fitView({
        nodes: ids.map((id) => ({ id })),
        padding: 0.2,
        duration: animateViewport ? 280 : 0,
      });
    };
    canvasSearch.registerSearchZoomHandlers({ fitActive, fitAll });
    return () => canvasSearch.registerSearchZoomHandlers(null);
  }, [canvasSearch, rf, animateViewport]);

  useEffect(() => {
    if (!canvasSearch) return;
    const idx = canvasSearch.activeSearchMatchIndex;
    const id = idx >= 0 && idx < orderedMatchIds.length ? orderedMatchIds[idx] : null;
    const prevId = lastSelectedIdRef.current;
    lastSelectedIdRef.current = id;

    if (!id && !prevId) return;

    if (!id && prevId) {
      const prevNode = rf.getNode(prevId);
      if (!prevNode?.selected) return;
      rf.setNodes((nodes) =>
        nodes.map((n) => (n.id === prevId ? { ...n, selected: false } : n))
      );
      return;
    }

    if (id) {
      const nextNode = rf.getNode(id);
      const prevNode = prevId ? rf.getNode(prevId) : null;
      const nextAlreadySelected = !!nextNode?.selected;
      const prevNeedsClear = !!(prevId && prevId !== id && prevNode?.selected);
      if (nextAlreadySelected && !prevNeedsClear) return;
      rf.setNodes((nodes) =>
        nodes.map((n) => {
          if (n.id === id) {
            if (n.selected) return n;
            return { ...n, selected: true };
          }
          if (prevId && prevId !== id && n.id === prevId) {
            if (!n.selected) return n;
            return { ...n, selected: false };
          }
          return n;
        })
      );
    }
  }, [canvasSearch, canvasSearch?.activeSearchMatchIndex, orderedMatchIds, rf]);

  return null;
}
