'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeChange,
  type OnMoveEnd,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useCanvasSettingsOptional } from '@/app/contexts/CanvasSettingsContext';
import { getCanvasSettings } from '@lib/studio/canvasSettings';
import { getStableClassId } from '@lib/studio/types';
import {
  saveDefaultCanvasLayout,
  getDefaultCanvasLayout,
  getViewport,
  saveViewport,
} from '@lib/studio/canvasLayout';

const defaultPosition = { x: 0, y: 0 };

function useResolvedCanvasSettings() {
  const context = useCanvasSettingsOptional();
  if (context) return context.settings;
  return getCanvasSettings();
}

export default function DesignCanvas() {
  const studio = useStudioOptional();
  const versionId = studio?.state?.versionId ?? null;
  const classes = useMemo(() => studio?.state?.classes ?? [], [studio?.state]);
  const canvasSettings = useResolvedCanvasSettings();

  const [viewportState, setViewportState] = useState<Viewport | undefined>(
    () =>
      canvasSettings.viewportPersistence && versionId
        ? getViewport(versionId) ?? undefined
        : undefined
  );

  useEffect(() => {
    if (!canvasSettings.viewportPersistence || !versionId) {
      setViewportState(undefined);
      return;
    }
    const saved = getViewport(versionId);
    setViewportState(saved ?? undefined);
  }, [versionId, canvasSettings.viewportPersistence]);

  const initialNodesFromState = useMemo(() => {
    // Merge server positions with any locally-saved canvas layout
    const saved = versionId ? getDefaultCanvasLayout(versionId) : [];
    const savedMap = new Map(saved.map((e) => [e.classId, e.position]));

    return classes.map((cls) => {
      const id = getStableClassId(cls);
      const serverPos = cls.canvas_metadata?.position ?? defaultPosition;
      // Prefer locally-saved position (updated on drag before commit) over server position
      const savedPos = savedMap.get(id);
      const pos = savedPos ?? serverPos;
      return {
        id,
        position: { x: pos.x ?? 0, y: pos.y ?? 0 },
        data: { label: cls.name },
      };
    });
  }, [classes, versionId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodesFromState);
  const [edges, , onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (classes.length === 0) return;
    setNodes(initialNodesFromState);
  }, [initialNodesFromState, classes.length, setNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes as Parameters<typeof onNodesChange>[0]);
      if (!studio?.applyChange) return;

      const positionUpdates: { nodeId: string; position: { x: number; y: number } }[] = [];
      for (const change of changes) {
        if (
          change.type === 'position' &&
          change.dragging === false &&
          change.position != null
        ) {
          positionUpdates.push({ nodeId: change.id, position: change.position });
        }
      }
      if (positionUpdates.length === 0) return;

      studio.applyChange((draft) => {
        for (const { nodeId, position } of positionUpdates) {
          const idx = draft.classes.findIndex((c) => getStableClassId(c) === nodeId);
          if (idx >= 0) {
            const target = draft.classes[idx];
            target.canvas_metadata = {
              ...target.canvas_metadata,
              position: { x: position.x, y: position.y },
            };
          }
        }
      });

      // Persist positions to localStorage outside of state updater to avoid side effects
      if (versionId) {
        const updatedMap = new Map(positionUpdates.map((u) => [u.nodeId, u.position]));
        const allPositions = classes.map((c) => {
          const id = getStableClassId(c);
          const updatedPos = updatedMap.get(id);
          return {
            classId: id,
            position: updatedPos ?? c.canvas_metadata?.position ?? defaultPosition,
          };
        });
        saveDefaultCanvasLayout(versionId, allPositions);
      }
    },
    [onNodesChange, studio, classes, versionId]
  );

  const displayNodes = classes.length > 0 ? nodes : initialNodesFromState;

  // Update controlled viewport state on every change (needed to keep ReactFlow in sync).
  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      if (canvasSettings.viewportPersistence && versionId) {
        setViewportState(viewport);
      }
    },
    [canvasSettings.viewportPersistence, versionId]
  );

  // Persist to localStorage only when a move/pan/zoom ends to avoid excessive writes.
  const onMoveEnd: OnMoveEnd = useCallback(
    (_event, viewport) => {
      if (canvasSettings.viewportPersistence && versionId) {
        saveViewport(versionId, {
          x: viewport.x,
          y: viewport.y,
          zoom: viewport.zoom,
        });
      }
    },
    [canvasSettings.viewportPersistence, versionId]
  );

  return (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-950">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        viewport={viewportState}
        onViewportChange={onViewportChange}
        onMoveEnd={onMoveEnd}
        fitView={viewportState === undefined}
        className="bg-slate-50 dark:bg-slate-900/50"
      >
        {canvasSettings.showBackground && (
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        )}
        {canvasSettings.showControls && (
          <Controls
            position="bottom-left"
            className="!shadow-lg !rounded-lg !border-slate-200 dark:!border-slate-700"
          />
        )}
        {canvasSettings.showMiniMap && (
          <MiniMap
            position="bottom-right"
            className="!shadow-lg !rounded-lg !border-slate-200 dark:!border-slate-700 !bg-white dark:!bg-slate-900"
          />
        )}
      </ReactFlow>
    </div>
  );
}
