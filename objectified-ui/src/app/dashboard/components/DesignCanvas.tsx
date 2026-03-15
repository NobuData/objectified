'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
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
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useCanvasSettingsOptional } from '@/app/contexts/CanvasSettingsContext';
import { useEditClassRequestOptional } from '@/app/contexts/EditClassRequestContext';
import { getCanvasSettings } from '@lib/studio/canvasSettings';
import { getStableClassId } from '@lib/studio/types';
import {
  saveDefaultCanvasLayout,
  getDefaultCanvasLayout,
  getViewport,
  saveViewport,
} from '@lib/studio/canvasLayout';
import {
  getAllClassNodeConfigs,
  saveClassNodeConfig,
  type ClassNodeConfig,
} from '@lib/studio/canvasClassNodeConfig';
import ClassNode from './ClassNode';

const defaultPosition = { x: 0, y: 0 };

const nodeTypes = { class: ClassNode };

function useResolvedCanvasSettings() {
  const context = useCanvasSettingsOptional();
  if (context) return context.settings;
  return getCanvasSettings();
}

export default function DesignCanvas() {
  const studio = useStudioOptional();
  const workspace = useWorkspaceOptional();
  const editClassRequest = useEditClassRequestOptional();
  const versionId = studio?.state?.versionId ?? null;
  const classes = useMemo(() => studio?.state?.classes ?? [], [studio?.state]);
  const canvasSettings = useResolvedCanvasSettings();
  const isReadOnly =
    studio?.state?.readOnly === true || workspace?.version?.published === true;

  const [configOverrides, setConfigOverrides] = useState<
    Record<string, ClassNodeConfig>
  >({});

  const onConfigChange = useCallback(
    (classId: string, config: ClassNodeConfig) => {
      if (versionId) saveClassNodeConfig(versionId, classId, config);
      setConfigOverrides((prev) => ({ ...prev, [classId]: config }));
    },
    [versionId]
  );

  // Reset per-node config overrides whenever the active version changes so that
  // stale overrides from the previous version are not applied to nodes in the new one.
  useEffect(() => {
    setConfigOverrides({});
  }, [versionId]);

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
    // Merge server positions with any locally-saved canvas layout; render from local state
    const saved = versionId ? getDefaultCanvasLayout(versionId) : [];
    const savedMap = new Map(saved.map((e) => [e.classId, e.position]));

    return classes.map((cls) => {
      const id = getStableClassId(cls);
      const serverPos = cls.canvas_metadata?.position ?? defaultPosition;
      const savedPos = savedMap.get(id);
      const pos = savedPos ?? serverPos;
      const meta = cls.canvas_metadata;
      const dimensions = meta?.dimensions;
      const style = (meta?.style as Record<string, string | number> | undefined) ?? {};
      return {
        id,
        type: 'class' as const,
        position: { x: pos.x ?? 0, y: pos.y ?? 0 },
        data: {
          name: cls.name,
          properties: cls.properties ?? [],
          canvas_metadata: meta,
        },
        ...(dimensions?.width != null || dimensions?.height != null
          ? {
              style: {
                ...style,
                width: dimensions.width,
                height: dimensions.height,
              },
            }
          : Object.keys(style).length > 0
            ? { style }
            : {}),
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
      // In read-only mode, only allow selection-type changes through so the user
      // can still click/select nodes.  Destructive changes (remove) and
      // position changes (drag) are discarded before they can mutate local state.
      const allowedChanges = isReadOnly
        ? changes.filter((c) => c.type === 'select' || c.type === 'dimensions')
        : changes;

      if (allowedChanges.length > 0) {
        onNodesChange(allowedChanges as Parameters<typeof onNodesChange>[0]);
      }
      if (isReadOnly || !studio?.applyChange) return;

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
    [onNodesChange, studio, classes, versionId, isReadOnly]
  );

  const baseNodes = classes.length > 0 ? nodes : initialNodesFromState;

  const displayNodes = useMemo(() => {
    if (!versionId) return baseNodes;
    // Load all configs once to avoid repeated JSON parses inside the map loop.
    const allStoredConfigs = getAllClassNodeConfigs(versionId);
    return baseNodes.map((node: Node) => ({
      ...node,
      data: {
        ...node.data,
        classNodeConfig: {
          ...allStoredConfigs[node.id],
          ...configOverrides[node.id],
        },
        onConfigChange,
      },
    }));
  }, [baseNodes, versionId, configOverrides, onConfigChange]);

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

  const handleNodeDoubleClick = useCallback(
    (_event: MouseEvent, node: Node) => {
      editClassRequest?.requestEditClass(node.id);
    },
    [editClassRequest]
  );

  return (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-950">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        viewport={viewportState}
        onViewportChange={onViewportChange}
        onMoveEnd={onMoveEnd}
        fitView={viewportState === undefined}
        nodesDraggable={!isReadOnly}
        nodesConnectable={!isReadOnly}
        elementsSelectable={true}
        nodeTypes={nodeTypes}
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
