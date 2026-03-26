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
    if (idx < 0) return;
    const id = idx < orderedMatchIds.length ? orderedMatchIds[idx] : null;
    if (!id) return;
    rf.setNodes((nodes) =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === id,
      }))
    );
  }, [canvasSearch, canvasSearch?.activeSearchMatchIndex, orderedMatchIds, rf]);

  return null;
}
