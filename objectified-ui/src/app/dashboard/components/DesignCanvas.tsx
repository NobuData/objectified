'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { getStableClassId } from '@lib/studio/types';

const defaultPosition = { x: 0, y: 0 };

export default function DesignCanvas() {
  const studio = useStudioOptional();
  const classes = studio?.state?.classes ?? [];
  const initialNodesFromState = useMemo(
    () =>
      classes.map((cls) => {
        const id = getStableClassId(cls);
        const pos = cls.canvas_metadata?.position ?? defaultPosition;
        return {
          id,
          position: { x: pos.x ?? 0, y: pos.y ?? 0 },
          data: { label: cls.name },
        };
      }),
    [classes]
  );
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
    },
    [onNodesChange, studio]
  );

  const displayNodes = classes.length > 0 ? nodes : initialNodesFromState;

  return (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-950">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        className="bg-slate-50 dark:bg-slate-900/50"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls position="bottom-left" className="!shadow-lg !rounded-lg !border-slate-200 dark:!border-slate-700" />
        <MiniMap
          position="bottom-right"
          className="!shadow-lg !rounded-lg !border-slate-200 dark:!border-slate-700 !bg-white dark:!bg-slate-900"
        />
      </ReactFlow>
    </div>
  );
}
