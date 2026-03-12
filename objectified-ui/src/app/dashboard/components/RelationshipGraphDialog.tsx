'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Network } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { pullVersion, type RestClientOptions } from '@lib/api/rest-client';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 40;
const SPACING = 80;

/** Extract referenced schema/class names from a JSON Schema-like object (e.g. $ref, items.$ref). */
function extractRefs(obj: unknown, classNames: Set<string>): Set<string> {
  const out = new Set<string>();
  if (obj == null || typeof obj !== 'object') return out;

  const visit = (val: unknown): void => {
    if (val == null) return;
    if (typeof val === 'object' && !Array.isArray(val)) {
      const o = val as Record<string, unknown>;
      if (typeof o.$ref === 'string') {
        const ref = o.$ref;
        const match = ref.match(/#\/(?:components\/schemas|$defs)\/(.+)$/);
        const name = match ? match[1].trim() : ref.split('/').pop()?.trim();
        if (name && classNames.has(name)) {
          out.add(name);
        }
      }
      for (const v of Object.values(o)) {
        visit(v);
      }
      return;
    }
    if (Array.isArray(val)) {
      val.forEach(visit);
    }
  };

  visit(obj);
  return out;
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export interface RelationshipGraphDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionId: string;
  versionName: string;
  options: RestClientOptions;
}

export default function RelationshipGraphDialog({
  open,
  onOpenChange,
  versionId,
  versionName,
  options,
}: RelationshipGraphDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const buildGraph = useCallback((classes: Record<string, unknown>[]) => {
    const classNames = new Set(
      classes.map((c) => (c.name as string)?.trim()).filter(Boolean)
    );
    const nameToId = new Map<string, string>();
    for (const name of classNames) {
      nameToId.set(name, sanitizeId(name));
    }

    const edgesMap = new Map<string, { target: string; label?: string }[]>();
    for (const cls of classes) {
      const sourceName = (cls.name as string)?.trim();
      if (!sourceName) continue;
      const sourceId = nameToId.get(sourceName);
      if (!sourceId) continue;

      const props = (cls.properties as Array<Record<string, unknown>>) ?? [];
      for (const prop of props) {
        const data = (prop.data ?? prop.property_data) as Record<string, unknown> | undefined;
        if (!data) continue;
        const refs = extractRefs(data, classNames);
        const propName = (prop.name as string)?.trim() ?? '';
        for (const targetName of refs) {
          const targetId = nameToId.get(targetName);
          if (!targetId || targetId === sourceId) continue;
          const key = `${sourceId}->${targetId}`;
            const list = edgesMap.get(sourceId) ?? [];
            if (!list.some((e) => e.target === targetId)) {
              list.push({ target: targetId, label: propName || undefined });
            }
            edgesMap.set(sourceId, list);
        }
      }
    }

    const nodeList = Array.from(classNames);
    const nodePositions = new Map<string, { x: number; y: number }>();
    const columns = Math.ceil(Math.sqrt(nodeList.length)) || 1;
    nodeList.forEach((name, i) => {
      const id = nameToId.get(name)!;
      const col = i % columns;
      const row = Math.floor(i / columns);
      nodePositions.set(id, {
        x: col * (NODE_WIDTH + SPACING),
        y: row * (NODE_HEIGHT + SPACING),
      });
    });

    const flowNodes: Node[] = nodeList.map((name) => {
      const id = nameToId.get(name)!;
      const pos = nodePositions.get(id)!;
      return {
        id,
        type: 'default',
        position: pos,
        data: { label: name },
        className: 'rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm',
      };
    });

    const flowEdges: Edge[] = [];
    let edgeIdx = 0;
    for (const [sourceId, targets] of edgesMap) {
      for (const { target: targetId, label } of targets) {
        flowEdges.push({
          id: `e${edgeIdx++}`,
          source: sourceId,
          target: targetId,
          label: label ?? undefined,
          type: 'smoothstep',
        });
      }
    }

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (!open || !versionId) return;
    setError(null);
    setLoading(true);
    pullVersion(versionId, options)
      .then((res) => {
        const classes = res.classes ?? [];
        buildGraph(classes as Record<string, unknown>[]);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load version');
        setNodes([]);
        setEdges([]);
      })
      .finally(() => setLoading(false));
  }, [open, versionId, options, buildGraph, setNodes, setEdges]);

  const hasContent = useMemo(() => nodes.length > 0, [nodes.length]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-4xl h-[80vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700"
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center">
              <Network className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Relationship graph
              </Dialog.Title>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                {versionName}
              </p>
            </div>
          </div>

          {error && (
            <div
              className="mx-4 mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="flex-1 min-h-0 relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 dark:bg-slate-800/80">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
              </div>
            ) : !hasContent ? (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">
                {error ? null : 'No classes or no references between classes.'}
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                className="bg-slate-50 dark:bg-slate-900/50"
              >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                <Controls
                  position="bottom-left"
                  className="!shadow-lg !rounded-lg !border-slate-200 dark:!border-slate-700"
                />
                <MiniMap
                  position="bottom-right"
                  className="!shadow-lg !rounded-lg !border-slate-200 dark:!border-slate-700 !bg-white dark:!bg-slate-900"
                />
              </ReactFlow>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
