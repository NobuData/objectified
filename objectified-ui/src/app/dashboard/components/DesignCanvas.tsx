/**
 * Design canvas: react-flow with class nodes, group nodes, drag/resize, selection, pan/zoom.
 * Reference: GitHub #82, #83 — Add interactivity to nodes; add groups (GroupNode, parentId).
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  type EdgeChange,
  type OnMoveEnd,
  type Viewport,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useCanvasSettingsOptional } from '@/app/contexts/CanvasSettingsContext';
import { useEditClassRequestOptional } from '@/app/contexts/EditClassRequestContext';
import { useCanvasGroupOptional } from '@/app/contexts/CanvasGroupContext';
import { useCanvasLayoutOptional } from '@/app/contexts/CanvasLayoutContext';
import { useCanvasSearchOptional } from '@/app/contexts/CanvasSearchContext';
import { useCanvasFocusModeOptional } from '@/app/contexts/CanvasFocusModeContext';
import { getCanvasSettings } from '@lib/studio/canvasSettings';
import {
  getVisibleClassIds,
  getVisibleGroupIds,
  isSearchActive,
} from '@lib/studio/canvasSearch';
import {
  isFocusModeActive,
  getFocusedNodeIds,
  getFocusedGroupIds,
} from '@lib/studio/canvasFocusMode';
import { getStableClassId } from '@lib/studio/types';
import type { StudioGroup } from '@lib/studio/types';
import type { GroupCanvasMetadata } from '@lib/studio/canvasGroupStorage';
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
import { buildClassRefEdges } from '@lib/studio/canvasClassRefEdges';
import ClassNode from './ClassNode';
import ClassRefEdge from './ClassRefEdge';
import GroupNode from './GroupNode';
import LayoutPreviewDialog from './LayoutPreviewDialog';
import PaneContextMenuRegistration from './PaneContextMenuRegistration';

const defaultPosition = { x: 0, y: 0 };

const nodeTypes = { class: ClassNode, group: GroupNode };
const edgeTypes = { classRef: ClassRefEdge };

function useResolvedCanvasSettings() {
  const context = useCanvasSettingsOptional();
  if (context) return context.settings;
  return getCanvasSettings();
}

export default function DesignCanvas() {
  const studio = useStudioOptional();
  const workspace = useWorkspaceOptional();
  const editClassRequest = useEditClassRequestOptional();
  const canvasGroup = useCanvasGroupOptional();
  const canvasLayout = useCanvasLayoutOptional();
  const focusMode = useCanvasFocusModeOptional();
  const versionId = studio?.state?.versionId ?? null;
  const classes = useMemo(() => studio?.state?.classes ?? [], [studio?.state]);
  const groups = useMemo(() => studio?.state?.groups ?? [], [studio?.state]);
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
    const saved = versionId ? getDefaultCanvasLayout(versionId) : [];
    const savedMap = new Map(saved.map((e) => [e.classId, e.position]));

    const groupNodes: Node[] = groups.map((g: StudioGroup) => {
      const meta = (g.metadata ?? {}) as GroupCanvasMetadata;
      const pos = meta.position ?? defaultPosition;
      const dims = meta.dimensions ?? { width: 280, height: 160 };
      const style = meta.style ?? {};
      return {
        id: g.id,
        type: 'group' as const,
        position: { x: pos.x ?? 0, y: pos.y ?? 0 },
        data: { label: g.name, groupMetadata: meta },
        style: {
          width: dims.width ?? 280,
          height: dims.height ?? 160,
          ...style,
        },
      };
    });

    const classNodes: Node[] = classes.map((cls) => {
      const id = getStableClassId(cls);
      const serverPos = cls.canvas_metadata?.position ?? defaultPosition;
      const savedPos = savedMap.get(id);
      const pos = savedPos ?? serverPos;
      const meta = cls.canvas_metadata;
      const dimensions = meta?.dimensions;
      const style = (meta?.style as Record<string, string | number> | undefined) ?? {};
      const parentId = meta?.group ?? undefined;
      const node: Node = {
        id,
        type: 'class' as const,
        position: { x: pos.x ?? 0, y: pos.y ?? 0 },
        data: {
          name: cls.name,
          properties: cls.properties ?? [],
          canvas_metadata: meta,
        },
        ...(parentId ? { parentId, extent: 'parent' as const } : {}),
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
      return node;
    });

    return [...groupNodes, ...classNodes];
  }, [classes, groups, versionId]);

  const initialEdges = useMemo(() => buildClassRefEdges(classes), [classes]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodesFromState);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodesFromState);
  }, [initialNodesFromState, setNodes]);

  useEffect(() => {
    setEdges(buildClassRefEdges(classes));
  }, [classes, setEdges]);

  // Derived edges must not be mutated by user interaction; only selection changes are allowed
  // so that keyboard-delete and other destructive actions cannot remove ref edges.
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const allowedChanges = changes.filter((c) => c.type === 'select');
      if (allowedChanges.length > 0) {
        onEdgesChange(allowedChanges);
      }
    },
    [onEdgesChange]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // In read-only mode, only allow selection and dimensions changes through so
      // the user can still click/select nodes and react-flow can measure intrinsic
      // node sizes. Destructive changes (remove) and position changes (drag) are
      // discarded before mutating local state.
      const allowedChanges = isReadOnly
        ? changes.filter((c) => c.type === 'select' || c.type === 'dimensions')
        : changes;

      if (allowedChanges.length > 0) {
        onNodesChange(allowedChanges as Parameters<typeof onNodesChange>[0]);
      }
      if (isReadOnly || !studio?.applyChange) return;

      const groupIds = new Set(groups.map((g) => g.id));
      const positionUpdates: { nodeId: string; position: { x: number; y: number } }[] = [];
      const dimensionUpdates: {
        nodeId: string;
        dimensions: { width: number; height: number };
      }[] = [];

      for (const change of changes) {
        if (
          change.type === 'position' &&
          change.dragging === false &&
          change.position != null
        ) {
          positionUpdates.push({ nodeId: change.id, position: change.position });
        }
        if (
          change.type === 'dimensions' &&
          change.resizing === false &&
          change.dimensions != null
        ) {
          const { width, height } = change.dimensions;
          if (typeof width === 'number' && typeof height === 'number') {
            dimensionUpdates.push({ nodeId: change.id, dimensions: { width, height } });
          }
        }
      }

      const classPositionUpdates = positionUpdates.filter((u) => !groupIds.has(u.nodeId));
      const groupPositionUpdates = positionUpdates.filter((u) => groupIds.has(u.nodeId));
      const classDimensionUpdates = dimensionUpdates.filter((u) => !groupIds.has(u.nodeId));
      const groupDimensionUpdates = dimensionUpdates.filter((u) => groupIds.has(u.nodeId));

      if (classPositionUpdates.length > 0) {
        studio.applyChange((draft) => {
          for (const { nodeId, position } of classPositionUpdates) {
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
        if (versionId) {
          const updatedMap = new Map(classPositionUpdates.map((u) => [u.nodeId, u.position]));
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
      }

      if (groupPositionUpdates.length > 0) {
        studio.applyChange((draft) => {
          for (const { nodeId, position } of groupPositionUpdates) {
            const g = draft.groups.find((x) => x.id === nodeId);
            if (g) {
              g.metadata = { ...g.metadata, position: { x: position.x, y: position.y } };
            }
          }
        });
      }

      if (classDimensionUpdates.length > 0) {
        studio.applyChange((draft) => {
          for (const { nodeId, dimensions } of classDimensionUpdates) {
            const idx = draft.classes.findIndex((c) => getStableClassId(c) === nodeId);
            if (idx >= 0) {
              const target = draft.classes[idx];
              target.canvas_metadata = {
                ...target.canvas_metadata,
                dimensions: { width: dimensions.width, height: dimensions.height },
              };
            }
          }
        });
      }

      if (groupDimensionUpdates.length > 0) {
        studio.applyChange((draft) => {
          for (const { nodeId, dimensions } of groupDimensionUpdates) {
            const g = draft.groups.find((x) => x.id === nodeId);
            if (g) {
              g.metadata = { ...g.metadata, dimensions: { width: dimensions.width, height: dimensions.height } };
            }
          }
        });
      }
    },
    [onNodesChange, studio, classes, groups, versionId, isReadOnly]
  );

  const canvasSearch = useCanvasSearchOptional();
  const searchState = canvasSearch?.state ?? null;

  const visibleClassIds = useMemo(
    () =>
      searchState ? getVisibleClassIds(classes, searchState) : null,
    [classes, searchState]
  );
  const classToGroup = useMemo(() => {
    const m = new Map<string, string>();
    for (const cls of classes) {
      const gid = (cls.canvas_metadata as { group?: string } | undefined)?.group;
      if (gid) m.set(getStableClassId(cls), gid);
    }
    return m;
  }, [classes]);
  const visibleGroupIds = useMemo(() => {
    if (!searchState || !visibleClassIds) return null;
    return getVisibleGroupIds(groups, searchState, visibleClassIds, classToGroup);
  }, [groups, searchState, visibleClassIds, classToGroup]);

  const baseNodes =
    classes.length > 0 || groups.length > 0 ? nodes : initialNodesFromState;

  const filteredNodes = useMemo(() => {
    if (visibleClassIds === null && visibleGroupIds === null) return baseNodes;
    if (searchState && !isSearchActive(searchState)) return baseNodes;
    const visibleC = visibleClassIds ?? new Set<string>();
    const visibleG = visibleGroupIds ?? new Set<string>();
    return baseNodes.filter((node: Node) => {
      if (node.type === 'group') return visibleG.has(node.id);
      return visibleC.has(node.id);
    });
  }, [baseNodes, visibleClassIds, visibleGroupIds, searchState]);

  const filteredEdges = useMemo(() => {
    if (visibleClassIds === null) return edges;
    if (searchState && !isSearchActive(searchState)) return edges;
    return edges.filter(
      (e) => visibleClassIds.has(e.source) && visibleClassIds.has(e.target)
    );
  }, [edges, visibleClassIds, searchState]);

  // --- Focus mode filtering (second pass, narrows search results) ---
  const focusState = focusMode?.state ?? null;

  const focusStartNodeIds = useMemo(() => {
    if (!focusState || !isFocusModeActive(focusState)) return null;
    if (focusState.focusNodeId) return new Set([focusState.focusNodeId]);
    if (focusState.focusGroupId) {
      // Collect all class ids that belong to the focused group.
      const ids = new Set<string>();
      for (const [classId, groupId] of classToGroup) {
        if (groupId === focusState.focusGroupId) ids.add(classId);
      }
      return ids;
    }
    return null;
  }, [focusState, classToGroup]);

  const focusedClassIds = useMemo(() => {
    if (!focusStartNodeIds) return null;
    return getFocusedNodeIds(
      filteredEdges,
      focusStartNodeIds,
      focusState?.focusModeDegree ?? 1
    );
  }, [focusStartNodeIds, filteredEdges, focusState?.focusModeDegree]);

  const focusedGroupIds = useMemo(() => {
    if (!focusedClassIds) return null;
    const ids = getFocusedGroupIds(groups, focusedClassIds, classToGroup);
    // Always include the focused group itself, even when it has no member classes,
    // so the group node remains visible rather than the canvas going blank.
    if (focusState?.focusGroupId) ids.add(focusState.focusGroupId);
    return ids;
  }, [focusedClassIds, groups, classToGroup, focusState?.focusGroupId]);

  const focusFilteredNodes = useMemo(() => {
    if (!focusedClassIds || !focusedGroupIds) return filteredNodes;
    return filteredNodes.filter((node: Node) => {
      if (node.type === 'group') return focusedGroupIds.has(node.id);
      return focusedClassIds.has(node.id);
    });
  }, [filteredNodes, focusedClassIds, focusedGroupIds]);

  const focusFilteredEdges = useMemo(() => {
    if (!focusedClassIds) return filteredEdges;
    return filteredEdges.filter(
      (e) => focusedClassIds.has(e.source) && focusedClassIds.has(e.target)
    );
  }, [filteredEdges, focusedClassIds]);

  // Escape key handler to exit focus mode.
  useEffect(() => {
    if (!focusState || !isFocusModeActive(focusState)) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        focusMode?.exitFocusMode();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [focusState, focusMode]);

  const displayNodes = useMemo(() => {
    const allStoredConfigs = versionId ? getAllClassNodeConfigs(versionId) : {};
    return focusFilteredNodes.map((node: Node) => {
      if (node.type === 'group') {
        return {
          ...node,
          data: {
            ...node.data,
            allowResize: !isReadOnly,
            onEdit: canvasGroup?.openGroupEditor,
          },
        };
      }
      return {
        ...node,
        data: {
          ...node.data,
          classNodeConfig: {
            ...allStoredConfigs[node.id],
            ...configOverrides[node.id],
          },
          onConfigChange,
          allowResize: !isReadOnly,
        },
      };
    });
  }, [focusFilteredNodes, versionId, configOverrides, onConfigChange, isReadOnly, canvasGroup]);

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
      if (node.type === 'group') {
        canvasGroup?.openGroupEditor(node.id);
      } else {
        editClassRequest?.requestEditClass(node.id);
      }
    },
    [editClassRequest, canvasGroup]
  );

  const [layoutPreviewOpen, setLayoutPreviewOpen] = useState(false);
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    node: Node;
    clientX: number;
    clientY: number;
  } | null>(null);
  const nodeContextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasLayout?.registerOpenLayoutPreview) return;
    canvasLayout.registerOpenLayoutPreview(() => setLayoutPreviewOpen(true));
    return () => canvasLayout.registerOpenLayoutPreview(null);
  }, [canvasLayout]);

  useEffect(() => {
    if (!nodeContextMenu) return;
    const close = () => setNodeContextMenu(null);
    const handleClick = (e: globalThis.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && nodeContextMenuRef.current?.contains(target)) return;
      close();
    };
    const t = setTimeout(() => document.addEventListener('click', handleClick, true), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', handleClick, true);
    };
  }, [nodeContextMenu]);

  const handleAddClassToGroup = useCallback(
    (classId: string, groupId: string) => {
      if (!studio?.applyChange || !versionId) return;
      const group = groups.find((g) => g.id === groupId);
      const cls = classes.find((c) => getStableClassId(c) === classId);
      if (!group || !cls) return;
      const groupMeta = group.metadata as { position?: { x: number; y: number } } | undefined;
      const groupPos = groupMeta?.position ?? { x: 0, y: 0 };
      const classPos = cls.canvas_metadata?.position ?? { x: 0, y: 0 };
      studio.applyChange((draft) => {
        const c = draft.classes.find((x) => getStableClassId(x) === classId);
        const g = draft.groups.find((x) => x.id === groupId);
        if (!c || !g) return;
        const gPos = (g.metadata as { position?: { x: number; y: number } } | undefined)?.position ?? { x: 0, y: 0 };
        c.canvas_metadata = {
          ...c.canvas_metadata,
          group: groupId,
          position: { x: classPos.x - gPos.x, y: classPos.y - gPos.y },
        };
      });
      const updatedMap = new Map([[classId, { x: classPos.x - groupPos.x, y: classPos.y - groupPos.y }]]);
      const allPositions = classes.map((c) => {
        const id = getStableClassId(c);
        if (id === classId) {
          const pos = updatedMap.get(id)!;
          return { classId: id, position: pos };
        }
        return {
          classId: id,
          position: c.canvas_metadata?.position ?? defaultPosition,
        };
      });
      saveDefaultCanvasLayout(versionId, allPositions);
      setNodeContextMenu(null);
    },
    [studio, groups, classes, versionId]
  );

  const handleRemoveClassFromGroup = useCallback(
    (classId: string) => {
      if (!studio?.applyChange || !versionId) return;
      const cls = classes.find((c) => getStableClassId(c) === classId);
      const groupId = cls?.canvas_metadata?.group;
      if (!groupId) return;
      const group = groups.find((g) => g.id === groupId);
      const groupPos = (group?.metadata as { position?: { x: number; y: number } } | undefined)?.position ?? { x: 0, y: 0 };
      const classPos = cls.canvas_metadata?.position ?? { x: 0, y: 0 };
      const flowPos = { x: groupPos.x + classPos.x, y: groupPos.y + classPos.y };
      studio.applyChange((draft) => {
        const c = draft.classes.find((x) => getStableClassId(x) === classId);
        if (!c) return;
        const meta = { ...c.canvas_metadata };
        delete meta.group;
        meta.position = flowPos;
        c.canvas_metadata = meta;
      });
      const allPositions = classes.map((c) => {
        const id = getStableClassId(c);
        return {
          classId: id,
          position: id === classId ? flowPos : (c.canvas_metadata?.position ?? defaultPosition),
        };
      });
      saveDefaultCanvasLayout(versionId, allPositions);
      setNodeContextMenu(null);
    },
    [studio, groups, classes, versionId]
  );

  const handleNodeContextMenu = useCallback(
    (e: MouseEvent<Element>, node: Node) => {
      e.preventDefault();
      setNodeContextMenu({ node, clientX: e.clientX, clientY: e.clientY });
    },
    []
  );

  const handleLayoutApply = useCallback(
    (layoutedNodes: Node[]) => {
      if (!studio?.applyChange || !versionId) return;
      const positionMap = new Map<string, { x: number; y: number }>();
      for (const node of layoutedNodes) {
        if (node.type === 'class' && node.position) {
          positionMap.set(node.id, {
            x: node.position.x,
            y: node.position.y,
          });
        }
      }
      studio.applyChange((draft) => {
        for (const c of draft.classes) {
          // Skip grouped classes — their positions are stored relative to the parent group
          if ((c.canvas_metadata as { group?: string } | undefined)?.group) continue;
          const id = getStableClassId(c);
          const pos = positionMap.get(id);
          if (pos) {
            c.canvas_metadata = {
              ...c.canvas_metadata,
              position: { x: pos.x, y: pos.y },
            };
          }
        }
      });
      const allPositions = classes
        .filter((c) => !(c.canvas_metadata as { group?: string } | undefined)?.group)
        .map((c) => {
          const id = getStableClassId(c);
          const pos =
            positionMap.get(id) ??
            c.canvas_metadata?.position ??
            defaultPosition;
          return { classId: id, position: pos };
        });
      saveDefaultCanvasLayout(versionId, allPositions);
      const layoutedMap = new Map(layoutedNodes.map((l) => [l.id, l]));
      setNodes((current) =>
        current.map((n) => {
          const updated = layoutedMap.get(n.id);
          return updated ? { ...n, position: updated.position } : n;
        })
      );
    },
    [studio, versionId, classes, setNodes]
  );

  return (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-950 [--class-ref-edge-stroke:rgb(100_116_139)] dark:[--class-ref-edge-stroke:rgb(148_163_184)]">
      <ReactFlow
        nodes={displayNodes}
        edges={focusFilteredEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={
          canvasGroup?.paneContextMenuHandler
            ? (e) =>
                canvasGroup.paneContextMenuHandler?.({
                  clientX: e.clientX,
                  clientY: e.clientY,
                  preventDefault: () => e.preventDefault(),
                })
            : undefined
        }
        viewport={viewportState}
        onViewportChange={onViewportChange}
        onMoveEnd={onMoveEnd}
        fitView={viewportState === undefined}
        nodesDraggable={!isReadOnly}
        nodesConnectable={!isReadOnly}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={true}
        selectionOnDrag={false}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        className="bg-slate-50 dark:bg-slate-900/50"
      >
        <PaneContextMenuRegistration />
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
      {/* Focus mode indicator banner */}
      {focusState && isFocusModeActive(focusState) && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[10002] flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white text-sm shadow-lg">
          <span>
            Focus mode · {focusState.focusModeDegree}-degree
            {focusState.focusGroupId ? ' · group' : ''}
          </span>
          <button
            type="button"
            className="ml-1 px-2 py-0.5 rounded bg-indigo-700 dark:bg-indigo-600 hover:bg-indigo-800 dark:hover:bg-indigo-700 text-xs"
            onClick={() => focusMode?.exitFocusMode()}
          >
            Esc to exit
          </button>
        </div>
      )}
      {nodeContextMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={nodeContextMenuRef}
            className="fixed z-[10003] min-w-[160px] py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl"
            style={{
              left: nodeContextMenu.clientX,
              top: nodeContextMenu.clientY,
            }}
            role="menu"
          >
            {nodeContextMenu.node.type === 'group' && (
              <>
                {!isReadOnly && (
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      canvasGroup?.openGroupEditor(nodeContextMenu.node.id);
                      setNodeContextMenu(null);
                    }}
                  >
                    Edit group
                  </button>
                )}
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => {
                    focusMode?.enterFocusOnGroup(nodeContextMenu.node.id);
                    setNodeContextMenu(null);
                  }}
                >
                  Focus on group
                </button>
                {!isReadOnly && (
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={async () => {
                      await canvasGroup?.deleteGroup(nodeContextMenu.node.id);
                      setNodeContextMenu(null);
                    }}
                  >
                    Delete group
                  </button>
                )}
              </>
            )}
            {nodeContextMenu.node.type === 'class' && (
              <>
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => {
                    focusMode?.enterFocusOnNode(nodeContextMenu.node.id);
                    setNodeContextMenu(null);
                  }}
                >
                  Focus on this node
                </button>
                {(nodeContextMenu.node.data as { canvas_metadata?: { group?: string } }).canvas_metadata?.group ? (
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() =>
                      handleRemoveClassFromGroup(nodeContextMenu.node.id)
                    }
                  >
                    Remove from group
                  </button>
                ) : groups.length > 0 ? (
                  groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() =>
                        handleAddClassToGroup(nodeContextMenu.node.id, g.id)
                      }
                    >
                      Add to {g.name}
                    </button>
                  ))
                ) : (
                  <span className="block px-4 py-2 text-sm text-slate-500 dark:text-slate-400">
                    No groups
                  </span>
                )}
              </>
            )}
          </div>,
          document.body
        )}
      <LayoutPreviewDialog
        open={layoutPreviewOpen}
        onOpenChange={setLayoutPreviewOpen}
        nodes={baseNodes}
        edges={edges}
        onApply={handleLayoutApply}
      />
    </div>
  );
}
