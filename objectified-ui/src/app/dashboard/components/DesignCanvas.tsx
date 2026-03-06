'use client';

import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes: { id: string; position: { x: number; y: number }; data: { label: string } }[] = [];
const initialEdges: { id: string; source: string; target: string }[] = [];

export default function DesignCanvas() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
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
