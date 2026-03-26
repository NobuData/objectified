/**
 * Design canvas: react-flow with class nodes, group nodes, drag/resize, selection, pan/zoom.
 * Reference: GitHub #82, #83 — Add interactivity to nodes; add groups (GroupNode, parentId).
 * Reference: GitHub #96 — Delete classes from canvas (single/multi-select, confirm).
 * Reference: GitHub #97 — Copy/paste/duplicate for classes (and optional refs) in local state.
 * Reference: GitHub #231 — Node context menu, Enter/F2, long property lists, add-property from canvas.
 * Reference: GitHub #232 — Edge labels, legend, SQL vs $ref styling, broken-ref placeholders, allOf inheritance.
 * Reference: GitHub #233 — Edge selection detail panel, edit ref, parallel edge routing, SQL-mode ID ref styling.
 * Reference: GitHub #234 — Multi-select, box-select, select by group/tag, bulk actions, selection toolbar.
 * Reference: GitHub #235 — Snap to grid/alignment, resize limits, undo for moves (studio stack), touch/trackpad gestures.
 * Reference: GitHub #236 — Keyboard/screen reader: node/edge focus, pan/zoom keys, optional class list view.
 * Reference: GitHub #237 — Groups: create from selection/tag, nesting, metadata, templates, drag in/out.
 * Reference: GitHub #240 — Multi-group focus, layout-by-group, export scopes, multi group canvas filter.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react';
import {
  ReactFlow,
  Panel,
  Controls,
  ControlButton,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  type NodeChange,
  type EdgeChange,
  type OnMoveEnd,
  type Viewport,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useDialogOptional } from '@/app/components/providers/DialogProvider';
import { useStudioOptional, type ClassMutationStatus } from '@/app/contexts/StudioContext';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useTenantPermissions } from '@/app/hooks/useTenantPermissions';
import { useCanvasSettingsOptional } from '@/app/contexts/CanvasSettingsContext';
import { useEditClassRequestOptional } from '@/app/contexts/EditClassRequestContext';
import { useCanvasGroupOptional } from '@/app/contexts/CanvasGroupContext';
import { useCanvasLayoutOptional } from '@/app/contexts/CanvasLayoutContext';
import { useCanvasSearchOptional } from '@/app/contexts/CanvasSearchContext';
import { useCanvasFocusModeOptional } from '@/app/contexts/CanvasFocusModeContext';
import { useCanvasSidebarActionsOptional } from '@/app/contexts/CanvasSidebarActionsContext';
import { useCanvasExportOptional } from '@/app/contexts/CanvasExportContext';
import { getCanvasSettings } from '@lib/studio/canvasSettings';
import { gridStyleToBackgroundVariant } from '@/app/dashboard/utils/canvasStyleUtils';
import { getNextKeyboardFocusIndex } from '@/app/dashboard/utils/canvasKeyboardNavigation';
import {
  getVisibleClassIds,
  getVisibleGroupIds,
  getSearchHighlightGroupIds,
  intersectClassIds,
  isSearchActive,
} from '@lib/studio/canvasSearch';
import {
  isFocusModeActive,
  getFocusedNodeIds,
  getFocusedGroupIds,
} from '@lib/studio/canvasFocusMode';
import { generateGroupId, getStableClassId } from '@lib/studio/types';
import type { StudioClass, StudioGroup } from '@lib/studio/types';
import {
  cloneClassesForPaste,
  PASTE_OFFSET,
} from '@lib/studio/canvasClipboard';
import {
  filterVisibleClassIdsByGroup,
  filterVisibleClassIdsByTag,
} from '@lib/studio/canvasSelectionHelpers';
import type { GroupCanvasMetadata } from '@lib/studio/canvasGroupStorage';
import { getArchivedSubtreeGroupIds } from '@lib/studio/canvasGroupArchive';
import {
  sortGroupsParentsFirst,
  collectGroupDescendants,
  getGroupAbsolutePosition,
  getClassAbsoluteFlowPosition,
  getFlowNodeAbsoluteOrigin,
  getNodeAbsoluteCenter,
  listGroupHitRects,
  findInnermostGroupAtPoint,
  getAbsoluteBoundsForClassNodes,
  newGroupLayoutFromSelectionBounds,
  getClassIdsWithTag,
} from '@lib/studio/canvasGroupLayout';
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
import {
  mergeClassNodeThemes,
  resolveAutoClassNodeTheme,
  DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS,
  type TagDefinitionForTheme,
} from '@lib/studio/canvasNodeThemeResolve';
import { getCanvasVersionNodeThemePrefs } from '@lib/studio/canvasVersionNodeTheme';
import { parseTenantBrandingFromMetadata } from '@lib/ui/tenantBrandingMetadata';
import type { ClassNodeDataExtended } from '@/app/dashboard/components/ClassNode';
import {
  buildDesignCanvasRefLayer,
  isBrokenRefPlaceholderNodeId,
  type ClassRefEdgeData,
} from '@lib/studio/canvasClassRefEdges';
import { getLayoutQuality, type LayoutQualityResult } from '@lib/studio/layoutQuality';
import {
  getCircularDependencyEdgeIds,
  getUpstreamNodeIds,
  getDownstreamNodeIds,
  getPathNodeIds,
  getSchemaMaxDepth,
  getNodesInCircularDependency,
  type DependencyEdge,
} from '@lib/studio/schemaMetrics';
import ClassNode from './ClassNode';
import ClassRefEdge from './ClassRefEdge';
import BrokenRefNode from './BrokenRefNode';
import GroupNode from './GroupNode';
import LayoutPreviewDialog from './LayoutPreviewDialog';
import LayoutHintsOverlay from './LayoutHintsOverlay';
import DependencyOverlay from './DependencyOverlay';
import SchemaMetricsPanel from './SchemaMetricsPanel';
import PaneContextMenuRegistration from './PaneContextMenuRegistration';
import ZoomToClassRegistration from './ZoomToClassRegistration';
import CanvasSearchMatchBridge from './CanvasSearchMatchBridge';
import ZoomToGroupRegistration from './ZoomToGroupRegistration';
import CanvasExportRegistration from './CanvasExportRegistration';
import CanvasSelectionToolbar from './CanvasSelectionToolbar';
import CanvasClassListView from './CanvasClassListView';
import SelectedRefEdgePanel from './SelectedRefEdgePanel';

import { classHasValidationErrors, isStudioClassDeprecated } from '@lib/studio/classValidation';
import { getSchemaMode } from '@lib/studio/schemaMode';
import { applyAlignmentToNodeChanges } from '@lib/studio/canvasAlignmentSnap';
import AlignmentGuidesOverlay from './AlignmentGuidesOverlay';

const defaultPosition = { x: 0, y: 0 };
const NODE_MUTATION_DEBOUNCE_MS = 150;
const LARGE_CANVAS_NODE_THRESHOLD = 100;
const EMPTY_CLASS_MUTATION_STATUS: Record<string, ClassMutationStatus> = {};

const EMPTY_ALIGNMENT_GUIDES = { verticalX: [] as number[], horizontalY: [] as number[] };

type CanvasViewportApi = Pick<
  {
    fitView: (...args: any[]) => any;
    setViewport: (...args: any[]) => any;
    getViewport: () => Viewport;
    zoomIn: (...args: any[]) => any;
    zoomOut: (...args: any[]) => any;
  },
  'fitView' | 'setViewport' | 'getViewport' | 'zoomIn' | 'zoomOut'
>;

const nodeTypes = { class: ClassNode, group: GroupNode, brokenRef: BrokenRefNode };
const edgeTypes = { classRef: ClassRefEdge };

/** Collapsed group frame height on canvas (header strip only; GitHub #238). */
const COLLAPSED_GROUP_HEADER_PX = 40;

function useResolvedCanvasSettings() {
  const context = useCanvasSettingsOptional();
  if (context) return context.settings;
  return getCanvasSettings();
}

export default function DesignCanvas() {
  const dialog = useDialogOptional();
  const studio = useStudioOptional();
  const workspace = useWorkspaceOptional();
  const editClassRequest = useEditClassRequestOptional();
  const canvasGroup = useCanvasGroupOptional();
  const canvasLayout = useCanvasLayoutOptional();
  const focusMode = useCanvasFocusModeOptional();
  const sidebarActions = useCanvasSidebarActionsOptional();
  const canvasExport = useCanvasExportOptional();
  const versionId = studio?.state?.versionId ?? null;
  const classes = useMemo(() => studio?.state?.classes ?? [], [studio?.state]);
  const groups = useMemo(() => studio?.state?.groups ?? [], [studio?.state]);
  const validClassIds = useMemo(
    () => new Set(classes.map((c) => getStableClassId(c)).filter(Boolean)),
    [classes]
  );
  const canvasSettings = useResolvedCanvasSettings();
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(pointer: coarse)');
    const apply = () => setCoarsePointer(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const [alignmentGuides, setAlignmentGuides] = useState(EMPTY_ALIGNMENT_GUIDES);

  const isReadOnly =
    studio?.state?.readOnly === true || workspace?.version?.published === true;
  const tenantId = workspace?.tenant?.id ?? null;
  const tenantPerms = useTenantPermissions(tenantId);
  const hasSchemaWrite = tenantPerms.permissions?.is_tenant_admin || tenantPerms.has('schema:write');
  const mutationLocked = isReadOnly || (Boolean(tenantId) && (tenantPerms.loading || !hasSchemaWrite));
  const schemaMode = useMemo(
    () => (studio?.state ? getSchemaMode(studio.state) : 'openapi'),
    [studio?.state]
  );

  const [configOverrides, setConfigOverrides] = useState<
    Record<string, ClassNodeConfig>
  >({});

  const [versionNodeThemeEpoch, setVersionNodeThemeEpoch] = useState(0);

  const [canvasClipboard, setCanvasClipboard] = useState<StudioClass[] | null>(
    null
  );
  const [inlineRenameClassId, setInlineRenameClassId] = useState<string | null>(
    null
  );
  const reactFlowRef = useRef<CanvasViewportApi | null>(null);

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

  const tagDefinitions = useMemo(() => {
    const meta = studio?.state?.canvas_metadata as
      | {
          tag_definitions?: Record<string, TagDefinitionForTheme>;
        }
      | undefined;
    return meta?.tag_definitions ?? {};
  }, [studio?.state?.canvas_metadata]);

  const tenantPrimaryColor = useMemo(
    () =>
      parseTenantBrandingFromMetadata(
        (workspace?.tenant?.metadata ?? null) as Record<string, unknown> | null
      ).primaryColor,
    [workspace?.tenant?.metadata]
  );

  const versionNodeThemePrefs = useMemo(() => {
    if (!versionId) return DEFAULT_CANVAS_VERSION_NODE_THEME_PREFS;
    return getCanvasVersionNodeThemePrefs(versionId);
  }, [versionId, versionNodeThemeEpoch]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ versionId?: string }>;
      if (!versionId || ce.detail?.versionId === versionId) {
        setVersionNodeThemeEpoch((n) => n + 1);
      }
    };
    window.addEventListener(
      'objectified:canvas-version-node-theme-changed',
      handler as EventListener
    );
    return () =>
      window.removeEventListener(
        'objectified:canvas-version-node-theme-changed',
        handler as EventListener
      );
  }, [versionId]);

  const classMutationStatusById = studio?.classMutationStatusById ?? EMPTY_CLASS_MUTATION_STATUS;
  const { canvasEdges: refEdges, brokenRefPlaceholders } = useMemo(
    () => buildDesignCanvasRefLayer(classes, groups),
    [classes, groups]
  );
  const classRefCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of refEdges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
    }
    return counts;
  }, [refEdges]);

  const initialNodesFromState = useMemo(() => {
    const saved = versionId ? getDefaultCanvasLayout(versionId) : [];
    const savedMap = new Map(saved.map((e) => [e.classId, e.position]));

    const sortedGroups = sortGroupsParentsFirst(groups);
    const groupNodes: Node[] = sortedGroups.map((g: StudioGroup) => {
      const meta = (g.metadata ?? {}) as GroupCanvasMetadata;
      const pos = meta.position ?? defaultPosition;
      const dims = meta.dimensions ?? { width: 280, height: 160 };
      const style = meta.style ?? {};
      const collapsed = meta.collapsed === true;
      const parentId =
        meta.parentGroupId && groups.some((x) => x.id === meta.parentGroupId)
          ? meta.parentGroupId
          : undefined;
      const groupZ = Math.max(0, groups.findIndex((x) => x.id === g.id)) + 1;
      const fullH = dims.height ?? 160;
      return {
        id: g.id,
        type: 'group' as const,
        position: { x: pos.x ?? 0, y: pos.y ?? 0 },
        data: { label: g.name, groupMetadata: meta },
        zIndex: groupZ,
        style: {
          width: dims.width ?? 280,
          height: collapsed ? COLLAPSED_GROUP_HEADER_PX : fullH,
          ...style,
        },
        ...(parentId ? { parentId, extent: 'parent' as const } : {}),
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
          tags: cls.tags,
          tagDefinitions,
          description: cls.description,
          refCount: classRefCounts.get(id) ?? 0,
          nodeStatus: {
            isDeprecated: isStudioClassDeprecated(cls),
            isNew: classMutationStatusById[id] === 'new',
            isModified: classMutationStatusById[id] === 'modified',
            hasValidationErrors: classHasValidationErrors(cls),
          },
        },
        ...(parentId ? { parentId } : {}),
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

    const brokenNodes: Node[] = brokenRefPlaceholders.map((p) => ({
      id: p.id,
      type: 'brokenRef' as const,
      position: p.position,
      data: {
        sourceClassId: p.sourceClassId,
        propertyName: p.propertyName,
        hint: p.hint,
      },
      draggable: false,
      selectable: true,
    }));

    return [...groupNodes, ...classNodes, ...brokenNodes];
  }, [
    classes,
    groups,
    versionId,
    tagDefinitions,
    classMutationStatusById,
    classRefCounts,
    brokenRefPlaceholders,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodesFromState);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  /** Set after `finalizeClassDragAfterDrop` is defined (GitHub #237). */
  const finalizeClassDragRef = useRef<(classId: string) => void>(() => {});
  const [edges, setEdges, onEdgesChange] = useEdgesState(refEdges);

  useEffect(() => {
    setNodes((prev) => {
      const selectedIds = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return initialNodesFromState.map((n) => ({
        ...n,
        selected: selectedIds.has(n.id),
      }));
    });
  }, [initialNodesFromState, setNodes]);

  useEffect(() => {
    setEdges(refEdges);
  }, [refEdges, setEdges]);

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

  const pendingNodeMutationsRef = useRef<{
    classPositions: Map<string, { x: number; y: number }>;
    classDimensions: Map<string, { width: number; height: number }>;
    groupPositions: Map<string, { x: number; y: number }>;
    groupDimensions: Map<string, { width: number; height: number }>;
  }>({
    classPositions: new Map(),
    classDimensions: new Map(),
    groupPositions: new Map(),
    groupDimensions: new Map(),
  });
  const pendingNodeMutationsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const flushPendingNodeMutations = useCallback(() => {
    if (!studio?.applyChange) return;
    const pending = pendingNodeMutationsRef.current;
    if (
      pending.classPositions.size === 0 &&
      pending.classDimensions.size === 0 &&
      pending.groupPositions.size === 0 &&
      pending.groupDimensions.size === 0
    ) {
      return;
    }

    const classPositionEntries = Array.from(pending.classPositions.entries());
    const classDimensionEntries = Array.from(pending.classDimensions.entries());
    const groupPositionEntries = Array.from(pending.groupPositions.entries());
    const groupDimensionEntries = Array.from(pending.groupDimensions.entries());

    pending.classPositions.clear();
    pending.classDimensions.clear();
    pending.groupPositions.clear();
    pending.groupDimensions.clear();

    studio.applyChange((draft) => {
      for (const [nodeId, position] of classPositionEntries) {
        const idx = draft.classes.findIndex((c) => getStableClassId(c) === nodeId);
        if (idx >= 0) {
          const target = draft.classes[idx];
          target.canvas_metadata = {
            ...target.canvas_metadata,
            position: { x: position.x, y: position.y },
          };
        }
      }

      for (const [nodeId, dimensions] of classDimensionEntries) {
        const idx = draft.classes.findIndex((c) => getStableClassId(c) === nodeId);
        if (idx >= 0) {
          const target = draft.classes[idx];
          target.canvas_metadata = {
            ...target.canvas_metadata,
            dimensions: { width: dimensions.width, height: dimensions.height },
          };
        }
      }

      for (const [nodeId, position] of groupPositionEntries) {
        const g = draft.groups.find((x) => x.id === nodeId);
        if (g) {
          g.metadata = { ...g.metadata, position: { x: position.x, y: position.y } };
        }
      }

      for (const [nodeId, dimensions] of groupDimensionEntries) {
        const g = draft.groups.find((x) => x.id === nodeId);
        if (g) {
          g.metadata = {
            ...g.metadata,
            dimensions: { width: dimensions.width, height: dimensions.height },
          };
        }
      }
    });

    if (versionId && classPositionEntries.length > 0) {
      const updatedMap = new Map(classPositionEntries);
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
  }, [studio, classes, versionId]);

  const schedulePendingNodeMutationFlush = useCallback(
    (immediate = false) => {
      if (pendingNodeMutationsTimerRef.current) {
        clearTimeout(pendingNodeMutationsTimerRef.current);
        pendingNodeMutationsTimerRef.current = null;
      }
      if (immediate) {
        flushPendingNodeMutations();
        return;
      }
      pendingNodeMutationsTimerRef.current = setTimeout(() => {
        pendingNodeMutationsTimerRef.current = null;
        flushPendingNodeMutations();
      }, NODE_MUTATION_DEBOUNCE_MS);
    },
    [flushPendingNodeMutations]
  );

  useEffect(() => {
    return () => {
      // Flush any pending node mutations before clearing the debounce timer on unmount
      flushPendingNodeMutations();
      if (pendingNodeMutationsTimerRef.current) {
        clearTimeout(pendingNodeMutationsTimerRef.current);
        pendingNodeMutationsTimerRef.current = null;
      }
    };
  }, [flushPendingNodeMutations]);

  useEffect(() => {
    // When the version changes, flush any pending mutations for the previous version
    flushPendingNodeMutations();
    if (pendingNodeMutationsTimerRef.current) {
      clearTimeout(pendingNodeMutationsTimerRef.current);
      pendingNodeMutationsTimerRef.current = null;
    }
    pendingNodeMutationsRef.current.classPositions.clear();
    pendingNodeMutationsRef.current.classDimensions.clear();
    pendingNodeMutationsRef.current.groupPositions.clear();
    pendingNodeMutationsRef.current.groupDimensions.clear();
  }, [versionId, flushPendingNodeMutations]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let effectiveChanges = changes;
      if (!mutationLocked && canvasSettings.snapToAlignment) {
        const { changes: nextChanges, guides } = applyAlignmentToNodeChanges(
          changes,
          nodesRef.current,
          {
            snapToAlignment: true,
            alignmentThresholdPx: canvasSettings.alignmentSnapPx,
            snapToGrid: canvasSettings.snapToGrid,
            gridSize: canvasSettings.gridSize,
          }
        );
        effectiveChanges = nextChanges;
        setAlignmentGuides(guides);
      } else {
        setAlignmentGuides(EMPTY_ALIGNMENT_GUIDES);
      }

      // In read-only mode, only allow selection and dimensions changes through so
      // the user can still click/select nodes and react-flow can measure intrinsic
      // node sizes. Destructive changes (remove) and position changes (drag) are
      // discarded before mutating local state.
      const allowedChanges = mutationLocked
        ? effectiveChanges.filter((c) => c.type === 'select' || c.type === 'dimensions')
        : effectiveChanges;

      if (allowedChanges.length > 0) {
        onNodesChange(allowedChanges as Parameters<typeof onNodesChange>[0]);
      }
      if (mutationLocked || !studio?.applyChange) return;

      const groupIds = new Set(groups.map((g) => g.id));
      let sawTerminalChange = false;
      let sawPersistableChange = false;
      const pending = pendingNodeMutationsRef.current;

      for (const change of effectiveChanges) {
        if (change.type === 'position' && change.position != null) {
          sawPersistableChange = true;
          if (groupIds.has(change.id)) {
            pending.groupPositions.set(change.id, {
              x: change.position.x,
              y: change.position.y,
            });
          } else if (validClassIds.has(change.id)) {
            if (change.dragging === false) {
              pending.classPositions.delete(change.id);
              sawTerminalChange = true;
              window.setTimeout(() => finalizeClassDragRef.current(change.id), 0);
            } else {
              pending.classPositions.set(change.id, {
                x: change.position.x,
                y: change.position.y,
              });
            }
          }
          if (change.dragging === false && groupIds.has(change.id)) {
            sawTerminalChange = true;
          }
        }
        if (
          change.type === 'dimensions' &&
          change.dimensions != null
        ) {
          const { width, height } = change.dimensions;
          if (typeof width === 'number' && typeof height === 'number') {
            sawPersistableChange = true;
            if (groupIds.has(change.id)) {
              pending.groupDimensions.set(change.id, { width, height });
            } else if (validClassIds.has(change.id)) {
              pending.classDimensions.set(change.id, { width, height });
            }
          }
          if (change.resizing === false) {
            sawTerminalChange = true;
          }
        }
      }

      if (sawPersistableChange) {
        schedulePendingNodeMutationFlush(sawTerminalChange);
      }
    },
    [
      onNodesChange,
      studio,
      groups,
      mutationLocked,
      schedulePendingNodeMutationFlush,
      validClassIds,
      canvasSettings.snapToAlignment,
      canvasSettings.alignmentSnapPx,
      canvasSettings.snapToGrid,
      canvasSettings.gridSize,
    ]
  );

  const canvasSearch = useCanvasSearchOptional();
  const searchState = canvasSearch?.state ?? null;
  const focusState = focusMode?.state ?? null;

  const visibleClassIds = useMemo(
    () =>
      searchState ? getVisibleClassIds(classes, searchState, groups) : null,
    [classes, searchState, groups]
  );
  const classToGroup = useMemo(() => {
    const m = new Map<string, string>();
    for (const cls of classes) {
      const gid = (cls.canvas_metadata as { group?: string } | undefined)?.group;
      if (gid) m.set(getStableClassId(cls), gid);
    }
    return m;
  }, [classes]);

  const archivedHiddenGroupIds = useMemo(
    () => getArchivedSubtreeGroupIds(groups),
    [groups]
  );

  /** Archive-only edge set so focus subgraph can be computed before search narrowing (GitHub #242). */
  const archiveOnlyFilteredEdges = useMemo(
    () =>
      edges.filter((e) => {
        const srcG = classToGroup.get(e.source);
        if (srcG && archivedHiddenGroupIds.has(srcG)) return false;
        if (!isBrokenRefPlaceholderNodeId(e.target)) {
          const tgtG = classToGroup.get(e.target);
          if (tgtG && archivedHiddenGroupIds.has(tgtG)) return false;
        }
        return true;
      }),
    [edges, classToGroup, archivedHiddenGroupIds]
  );

  const focusStartNodeIds = useMemo(() => {
    if (!focusState || !isFocusModeActive(focusState)) return null;
    if (focusState.focusNodeId) return new Set([focusState.focusNodeId]);
    if (focusState.focusGroupIds.length > 0) {
      const ids = new Set<string>();
      for (const anchorId of focusState.focusGroupIds) {
        const subtree = collectGroupDescendants(groups, anchorId);
        for (const [classId, groupId] of classToGroup) {
          if (groupId && subtree.has(groupId)) ids.add(classId);
        }
      }
      return ids;
    }
    return null;
  }, [focusState, classToGroup, groups]);

  const focusedClassIdsPreSearch = useMemo(() => {
    if (!focusStartNodeIds) return null;
    return getFocusedNodeIds(
      archiveOnlyFilteredEdges,
      focusStartNodeIds,
      focusState?.focusModeDegree ?? 1
    );
  }, [focusStartNodeIds, archiveOnlyFilteredEdges, focusState?.focusModeDegree]);

  const canvasMatchClassIds = useMemo(() => {
    if (!visibleClassIds) return new Set<string>();
    if (!searchState || !isSearchActive(searchState)) return visibleClassIds;
    if (
      searchState.searchInFocusOnly &&
      focusState &&
      isFocusModeActive(focusState) &&
      focusedClassIdsPreSearch
    ) {
      return intersectClassIds(visibleClassIds, focusedClassIdsPreSearch);
    }
    return visibleClassIds;
  }, [
    visibleClassIds,
    searchState,
    focusState,
    focusedClassIdsPreSearch,
  ]);

  const visibleGroupIds = useMemo(() => {
    if (!searchState || !visibleClassIds) return null;
    return getVisibleGroupIds(groups, searchState, canvasMatchClassIds, classToGroup);
  }, [groups, searchState, visibleClassIds, canvasMatchClassIds, classToGroup]);

  const searchHighlightGroupIds = useMemo(() => {
    if (!searchState || !isSearchActive(searchState)) return null;
    if (searchState.searchMatchDisplayMode !== 'dimNonMatches') return null;
    return getSearchHighlightGroupIds(groups, canvasMatchClassIds, classToGroup);
  }, [searchState, groups, canvasMatchClassIds, classToGroup]);

  const baseNodes =
    classes.length > 0 || groups.length > 0 ? nodes : initialNodesFromState;

  const filteredNodes = useMemo(() => {
    if (visibleClassIds === null && visibleGroupIds === null) return baseNodes;
    if (searchState && !isSearchActive(searchState)) return baseNodes;
    if (searchState?.searchMatchDisplayMode === 'dimNonMatches') {
      return baseNodes;
    }
    const visibleC = canvasMatchClassIds ?? new Set<string>();
    const visibleG = visibleGroupIds ?? new Set<string>();
    return baseNodes.filter((node: Node) => {
      if (node.type === 'group') return visibleG.has(node.id);
      if (node.type === 'brokenRef') {
        const src = (node.data as { sourceClassId?: string }).sourceClassId;
        return !!src && visibleC.has(src);
      }
      return visibleC.has(node.id);
    });
  }, [baseNodes, visibleClassIds, visibleGroupIds, searchState, canvasMatchClassIds]);

  const filteredEdges = useMemo(() => {
    if (visibleClassIds === null) return edges;
    if (searchState && !isSearchActive(searchState)) return edges;
    if (searchState?.searchMatchDisplayMode === 'dimNonMatches') {
      return edges;
    }
    return edges.filter((e) => {
      const srcOk = canvasMatchClassIds.has(e.source);
      const tgtOk =
        canvasMatchClassIds.has(e.target) || isBrokenRefPlaceholderNodeId(e.target);
      return srcOk && tgtOk;
    });
  }, [edges, visibleClassIds, searchState, canvasMatchClassIds]);

  const searchAndArchiveFilteredNodes = useMemo(() => {
    return filteredNodes.filter((node: Node) => {
      if (node.type === 'group') return !archivedHiddenGroupIds.has(node.id);
      if (node.type === 'class') {
        const gid = classToGroup.get(node.id);
        if (!gid) return true;
        return !archivedHiddenGroupIds.has(gid);
      }
      if (node.type === 'brokenRef') {
        const src = (node.data as { sourceClassId?: string }).sourceClassId;
        if (!src) return true;
        const gid = classToGroup.get(src);
        if (!gid) return true;
        return !archivedHiddenGroupIds.has(gid);
      }
      return true;
    });
  }, [filteredNodes, archivedHiddenGroupIds, classToGroup]);

  const searchAndArchiveFilteredEdges = useMemo(() => {
    return filteredEdges.filter((e) => {
      const srcG = classToGroup.get(e.source);
      if (srcG && archivedHiddenGroupIds.has(srcG)) return false;
      if (!isBrokenRefPlaceholderNodeId(e.target)) {
        const tgtG = classToGroup.get(e.target);
        if (tgtG && archivedHiddenGroupIds.has(tgtG)) return false;
      }
      return true;
    });
  }, [filteredEdges, classToGroup, archivedHiddenGroupIds]);

  // --- Focus mode filtering (second pass, narrows search results) ---
  const focusedClassIds = useMemo(() => {
    if (!focusStartNodeIds) return null;
    return getFocusedNodeIds(
      searchAndArchiveFilteredEdges,
      focusStartNodeIds,
      focusState?.focusModeDegree ?? 1
    );
  }, [focusStartNodeIds, searchAndArchiveFilteredEdges, focusState?.focusModeDegree]);

  const focusedGroupIds = useMemo(() => {
    if (!focusedClassIds) return null;
    const ids = getFocusedGroupIds(groups, focusedClassIds, classToGroup);
    // Always include focused anchor groups, even when they have no member classes,
    // so group nodes remain visible rather than the canvas going blank.
    if (focusState?.focusGroupIds?.length) {
      for (const gid of focusState.focusGroupIds) ids.add(gid);
    }
    return ids;
  }, [focusedClassIds, groups, classToGroup, focusState?.focusGroupIds]);

  const focusFilteredNodes = useMemo(() => {
    if (!focusedClassIds || !focusedGroupIds) return searchAndArchiveFilteredNodes;
    return searchAndArchiveFilteredNodes.filter((node: Node) => {
      if (node.type === 'group') return focusedGroupIds.has(node.id);
      if (node.type === 'brokenRef') {
        const srcId = (node.data as { sourceClassId?: string } | undefined)?.sourceClassId;
        return !!srcId && focusedClassIds.has(srcId);
      }
      return focusedClassIds.has(node.id);
    });
  }, [searchAndArchiveFilteredNodes, focusedClassIds, focusedGroupIds]);

  /** DOM / keyboard order for roving tabindex on class, group, and broken-ref nodes (GitHub #236). */
  const canvasNavigableNodeIds = useMemo(
    () =>
      focusFilteredNodes
        .filter(
          (n) =>
            n.type === 'class' || n.type === 'group' || n.type === 'brokenRef'
        )
        .map((n) => n.id),
    [focusFilteredNodes]
  );

  /** Precomputed index map for O(1) lookup in displayNodes and navigation handlers. */
  const canvasNavigableNodeIndexMap = useMemo(
    () => new Map(canvasNavigableNodeIds.map((id, idx) => [id, idx])),
    [canvasNavigableNodeIds]
  );

  /** Canvas node ids for search match stepping (class + broken-ref), in visual order (GitHub #242). */
  const orderedSearchMatchNodeIds = useMemo(() => {
    if (!searchState || !isSearchActive(searchState)) return [];
    const match = canvasMatchClassIds;
    const ids: string[] = [];
    for (const n of focusFilteredNodes) {
      if (n.type === 'class' && match.has(n.id)) ids.push(n.id);
      if (n.type === 'brokenRef') {
        const src = (n.data as { sourceClassId?: string } | undefined)?.sourceClassId;
        if (src && match.has(src)) ids.push(n.id);
      }
    }
    return ids;
  }, [focusFilteredNodes, searchState, canvasMatchClassIds]);

  useEffect(() => {
    if (!canvasSearch) return;
    canvasSearch.setSearchMatchClassCount(canvasMatchClassIds.size);
  }, [canvasSearch, canvasMatchClassIds]);

  const searchMatchClassIdsKeyRef = useRef<string>('');
  useEffect(() => {
    if (!canvasSearch) return;
    const key = Array.from(canvasMatchClassIds).join('\x1e');
    if (searchMatchClassIdsKeyRef.current === key) return;
    searchMatchClassIdsKeyRef.current = key;
    canvasSearch.setSearchMatchClassIds(Array.from(canvasMatchClassIds));
  }, [canvasSearch, canvasMatchClassIds]);

  useEffect(() => {
    if (!canvasSearch) return;
    canvasSearch.setSearchMatchNavTotal(orderedSearchMatchNodeIds.length);
  }, [canvasSearch, orderedSearchMatchNodeIds.length]);

  const orderedMatchNavKey = useMemo(
    () => orderedSearchMatchNodeIds.join('\x1e'),
    [orderedSearchMatchNodeIds]
  );
  useEffect(() => {
    canvasSearch?.resetActiveSearchMatch();
  }, [orderedMatchNavKey, canvasSearch]);

  const visibleFlowClassIds = useMemo(
    () => focusFilteredNodes.filter((n) => n.type === 'class').map((n) => n.id),
    [focusFilteredNodes]
  );
  const visibleFlowClassIdSet = useMemo(
    () => new Set(visibleFlowClassIds),
    [visibleFlowClassIds]
  );

  const focusFilteredEdges = useMemo(() => {
    if (!focusedClassIds) return searchAndArchiveFilteredEdges;
    return searchAndArchiveFilteredEdges.filter((e) => {
      if (isBrokenRefPlaceholderNodeId(e.target)) {
        return focusedClassIds.has(e.source);
      }
      return focusedClassIds.has(e.source) && focusedClassIds.has(e.target);
    });
  }, [searchAndArchiveFilteredEdges, focusedClassIds]);

  const classRefEdgeCount = useMemo(
    () => focusFilteredEdges.filter((e) => e.type === 'classRef').length,
    [focusFilteredEdges]
  );

  const selectedClassRefEdge = useMemo((): Edge<ClassRefEdgeData> | undefined => {
    const e = focusFilteredEdges.find((ed) => ed.type === 'classRef' && ed.selected);
    return e as Edge<ClassRefEdgeData> | undefined;
  }, [focusFilteredEdges]);

  /**
   * Stamp `sqlModeDistinctIdRef` into each classRef edge's data based on the current
   * schemaMode so that ClassRefEdge does not need to subscribe to the full StudioContext.
   */
  const sqlModeDistinctIdRef = schemaMode === 'sql';
  const displayEdges = useMemo(() => {
    const dim =
      searchState &&
      isSearchActive(searchState) &&
      searchState.searchMatchDisplayMode === 'dimNonMatches';
    return focusFilteredEdges.map((e) => {
      if (e.type !== 'classRef') return e;
      const d = e.data as ClassRefEdgeData | undefined;
      let searchDimmed = false;
      if (dim) {
        const srcHit = canvasMatchClassIds.has(e.source);
        const tgtHit =
          isBrokenRefPlaceholderNodeId(e.target) || canvasMatchClassIds.has(e.target);
        searchDimmed = !srcHit && !tgtHit;
      }
      const nextData: ClassRefEdgeData = {
        ...(d as ClassRefEdgeData),
        sqlModeDistinctIdRef,
        searchDimmed,
      };
      if (
        (d?.sqlModeDistinctIdRef ?? false) === sqlModeDistinctIdRef &&
        (d?.searchDimmed ?? false) === searchDimmed
      ) {
        return e;
      }
      return { ...e, data: nextData };
    });
  }, [focusFilteredEdges, sqlModeDistinctIdRef, searchState, canvasMatchClassIds]);

  const clearSelectedEdges = useCallback(() => {
    setEdges((cur) => cur.map((ed) => ({ ...ed, selected: false })));
  }, [setEdges]);

  // Escape key handler to exit focus mode.
  useEffect(() => {
    if (!focusState || !isFocusModeActive(focusState)) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const targetEl = e.target as HTMLElement | null;
        if (
          targetEl &&
          (targetEl.tagName === 'INPUT' ||
            targetEl.tagName === 'TEXTAREA' ||
            targetEl.tagName === 'SELECT' ||
            targetEl.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        focusMode?.exitFocusMode();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [focusState, focusMode]);

  const handleInlineRenameCommit = useCallback(
    (classId: string, nextName: string) => {
      setInlineRenameClassId(null);
      if (!studio?.applyChange || mutationLocked) return;
      const trimmed = nextName.trim();
      if (!trimmed) return;
      const cls = classes.find((c) => getStableClassId(c) === classId);
      if (cls?.name === trimmed) return;
      studio.applyChange((draft) => {
        const idx = draft.classes.findIndex((c) => getStableClassId(c) === classId);
        if (idx >= 0) draft.classes[idx].name = trimmed;
      });
    },
    [studio, mutationLocked, classes]
  );

  const handleToggleGroupCollapse = useCallback(
    (groupId: string) => {
      if (!studio?.applyChange || mutationLocked) return;
      studio.applyChange((draft) => {
        const g = draft.groups.find((x) => x.id === groupId);
        if (!g) return;
        const meta = { ...(g.metadata ?? {}) } as GroupCanvasMetadata;
        meta.collapsed = !meta.collapsed;
        g.metadata = { ...meta } as Record<string, unknown>;
      });
    },
    [studio, mutationLocked]
  );

  const displayNodesBase = useMemo(() => {
    const allStoredConfigs = versionId ? getAllClassNodeConfigs(versionId) : {};
    const searchDim =
      Boolean(searchState) &&
      isSearchActive(searchState!) &&
      searchState!.searchMatchDisplayMode === 'dimNonMatches';
    const navIdx = canvasSearch?.activeSearchMatchIndex ?? -1;
    const activeNavId =
      navIdx >= 0 && navIdx < orderedSearchMatchNodeIds.length
        ? orderedSearchMatchNodeIds[navIdx]!
        : null;
    return focusFilteredNodes.map((node: Node) => {
      if (node.type === 'brokenRef') {
        const d = node.data as {
          sourceClassId?: string;
          propertyName?: string;
          hint?: string;
        };
        const src = d.sourceClassId ?? '';
        return {
          ...node,
          data: {
            ...node.data,
            sourceClassId: src,
            propertyName: d.propertyName ?? '',
            hint: d.hint ?? '',
            canvasSearchDimmed:
              searchDim && !(src && canvasMatchClassIds.has(src)),
            canvasSearchNavHighlight: activeNavId === node.id,
            onFixReference:
              !mutationLocked && d.sourceClassId
                ? (classId: string, propertyName: string) =>
                    editClassRequest?.requestEditPropertyForClass(
                      classId,
                      propertyName
                    )
                : undefined,
          },
        };
      }
      if (node.type === 'group') {
        const gd = node.data as { groupMetadata?: GroupCanvasMetadata };
        const collapsed = gd.groupMetadata?.collapsed === true;
        return {
          ...node,
          data: {
            ...node.data,
            allowResize: !mutationLocked && !collapsed,
            onEdit: canvasGroup?.openGroupEditor,
            onToggleCollapse: !mutationLocked ? handleToggleGroupCollapse : undefined,
            resizeConstraints: {
              minWidth: canvasSettings.groupNodeMinWidth,
              maxWidth: canvasSettings.groupNodeMaxWidth,
              minHeight: canvasSettings.groupNodeMinHeight,
              maxHeight: canvasSettings.groupNodeMaxHeight,
            },
            resizeHandleVisibility: canvasSettings.resizeHandleVisibility,
            canvasSearchDimmed:
              searchDim &&
              searchHighlightGroupIds !== null &&
              !searchHighlightGroupIds.has(node.id),
            canvasSearchNavHighlight: false,
          },
        };
      }
      const stored: ClassNodeConfig = {
        ...allStoredConfigs[node.id],
        ...configOverrides[node.id],
      };
      const nd = node.data as unknown as ClassNodeDataExtended;
      const autoTheme = resolveAutoClassNodeTheme({
        tags: nd.tags ?? [],
        tagDefinitions: nd.tagDefinitions ?? {},
        tenantPrimaryColor,
        prefs: versionNodeThemePrefs,
      });
      const resolvedNodeTheme = mergeClassNodeThemes(autoTheme, stored.theme);
      return {
        ...node,
        data: {
          ...node.data,
          classNodeConfig: stored,
          resolvedNodeTheme,
          onConfigChange,
          allowResize: !mutationLocked,
          resizeConstraints: {
            minWidth: canvasSettings.classNodeMinWidth,
            maxWidth: canvasSettings.classNodeMaxWidth,
            minHeight: canvasSettings.classNodeMinHeight,
            maxHeight: canvasSettings.classNodeMaxHeight,
          },
          resizeHandleVisibility: canvasSettings.resizeHandleVisibility,
          propertyDisplayMode: canvasSettings.nodePropertyDisplay,
          highContrast: canvasSettings.highContrastCanvas,
          inlineRenameActive:
            !mutationLocked && inlineRenameClassId === node.id,
          onInlineRenameCommit: handleInlineRenameCommit,
          onInlineRenameCancel: () => setInlineRenameClassId(null),
          canvasSearchDimmed: searchDim && !canvasMatchClassIds.has(node.id),
          canvasSearchNavHighlight: activeNavId === node.id,
        },
      };
    });
  }, [
    focusFilteredNodes,
    searchState,
    canvasSearch?.activeSearchMatchIndex,
    orderedSearchMatchNodeIds,
    canvasMatchClassIds,
    searchHighlightGroupIds,
    versionId,
    configOverrides,
    onConfigChange,
    mutationLocked,
    canvasGroup,
    canvasSettings.nodePropertyDisplay,
    canvasSettings.highContrastCanvas,
    canvasSettings.classNodeMinWidth,
    canvasSettings.classNodeMaxWidth,
    canvasSettings.classNodeMinHeight,
    canvasSettings.classNodeMaxHeight,
    canvasSettings.groupNodeMinWidth,
    canvasSettings.groupNodeMaxWidth,
    canvasSettings.groupNodeMinHeight,
    canvasSettings.groupNodeMaxHeight,
    canvasSettings.resizeHandleVisibility,
    tenantPrimaryColor,
    versionNodeThemePrefs,
    inlineRenameClassId,
    handleInlineRenameCommit,
    handleToggleGroupCollapse,
    editClassRequest,
  ]);

  // Debounce layout quality computation to avoid running an O(E²+N²) algorithm
  // on every node/edge change (e.g., during drag/resize).
  const [layoutQuality, setLayoutQuality] = useState<LayoutQualityResult | null>(null);
  useEffect(() => {
    if (!canvasSettings.showLayoutHints) {
      setLayoutQuality(null);
      return;
    }
    const id = setTimeout(() => {
      setLayoutQuality(getLayoutQuality(displayNodesBase, focusFilteredEdges));
    }, 300);
    return () => clearTimeout(id);
  }, [canvasSettings.showLayoutHints, displayNodesBase, focusFilteredEdges]);

  // Dependency overlay: selected class nodes, circular edges, upstream/downstream/path (GitHub #90).
  // Broken-ref placeholder edges are excluded so they don't skew circular/depth/path calculations.
  const dependencyEdges: DependencyEdge[] = useMemo(
    () =>
      focusFilteredEdges
        .filter(
          (e) =>
            !isBrokenRefPlaceholderNodeId(e.source) &&
            !isBrokenRefPlaceholderNodeId(e.target)
        )
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        })),
    [focusFilteredEdges]
  );
  const selectedClassNodeIds = useMemo(
    () =>
      displayNodesBase
        .filter((n) => n.type === 'class' && n.selected)
        .map((n) => n.id),
    [displayNodesBase]
  );

  const selectedClassesInGroupsCount = useMemo(
    () => selectedClassNodeIds.filter((id) => Boolean(classToGroup.get(id))).length,
    [selectedClassNodeIds, classToGroup]
  );

  const selectedNodeId = selectedClassNodeIds[0] ?? null;
  const selectedNodeId2 = selectedClassNodeIds[1] ?? null;
  const [liveRegionMessage, setLiveRegionMessage] = useState('');
  const circularEdgeIds = useMemo(
    () =>
      canvasSettings.showDependencyOverlay
        ? getCircularDependencyEdgeIds(dependencyEdges)
        : new Set<string>(),
    [dependencyEdges, canvasSettings.showDependencyOverlay]
  );
  const upstreamCount = useMemo(
    () =>
      canvasSettings.showDependencyOverlay && selectedNodeId !== null
        ? getUpstreamNodeIds(dependencyEdges, selectedNodeId).size
        : 0,
    [dependencyEdges, selectedNodeId, canvasSettings.showDependencyOverlay]
  );
  const downstreamCount = useMemo(
    () =>
      canvasSettings.showDependencyOverlay && selectedNodeId !== null
        ? getDownstreamNodeIds(dependencyEdges, selectedNodeId).size
        : 0,
    [dependencyEdges, selectedNodeId, canvasSettings.showDependencyOverlay]
  );
  const pathFromSelectedToSecond = useMemo(
    () =>
      canvasSettings.showDependencyOverlay &&
      selectedNodeId !== null &&
      selectedNodeId2 !== null
        ? getPathNodeIds(dependencyEdges, selectedNodeId, selectedNodeId2)
        : null,
    [dependencyEdges, selectedNodeId, selectedNodeId2, canvasSettings.showDependencyOverlay]
  );
  const pathLength =
    pathFromSelectedToSecond !== null ? pathFromSelectedToSecond.length - 1 : null;
  const selectedNodeName = useMemo(() => {
    if (!canvasSettings.showDependencyOverlay || !selectedNodeId) return undefined;
    const cls = classes.find((c) => getStableClassId(c) === selectedNodeId);
    return cls?.name;
  }, [classes, selectedNodeId, canvasSettings.showDependencyOverlay]);
  const selectedNodeName2 = useMemo(() => {
    if (!canvasSettings.showDependencyOverlay || !selectedNodeId2) return undefined;
    const cls = classes.find((c) => getStableClassId(c) === selectedNodeId2);
    return cls?.name;
  }, [classes, selectedNodeId2, canvasSettings.showDependencyOverlay]);

  // Schema metrics panel: depth, circular edge count, affected node count (GitHub #91).
  const schemaMetrics = useMemo(() => {
    if (!canvasSettings.showSchemaMetricsPanel) return null;
    const circularIds = getCircularDependencyEdgeIds(dependencyEdges);
    const affectedNodes = getNodesInCircularDependency(dependencyEdges, circularIds);
    return {
      depth: getSchemaMaxDepth(dependencyEdges),
      circularEdgeCount: circularIds.size,
      affectedCount: affectedNodes.size,
    };
  }, [dependencyEdges, canvasSettings.showSchemaMetricsPanel]);

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
      if (mutationLocked) return;
      if (node.type === 'group') {
        canvasGroup?.openGroupEditor(node.id);
      } else if (node.type === 'brokenRef') {
        const d = node.data as { sourceClassId?: string; propertyName?: string };
        if (d.sourceClassId) {
          editClassRequest?.requestEditPropertyForClass(
            d.sourceClassId,
            (d.propertyName ?? '').trim()
          );
        }
      } else {
        editClassRequest?.requestEditClass(node.id);
      }
    },
    [editClassRequest, canvasGroup, mutationLocked]
  );

  const handleEdgeDoubleClick = useCallback(
    (_e: MouseEvent, edge: Edge) => {
      if (mutationLocked) return;
      if (edge.type !== 'classRef') return;
      const d = edge.data as ClassRefEdgeData | undefined;
      if (d?.brokenRef && d.fix) {
        editClassRequest?.requestEditPropertyForClass(
          d.fix.sourceClassId,
          d.fix.propertyName
        );
        return;
      }
      const prop = d?.edit?.propertyName?.trim();
      if (d?.edit && prop) {
        editClassRequest?.requestEditPropertyForClass(d.edit.sourceClassId, prop);
      }
    },
    [mutationLocked, editClassRequest]
  );

  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(-1);
  const [classListOpen, setClassListOpen] = useState(false);

  const focusCanvasNavElement = useCallback((nodeId: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-canvas-nav-node="${CSS.escape(nodeId)}"]`
      );
      el?.focus();
    });
  }, []);

  // Clamp keyboardFocusIndex whenever the navigable list shrinks to avoid out-of-range reads.
  useEffect(() => {
    if (canvasNavigableNodeIds.length === 0) {
      setKeyboardFocusIndex(-1);
      return;
    }
    setKeyboardFocusIndex((prev) =>
      prev >= canvasNavigableNodeIds.length
        ? canvasNavigableNodeIds.length - 1
        : prev
    );
  }, [canvasNavigableNodeIds]);

  const enterTargetClassId = useMemo(() => {
    const selected = nodes.filter((n) => n.selected && n.type === 'class');
    if (selected.length !== 1) return null;
    return selected[0].id;
  }, [nodes]);

  useEffect(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length !== 1) return;
    const id = selected[0].id;
    const idx = canvasNavigableNodeIndexMap.get(id) ?? -1;
    if (idx >= 0) setKeyboardFocusIndex(idx);
  }, [nodes, canvasNavigableNodeIndexMap]);

  const focusNavigableNodeByIndex = useCallback(
    (index: number, source: 'arrow' | 'tab' = 'arrow') => {
      if (canvasNavigableNodeIds.length === 0) return;
      const normalizedIndex = getNextKeyboardFocusIndex(
        index,
        0,
        canvasNavigableNodeIds.length
      );
      const focusedNodeId = canvasNavigableNodeIds[normalizedIndex];
      setKeyboardFocusIndex(normalizedIndex);
      clearSelectedEdges();
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          selected: node.id === focusedNodeId,
        }))
      );
      const rn = nodes.find((n) => n.id === focusedNodeId);
      const verb = source === 'tab' ? 'Focused' : 'Selected';
      if (rn?.type === 'class') {
        const targetClass = classes.find((cls) => getStableClassId(cls) === focusedNodeId);
        setLiveRegionMessage(
          targetClass
            ? `${verb} ${targetClass.name ?? 'Unnamed class'}`
            : 'Selected class node'
        );
      } else if (rn?.type === 'group') {
        const label = (rn.data as { label?: string }).label ?? 'Untitled';
        setLiveRegionMessage(`${verb} group ${label}`);
      } else if (rn?.type === 'brokenRef') {
        const hint = (rn.data as { hint?: string }).hint ?? 'Broken reference';
        setLiveRegionMessage(`${verb} ${hint}`);
      } else {
        setLiveRegionMessage('Selected node');
      }
      focusCanvasNavElement(focusedNodeId);
    },
    [canvasNavigableNodeIds, setNodes, classes, nodes, clearSelectedEdges, focusCanvasNavElement]
  );

  const keyboardFocusIndexRef = useRef(keyboardFocusIndex);
  keyboardFocusIndexRef.current = keyboardFocusIndex;

  const navigateCanvasNavFromDelta = useCallback(
    (delta: 1 | -1) => {
      focusNavigableNodeByIndex(keyboardFocusIndexRef.current + delta, 'arrow');
    },
    [focusNavigableNodeByIndex]
  );

  const handleCanvasNavShellFocusById = useCallback(
    (nodeId: string) => {
      clearSelectedEdges();
      setNodes((cur) =>
        cur.map((n) => ({
          ...n,
          selected: n.id === nodeId,
        }))
      );
      const idx = canvasNavigableNodeIndexMap.get(nodeId) ?? -1;
      if (idx >= 0) setKeyboardFocusIndex(idx);
    },
    [canvasNavigableNodeIndexMap, setNodes, clearSelectedEdges]
  );

  const onCanvasNavShellEnterClass = useCallback(
    (classId: string) => {
      if (mutationLocked) return;
      editClassRequest?.requestEditClass(classId);
      setLiveRegionMessage('Opened class editor');
    },
    [mutationLocked, editClassRequest]
  );

  const onCanvasNavShellEnterGroup = useCallback(
    (groupId: string) => {
      if (mutationLocked) return;
      canvasGroup?.openGroupEditor(groupId);
      setLiveRegionMessage('Opened group editor');
    },
    [mutationLocked, canvasGroup]
  );

  /** Precomputed classId→name map for O(1) edge label lookups. */
  const classIdToNameMap = useMemo(
    () => new Map(classes.map((c) => [getStableClassId(c), c.name ?? ''])),
    [classes]
  );

  const handleEdgeA11yFocus = useCallback(
    (edgeId: string) => {
      setNodes((cur) => cur.map((n) => ({ ...n, selected: false })));
      setEdges((cur) =>
        cur.map((ed) => ({ ...ed, selected: ed.id === edgeId }))
      );
      setKeyboardFocusIndex(-1);
      const edge = edges.find((e) => e.id === edgeId);
      const srcName = classIdToNameMap.get(edge?.source ?? '') ?? 'source';
      const tgtName = classIdToNameMap.get(edge?.target ?? '') ?? 'target';
      const d = edge?.data as ClassRefEdgeData | undefined;
      setLiveRegionMessage(
        d?.label?.trim()
          ? `Selected edge from ${srcName} to ${tgtName}: ${d.label}`
          : `Selected edge from ${srcName} to ${tgtName}`
      );
    },
    [setNodes, setEdges, edges, classIdToNameMap]
  );

  const displayNodes = useMemo(() => {
    return displayNodesBase.map((node) => {
      const navIdx = canvasNavigableNodeIndexMap.get(node.id) ?? -1;
      const shellTab =
        navIdx >= 0 && navIdx === keyboardFocusIndex ? 0 : -1;
      const shellA11y = {
        canvasNavShellTabIndex: shellTab as 0 | -1,
        onCanvasNavShellFocus: () => handleCanvasNavShellFocusById(node.id),
        onNavigateCanvasNav: navigateCanvasNavFromDelta,
      };
      if (node.type === 'class') {
        return {
          ...node,
          data: {
            ...node.data,
            ...shellA11y,
            onCanvasNavShellEnter: () => onCanvasNavShellEnterClass(node.id),
          },
        };
      }
      if (node.type === 'group') {
        return {
          ...node,
          data: {
            ...node.data,
            ...shellA11y,
            onCanvasNavShellEnter: () => onCanvasNavShellEnterGroup(node.id),
          },
        };
      }
      if (node.type === 'brokenRef') {
        return {
          ...node,
          data: {
            ...node.data,
            ...shellA11y,
          },
        };
      }
      return node;
    });
  }, [
    displayNodesBase,
    canvasNavigableNodeIndexMap,
    keyboardFocusIndex,
    handleCanvasNavShellFocusById,
    navigateCanvasNavFromDelta,
    onCanvasNavShellEnterClass,
    onCanvasNavShellEnterGroup,
  ]);

  const displayEdgesForFlow = useMemo(() => {
    const allowEdgeTab = classRefEdgeCount <= 32;
    return displayEdges.map((e) => {
      if (e.type !== 'classRef') return e;
      const d = e.data as ClassRefEdgeData | undefined;
      const srcName = classIdToNameMap.get(e.source) ?? 'source';
      const tgtName = classIdToNameMap.get(e.target) ?? 'target';
      const mid = [d?.label, d?.cardinalityLabel].filter(Boolean).join(' · ');
      const a11yEdgeLabel = mid
        ? `Reference from ${srcName} to ${tgtName}: ${mid}`
        : `Reference from ${srcName} to ${tgtName}`;
      return {
        ...e,
        data: {
          ...(d as ClassRefEdgeData),
          a11yEdgeLabel,
          a11yAllowTabStop: allowEdgeTab,
          onEdgeA11yFocus: handleEdgeA11yFocus,
        },
      };
    });
  }, [displayEdges, classIdToNameMap, classRefEdgeCount, handleEdgeA11yFocus]);

  const selectedNodeIds = useMemo(
    () => displayNodesBase.filter((n) => n.selected).map((n) => n.id),
    [displayNodesBase]
  );

  const isReducedMotion =
    canvasSettings.reducedMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const animateViewport = !isReducedMotion;

  const fitCanvasToContent = useCallback(() => {
    reactFlowRef.current?.fitView({
      padding: 0.2,
      duration: animateViewport ? 260 : 0,
    });
    setLiveRegionMessage('Fit canvas to content');
  }, [animateViewport]);

  const fitCanvasToSelected = useCallback(() => {
    if (!reactFlowRef.current || selectedNodeIds.length === 0) return;
    reactFlowRef.current.fitView({
      nodes: selectedNodeIds.map((id) => ({ id })),
      padding: 0.25,
      duration: animateViewport ? 240 : 0,
    });
    setLiveRegionMessage('Fit canvas to selected nodes');
  }, [selectedNodeIds, animateViewport]);

  const resetCanvasViewport = useCallback(() => {
    if (!reactFlowRef.current) return;
    reactFlowRef.current.setViewport(
      { x: 0, y: 0, zoom: 1 },
      { duration: animateViewport ? 200 : 0 }
    );
    setLiveRegionMessage('Reset canvas viewport');
  }, [animateViewport]);

  const zoomCanvasIn = useCallback(() => {
    reactFlowRef.current?.zoomIn({ duration: animateViewport ? 150 : 0 });
    setLiveRegionMessage('Zoomed in');
  }, [animateViewport]);

  const zoomCanvasOut = useCallback(() => {
    reactFlowRef.current?.zoomOut({ duration: animateViewport ? 150 : 0 });
    setLiveRegionMessage('Zoomed out');
  }, [animateViewport]);

  const panCanvasViewportByKey = useCallback(
    (key: string) => {
      const rf = reactFlowRef.current;
      if (!rf?.getViewport) return;
      const vp = rf.getViewport();
      const step = 48 / (vp.zoom || 1);
      let dx = 0;
      let dy = 0;
      if (key === 'ArrowLeft') dx = step;
      if (key === 'ArrowRight') dx = -step;
      if (key === 'ArrowUp') dy = step;
      if (key === 'ArrowDown') dy = -step;
      if (dx === 0 && dy === 0) return;
      void rf.setViewport(
        { x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom },
        { duration: animateViewport ? 80 : 0 }
      );
      setLiveRegionMessage('Panned canvas');
    },
    [animateViewport]
  );

  const handleSelectClassFromList = useCallback(
    (classId: string) => {
      clearSelectedEdges();
      setNodes((cur) =>
        cur.map((n) => ({
          ...n,
          selected: n.type === 'class' && n.id === classId,
        }))
      );
      const idx = canvasNavigableNodeIndexMap.get(classId) ?? -1;
      if (idx >= 0) setKeyboardFocusIndex(idx);
      focusCanvasNavElement(classId);
    },
    [canvasNavigableNodeIndexMap, setNodes, clearSelectedEdges, focusCanvasNavElement]
  );

  const handleCanvasKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const withPrimaryModifier = e.metaKey || e.ctrlKey;
      if (withPrimaryModifier) {
        if ((e.key === '=' && !e.shiftKey) || (e.key === '+' && e.shiftKey)) {
          e.preventDefault();
          zoomCanvasIn();
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          zoomCanvasOut();
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          resetCanvasViewport();
          return;
        }
        if (e.key.toLowerCase() === 'f' && !e.shiftKey && e.altKey) {
          e.preventDefault();
          fitCanvasToContent();
          return;
        }
        if (e.key.toLowerCase() === 'f' && e.shiftKey && e.altKey) {
          e.preventDefault();
          fitCanvasToSelected();
          return;
        }
      }

      const targetEl = e.target as HTMLElement | null;
      const typingInField =
        targetEl &&
        targetEl !== e.currentTarget &&
        (targetEl.tagName === 'INPUT' ||
          targetEl.tagName === 'TEXTAREA' ||
          targetEl.tagName === 'SELECT' ||
          targetEl.isContentEditable);
      if (typingInField) {
        return;
      }

      if (e.key === 'Escape') {
        const hasSelectedEdges = edges.some((ed) => ed.selected);
        const hasSelectedNodes = nodes.some((n) => n.selected);
        if (hasSelectedEdges || hasSelectedNodes) {
          e.preventDefault();
          if (hasSelectedEdges) clearSelectedEdges();
          if (hasSelectedNodes) {
            setNodes((cur) => cur.map((n) => ({ ...n, selected: false })));
            setKeyboardFocusIndex(-1);
          }
          setLiveRegionMessage('Cleared selection');
          return;
        }
      }

      if (e.key === 'F2') {
        if (!mutationLocked && enterTargetClassId) {
          e.preventDefault();
          setInlineRenameClassId(enterTargetClassId);
          setLiveRegionMessage('Quick rename');
        }
        return;
      }

      const isArrow =
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight';
      if (e.target === e.currentTarget && isArrow) {
        e.preventDefault();
        panCanvasViewportByKey(e.key);
        return;
      }

      if (e.key === 'Enter' && e.target === e.currentTarget) {
        e.preventDefault();
        if (mutationLocked) return;
        const selected = nodes.filter((n) => n.selected);
        if (selected.length !== 1) return;
        const n = selected[0];
        if (n.type === 'class') {
          editClassRequest?.requestEditClass(n.id);
          setLiveRegionMessage('Opened class editor');
        } else if (n.type === 'group') {
          canvasGroup?.openGroupEditor(n.id);
          setLiveRegionMessage('Opened group editor');
        }
        return;
      }

      if (canvasNavigableNodeIds.length === 0) return;
      if (e.key === 'Tab') {
        // Only override default tabbing when the event originates from the canvas
        // container itself, so nested focusable elements (controls, buttons, menus)
        // keep their native tab behaviour.
        if (e.target !== e.currentTarget) {
          return;
        }

        const nextIndex = keyboardFocusIndex + (e.shiftKey ? -1 : 1);

        // Let the browser handle focus movement when navigating past the
        // first/last node so users can tab out of the canvas.
        if (nextIndex < 0 || nextIndex >= canvasNavigableNodeIds.length) {
          return;
        }

        e.preventDefault();
        focusNavigableNodeByIndex(nextIndex, 'tab');
        return;
      }
    },
    [
      canvasNavigableNodeIds,
      focusNavigableNodeByIndex,
      keyboardFocusIndex,
      enterTargetClassId,
      mutationLocked,
      editClassRequest,
      zoomCanvasIn,
      zoomCanvasOut,
      fitCanvasToContent,
      fitCanvasToSelected,
      resetCanvasViewport,
      panCanvasViewportByKey,
      edges,
      clearSelectedEdges,
      nodes,
      setNodes,
      canvasGroup,
    ]
  );

  const screenReaderSummary = useMemo(
    () => `${classes.length} classes, ${groups.length} groups`,
    [classes.length, groups.length]
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
      const cls = classes.find((c) => getStableClassId(c) === classId);
      if (!cls || !groups.some((g) => g.id === groupId)) return;
      let newRel = { x: 0, y: 0 };
      studio.applyChange((draft) => {
        const c = draft.classes.find((x) => getStableClassId(x) === classId);
        const g = draft.groups.find((x) => x.id === groupId);
        if (!c || !g) return;
        const abs = getClassAbsoluteFlowPosition(c, draft.groups as StudioGroup[]);
        const gAbs = getGroupAbsolutePosition(draft.groups as StudioGroup[], groupId);
        newRel = { x: abs.x - gAbs.x, y: abs.y - gAbs.y };
        c.canvas_metadata = {
          ...c.canvas_metadata,
          group: groupId,
          position: newRel,
        };
      });
      const allPositions = classes.map((c) => {
        const id = getStableClassId(c);
        return {
          classId: id,
          position: id === classId ? newRel : (c.canvas_metadata?.position ?? defaultPosition),
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
      if (!groupId || !cls) return;
      const abs = getClassAbsoluteFlowPosition(cls, groups);
      studio.applyChange((draft) => {
        const c = draft.classes.find((x) => getStableClassId(x) === classId);
        if (!c) return;
        const meta = { ...c.canvas_metadata };
        delete meta.group;
        meta.position = { x: abs.x, y: abs.y };
        c.canvas_metadata = meta;
      });
      const allPositions = classes.map((c) => {
        const id = getStableClassId(c);
        return {
          classId: id,
          position: id === classId ? abs : (c.canvas_metadata?.position ?? defaultPosition),
        };
      });
      saveDefaultCanvasLayout(versionId, allPositions);
      setNodeContextMenu(null);
    },
    [studio, groups, classes, versionId]
  );

  const handleBulkAddClassesToGroup = useCallback(
    (classIds: string[], groupId: string) => {
      if (
        !studio?.applyChange ||
        !versionId ||
        mutationLocked ||
        classIds.length === 0
      ) {
        return;
      }
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      const layoutUpdates: { classId: string; position: { x: number; y: number } }[] =
        [];

      studio.applyChange((draft) => {
        const g = draft.groups.find((x) => x.id === groupId);
        if (!g) return;
        const gAbs = getGroupAbsolutePosition(draft.groups as StudioGroup[], groupId);

        for (const classId of classIds) {
          const c = draft.classes.find((x) => getStableClassId(x) === classId);
          if (!c) continue;
          const meta = { ...(c.canvas_metadata ?? {}) };
          const currentGroup = meta.group;
          if (currentGroup === groupId) continue;

          const abs = getClassAbsoluteFlowPosition(c, draft.groups as StudioGroup[]);
          const newRel = { x: abs.x - gAbs.x, y: abs.y - gAbs.y };
          meta.group = groupId;
          meta.position = newRel;
          c.canvas_metadata = meta;
          layoutUpdates.push({ classId, position: newRel });
        }
      });

      if (layoutUpdates.length === 0) return;

      const updatedMap = new Map(layoutUpdates.map((e) => [e.classId, e.position]));
      const allPositions = classes.map((c) => {
        const id = getStableClassId(c);
        return {
          classId: id,
          position:
            updatedMap.get(id) ?? c.canvas_metadata?.position ?? defaultPosition,
        };
      });
      saveDefaultCanvasLayout(versionId, allPositions);
      setLiveRegionMessage(
        `Moved ${layoutUpdates.length} class${layoutUpdates.length === 1 ? '' : 'es'} to group`
      );
    },
    [studio, groups, classes, versionId, mutationLocked]
  );

  const finalizeClassDragAfterDrop = useCallback(
    (classId: string) => {
      if (mutationLocked || !studio?.applyChange || !versionId) return;
      const snap = nodesRef.current;
      const cn = snap.find((n) => n.id === classId && n.type === 'class');
      if (!cn) return;
      const groupIdSet = new Set(groups.map((g) => g.id));
      const groupNodes = snap.filter((n) => n.type === 'group');
      const rects = listGroupHitRects(groups, groupNodes, snap);
      const center = getNodeAbsoluteCenter(cn, snap);
      const target = findInnermostGroupAtPoint(rects, center);
      const current =
        cn.parentId && groupIdSet.has(cn.parentId) ? cn.parentId : null;

      const persistLayout = (pid: string, pos: { x: number; y: number }) => {
        const allPositions = classes.map((c) => {
          const id = getStableClassId(c);
          return {
            classId: id,
            position:
              id === pid ? pos : (c.canvas_metadata?.position ?? defaultPosition),
          };
        });
        saveDefaultCanvasLayout(versionId, allPositions);
      };

      if (target === current) {
        const rel = { x: cn.position.x ?? 0, y: cn.position.y ?? 0 };
        studio.applyChange((draft) => {
          const c = draft.classes.find((x) => getStableClassId(x) === classId);
          if (!c) return;
          c.canvas_metadata = { ...c.canvas_metadata, position: rel };
        });
        persistLayout(classId, rel);
        return;
      }

      const abs = getFlowNodeAbsoluteOrigin(cn, snap);
      if (target) {
        const gAbs = getGroupAbsolutePosition(groups, target);
        const rel = { x: abs.x - gAbs.x, y: abs.y - gAbs.y };
        studio.applyChange((draft) => {
          const c = draft.classes.find((x) => getStableClassId(x) === classId);
          if (!c) return;
          c.canvas_metadata = {
            ...c.canvas_metadata,
            group: target,
            position: rel,
          };
        });
        persistLayout(classId, rel);
        setLiveRegionMessage(
          current ? 'Moved class to another group' : 'Moved class into group'
        );
        return;
      }

      studio.applyChange((draft) => {
        const c = draft.classes.find((x) => getStableClassId(x) === classId);
        if (!c) return;
        const meta = { ...c.canvas_metadata };
        delete meta.group;
        meta.position = { x: abs.x, y: abs.y };
        c.canvas_metadata = meta;
      });
      persistLayout(classId, { x: abs.x, y: abs.y });
      if (current) setLiveRegionMessage('Removed class from group');
    },
    [mutationLocked, studio, versionId, classes, groups, setLiveRegionMessage]
  );

  useEffect(() => {
    finalizeClassDragRef.current = finalizeClassDragAfterDrop;
  }, [finalizeClassDragAfterDrop]);

  const handleCreateGroupFromSelection = useCallback(() => {
    if (!studio?.applyChange || !versionId || mutationLocked) return;
    if (selectedClassNodeIds.length === 0) return;
    const snap = nodesRef.current;
    const classNodes = snap.filter(
      (n) => n.type === 'class' && selectedClassNodeIds.includes(n.id)
    );
    const b = getAbsoluteBoundsForClassNodes(classNodes, snap);
    if (!b) return;
    const layout = newGroupLayoutFromSelectionBounds(b);
    const id = generateGroupId();
    const layoutUpdates: { classId: string; position: { x: number; y: number } }[] =
      [];
    studio.applyChange((draft) => {
      draft.groups.push({
        id,
        name: 'New group',
        metadata: {
          position: layout.position,
          dimensions: layout.dimensions,
          style: {},
        },
      });
      const gAbs = getGroupAbsolutePosition(draft.groups as StudioGroup[], id);
      for (const classId of selectedClassNodeIds) {
        const c = draft.classes.find((x) => getStableClassId(x) === classId);
        if (!c) continue;
        const abs = getClassAbsoluteFlowPosition(c, draft.groups as StudioGroup[]);
        const rel = { x: abs.x - gAbs.x, y: abs.y - gAbs.y };
        c.canvas_metadata = { ...c.canvas_metadata, group: id, position: rel };
        layoutUpdates.push({ classId, position: rel });
      }
    });
    if (layoutUpdates.length === 0) return;
    const uMap = new Map(layoutUpdates.map((e) => [e.classId, e.position]));
    const allPositions = classes.map((c) => {
      const cid = getStableClassId(c);
      return {
        classId: cid,
        position: uMap.get(cid) ?? c.canvas_metadata?.position ?? defaultPosition,
      };
    });
    saveDefaultCanvasLayout(versionId, allPositions);
    setLiveRegionMessage('Created group from selection');
  }, [
    studio,
    versionId,
    mutationLocked,
    selectedClassNodeIds,
    classes,
    setLiveRegionMessage,
  ]);

  const handleCreateGroupFromTag = useCallback(
    (tagName: string) => {
      if (!studio?.applyChange || !versionId || mutationLocked) return;
      const ids = getClassIdsWithTag(classes, tagName);
      if (ids.length === 0) return;
      const snap = nodesRef.current;
      const classNodes = snap.filter(
        (n) => n.type === 'class' && ids.includes(n.id)
      );
      const b = getAbsoluteBoundsForClassNodes(classNodes, snap);
      if (!b) return;
      const layout = newGroupLayoutFromSelectionBounds(b);
      const id = generateGroupId();
      const layoutUpdates: { classId: string; position: { x: number; y: number } }[] =
        [];
      studio.applyChange((draft) => {
        const tagLabel = tagName.trim();
        draft.groups.push({
          id,
          name: `Tag: ${tagLabel}`,
          metadata: {
            position: layout.position,
            dimensions: layout.dimensions,
            style: {},
            governanceTag: tagLabel,
          },
        });
        const gAbs = getGroupAbsolutePosition(draft.groups as StudioGroup[], id);
        for (const classId of ids) {
          const c = draft.classes.find((x) => getStableClassId(x) === classId);
          if (!c) continue;
          const abs = getClassAbsoluteFlowPosition(c, draft.groups as StudioGroup[]);
          const rel = { x: abs.x - gAbs.x, y: abs.y - gAbs.y };
          c.canvas_metadata = { ...c.canvas_metadata, group: id, position: rel };
          layoutUpdates.push({ classId, position: rel });
        }
      });
      const uMap = new Map(layoutUpdates.map((e) => [e.classId, e.position]));
      const allPositions = classes.map((c) => {
        const cid = getStableClassId(c);
        return {
          classId: cid,
          position: uMap.get(cid) ?? c.canvas_metadata?.position ?? defaultPosition,
        };
      });
      saveDefaultCanvasLayout(versionId, allPositions);
      setLiveRegionMessage(`Created group for tag ${tagName.trim()}`);
    },
    [studio, versionId, mutationLocked, classes, setLiveRegionMessage]
  );

  const handleBulkRemoveFromGroup = useCallback(
    (classIds: string[]) => {
      if (!studio?.applyChange || !versionId || mutationLocked || classIds.length === 0)
        return;
      const updates = new Map<string, { x: number; y: number }>();
      studio.applyChange((draft) => {
        for (const classId of classIds) {
          const c = draft.classes.find((x) => getStableClassId(x) === classId);
          if (!c?.canvas_metadata?.group) continue;
          const abs = getClassAbsoluteFlowPosition(c, draft.groups as StudioGroup[]);
          const meta = { ...c.canvas_metadata };
          delete meta.group;
          meta.position = abs;
          c.canvas_metadata = meta;
          updates.set(classId, abs);
        }
      });
      if (updates.size === 0) return;
      const allPositions = classes.map((c) => {
        const id = getStableClassId(c);
        return {
          classId: id,
          position: updates.get(id) ?? c.canvas_metadata?.position ?? defaultPosition,
        };
      });
      saveDefaultCanvasLayout(versionId, allPositions);
      setLiveRegionMessage(
        `Removed ${updates.size} class${updates.size === 1 ? '' : 'es'} from group`
      );
    },
    [studio, classes, versionId, mutationLocked, setLiveRegionMessage]
  );

  const applyClassIdSelection = useCallback(
    (ids: Set<string>) => {
      setNodes((cur) =>
        cur.map((n) => ({
          ...n,
          selected: n.type === 'class' && ids.has(n.id),
        }))
      );
    },
    [setNodes]
  );

  const handleSelectAllVisibleClasses = useCallback(() => {
    applyClassIdSelection(new Set(visibleFlowClassIds));
    const c = visibleFlowClassIds.length;
    setLiveRegionMessage(
      c === 0
        ? 'No visible classes to select'
        : `Selected ${c} class${c === 1 ? '' : 'es'}`
    );
  }, [applyClassIdSelection, visibleFlowClassIds]);

  const handleSelectVisibleByGroup = useCallback(
    (gid: string) => {
      const ids = filterVisibleClassIdsByGroup(visibleFlowClassIds, classToGroup, gid);
      applyClassIdSelection(new Set(ids));
      setLiveRegionMessage(
        ids.length === 0
          ? 'No classes in that group in the current view'
          : `Selected ${ids.length} class${ids.length === 1 ? '' : 'es'} in group`
      );
    },
    [applyClassIdSelection, visibleFlowClassIds, classToGroup]
  );

  const handleSelectVisibleByTag = useCallback(
    (tagName: string) => {
      const ids = filterVisibleClassIdsByTag(visibleFlowClassIdSet, classes, tagName);
      applyClassIdSelection(new Set(ids));
      setLiveRegionMessage(
        ids.length === 0
          ? 'No classes with that tag in the current view'
          : `Selected ${ids.length} class${ids.length === 1 ? '' : 'es'} by tag`
      );
    },
    [applyClassIdSelection, visibleFlowClassIdSet, classes]
  );

  const handleClearNodeSelection = useCallback(() => {
    clearSelectedEdges();
    setNodes((cur) => cur.map((n) => ({ ...n, selected: false })));
    setKeyboardFocusIndex(-1);
    setLiveRegionMessage('Cleared selection');
  }, [setNodes, clearSelectedEdges]);

  /** All tag names available in the project (for Add tag submenu). GitHub #103. */
  const availableTagNames = useMemo(() => {
    const set = new Set<string>(Object.keys(tagDefinitions));
    classes.forEach((c) => (c.tags ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [classes, tagDefinitions]);

  const handleAssignTagToClass = useCallback(
    (classId: string, tagName: string) => {
      if (!studio?.applyChange) return;
      const trimmed = tagName.trim();
      if (!trimmed) return;
      studio.applyChange((draft) => {
        const c = draft.classes.find((x) => getStableClassId(x) === classId);
        if (!c) return;
        const tags = [...(c.tags ?? [])];
        if (tags.includes(trimmed)) return;
        tags.push(trimmed);
        c.tags = tags;
      });
      setNodeContextMenu(null);
    },
    [studio]
  );

  const handleRemoveTagFromClass = useCallback(
    (classId: string, tagName: string) => {
      if (!studio?.applyChange) return;
      studio.applyChange((draft) => {
        const c = draft.classes.find((x) => getStableClassId(x) === classId);
        if (!c) return;
        c.tags = (c.tags ?? []).filter((t) => t !== tagName);
      });
      setNodeContextMenu(null);
    },
    [studio]
  );

  const handleNodeContextMenu = useCallback(
    (e: MouseEvent<Element>, node: Node) => {
      e.preventDefault();
      setNodeContextMenu({ node, clientX: e.clientX, clientY: e.clientY });
    },
    []
  );

  /** Delete selected class(es) from canvas: confirm then remove from studio state (GitHub #96). */
  const handleDeleteClassesFromCanvas = useCallback(
    async (classIds: string[]) => {
      if (classIds.length === 0 || !studio?.applyChange) return;
      const validIds = classIds.filter((id) =>
        classes.some((c) => getStableClassId(c) === id)
      );
      if (validIds.length === 0) return;
      if (!dialog?.confirm) return;
      const message =
        validIds.length === 1
          ? (() => {
              const cls = classes.find((c) => getStableClassId(c) === validIds[0]);
              return `Delete class "${cls?.name ?? validIds[0]}"? This action will be reflected when you next save.`;
            })()
          : `Delete ${validIds.length} classes? This action will be reflected when you next save.`;
      const ok = await dialog.confirm({
        title: 'Delete Class' + (validIds.length > 1 ? 'es' : ''),
        message,
        variant: 'danger',
        confirmLabel: 'Delete',
      });
      if (!ok) return;
      const idSet = new Set(validIds);
      studio.applyChange((draft) => {
        draft.classes = draft.classes.filter((c) => !idSet.has(getStableClassId(c)));
      });
      setNodeContextMenu(null);
    },
    [studio, classes, dialog]
  );

  /** Copy selected classes to clipboard (GitHub #97). */
  const handleCopyClasses = useCallback(
    (classIds: string[]) => {
      if (classIds.length === 0) return;
      const toCopy = classIds
        .map((id) => classes.find((c) => getStableClassId(c) === id))
        .filter((c): c is StudioClass => c != null);
      if (toCopy.length === 0) return;
      setCanvasClipboard(
        toCopy.map((cls) => ({
          ...cls,
          properties: (cls.properties ?? []).map((p) => ({
            ...p,
            data: p.data ? JSON.parse(JSON.stringify(p.data)) : undefined,
            property_data: p.property_data
              ? JSON.parse(JSON.stringify(p.property_data))
              : undefined,
          })),
          schema: cls.schema ? JSON.parse(JSON.stringify(cls.schema)) : undefined,
          canvas_metadata: cls.canvas_metadata
            ? { ...cls.canvas_metadata }
            : undefined,
        }))
      );
      setNodeContextMenu(null);
    },
    [classes]
  );

  /** Paste classes from clipboard (GitHub #97). */
  const handlePasteClasses = useCallback(() => {
    if (!canvasClipboard?.length || !studio?.applyChange || mutationLocked) return;
    const existingNames = classes.map((c) => c.name ?? '');
    const newClasses = cloneClassesForPaste(
      canvasClipboard,
      existingNames,
      PASTE_OFFSET
    );
    studio.applyChange((draft) => {
      for (const c of newClasses) draft.classes.push(c);
    });
    if (versionId) {
      const existingPositions = classes.map((c) => ({
        classId: getStableClassId(c),
        position: c.canvas_metadata?.position ?? defaultPosition,
      }));
      const newPositions = newClasses.map((c) => ({
        classId: getStableClassId(c),
        position: c.canvas_metadata?.position ?? defaultPosition,
      }));
      saveDefaultCanvasLayout(versionId, [...existingPositions, ...newPositions]);
    }
    setNodeContextMenu(null);
  }, [canvasClipboard, studio, mutationLocked, classes, versionId]);

  /** Duplicate selected classes (copy then paste) (GitHub #97). */
  const handleDuplicateClasses = useCallback(
    (classIds: string[]) => {
      if (classIds.length === 0 || !studio?.applyChange || mutationLocked) return;
      const toCopy = classIds
        .map((id) => classes.find((c) => getStableClassId(c) === id))
        .filter((c): c is StudioClass => c != null);
      if (toCopy.length === 0) return;
      const existingNames = classes.map((c) => c.name ?? '');
      const newClasses = cloneClassesForPaste(
        toCopy,
        existingNames,
        PASTE_OFFSET
      );
      studio.applyChange((draft) => {
        for (const c of newClasses) draft.classes.push(c);
      });
      if (versionId) {
        const existingPositions = classes.map((c) => ({
          classId: getStableClassId(c),
          position: c.canvas_metadata?.position ?? defaultPosition,
        }));
        const newPositions = newClasses.map((c) => ({
          classId: getStableClassId(c),
          position: c.canvas_metadata?.position ?? defaultPosition,
        }));
        saveDefaultCanvasLayout(versionId, [...existingPositions, ...newPositions]);
      }
      setCanvasClipboard(toCopy);
      setNodeContextMenu(null);
    },
    [studio, classes, mutationLocked, versionId]
  );

  const handleExportSelectionJson = useCallback(() => {
    if (selectedClassNodeIds.length === 0) return;
    const idSet = new Set(selectedClassNodeIds);
    const toExport = classes
      .filter((c) => idSet.has(getStableClassId(c)))
      .map((cls) => ({
        ...cls,
        properties: (cls.properties ?? []).map((p) => ({
          ...p,
          data: p.data ? JSON.parse(JSON.stringify(p.data)) : undefined,
          property_data: p.property_data
            ? JSON.parse(JSON.stringify(p.property_data))
            : undefined,
        })),
        schema: cls.schema ? JSON.parse(JSON.stringify(cls.schema)) : undefined,
        canvas_metadata: cls.canvas_metadata
          ? { ...cls.canvas_metadata }
          : undefined,
      }));
    const blob = new Blob([JSON.stringify(toExport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'canvas-selection.json';
    a.click();
    URL.revokeObjectURL(url);
    setLiveRegionMessage('Exported selection as JSON');
  }, [selectedClassNodeIds, classes]);

  const handleExportSelectionImage = useCallback(async () => {
    if (
      selectedClassNodeIds.length === 0 ||
      !canvasExport?.imageExportApi?.exportAsPng
    ) {
      return;
    }
    fitCanvasToSelected();
    const wait = animateViewport ? 280 : 0;
    await new Promise((r) => setTimeout(r, wait));
    await canvasExport.imageExportApi.exportAsPng();
    setLiveRegionMessage('Exported selection as PNG');
  }, [
    selectedClassNodeIds,
    canvasExport,
    fitCanvasToSelected,
    animateViewport,
  ]);

  // Delete/Backspace: delete selected class nodes from canvas (GitHub #96).
  useEffect(() => {
    if (mutationLocked) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      // Scope deletion hotkey to the React Flow canvas container to avoid
      // deleting classes while interacting with other UI elements.
      if (!target) {
        return;
      }
      const isInsideReactFlow = !!target.closest('.react-flow');
      if (!isInsideReactFlow) {
        return;
      }
      if (selectedClassNodeIds.length === 0) return;
      e.preventDefault();
      void handleDeleteClassesFromCanvas(selectedClassNodeIds);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [mutationLocked, selectedClassNodeIds, handleDeleteClassesFromCanvas]);

  // Ctrl+C / Ctrl+V / Ctrl+D: copy, paste, duplicate (GitHub #97).
  useEffect(() => {
    // Copy remains available in read-only mode; only mutating shortcuts are blocked.
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCopy = e.key.toLowerCase() === 'c' && (e.metaKey || e.ctrlKey);
      const isPaste = e.key.toLowerCase() === 'v' && (e.metaKey || e.ctrlKey);
      const isDuplicate = e.key.toLowerCase() === 'd' && (e.metaKey || e.ctrlKey);
      if (!isCopy && !isPaste && !isDuplicate) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!target?.closest('.react-flow')) return;
      if (mutationLocked && !isCopy) return;
      e.preventDefault();
      if (isCopy) {
        if (selectedClassNodeIds.length > 0) handleCopyClasses(selectedClassNodeIds);
      } else if (isPaste) {
        handlePasteClasses();
      } else if (isDuplicate) {
        if (selectedClassNodeIds.length > 0)
          handleDuplicateClasses(selectedClassNodeIds);
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [
    mutationLocked,
    selectedClassNodeIds,
    handleCopyClasses,
    handlePasteClasses,
    handleDuplicateClasses,
  ]);

  const handleLayoutApply = useCallback(
    (layoutedNodes: Node[]) => {
      if (!studio?.applyChange || !versionId) return;
      const positionMap = new Map<string, { x: number; y: number }>();
      const groupLayout = new Map<
        string,
        { position: { x: number; y: number }; width?: number; height?: number }
      >();
      for (const node of layoutedNodes) {
        if (node.type === 'class' && node.position) {
          positionMap.set(node.id, {
            x: node.position.x,
            y: node.position.y,
          });
        }
        if (node.type === 'group' && node.position) {
          const st = node.style as { width?: number; height?: number } | undefined;
          groupLayout.set(node.id, {
            position: { x: node.position.x, y: node.position.y },
            width: typeof st?.width === 'number' ? st.width : undefined,
            height: typeof st?.height === 'number' ? st.height : undefined,
          });
        }
      }
      studio.applyChange((draft) => {
        for (const c of draft.classes) {
          const id = getStableClassId(c);
          const pos = positionMap.get(id);
          if (pos) {
            c.canvas_metadata = {
              ...c.canvas_metadata,
              position: { x: pos.x, y: pos.y },
            };
          }
        }
        for (const g of draft.groups) {
          const gl = groupLayout.get(g.id);
          if (!gl) continue;
          const meta = { ...(g.metadata ?? {}) } as GroupCanvasMetadata;
          meta.position = { ...gl.position };
          if (gl.width != null && gl.height != null) {
            meta.dimensions = {
              ...(meta.dimensions ?? {}),
              width: gl.width,
              height: gl.height,
            };
          }
          g.metadata = meta as Record<string, unknown>;
        }
      });
      const allPositions = classes.map((c) => {
        const id = getStableClassId(c);
        const pos =
          positionMap.get(id) ?? c.canvas_metadata?.position ?? defaultPosition;
        return { classId: id, position: pos };
      });
      saveDefaultCanvasLayout(versionId, allPositions);
      const layoutedMap = new Map(layoutedNodes.map((l) => [l.id, l]));
      setNodes((current) =>
        current.map((n) => {
          const updated = layoutedMap.get(n.id);
          return updated
            ? { ...n, position: updated.position, style: updated.style ?? n.style }
            : n;
        })
      );
    },
    [studio, versionId, classes, setNodes]
  );

  const highContrastClass = canvasSettings.highContrastCanvas
    ? '[--class-ref-edge-stroke:rgb(15_23_42)] dark:[--class-ref-edge-stroke:rgb(248_250_252)] [--class-ref-edge-id-stroke:rgb(99_102_241)] dark:[--class-ref-edge-id-stroke:rgb(165_180_252)] [--class-ref-edge-broken-stroke:rgb(220_38_38)] dark:[--class-ref-edge-broken-stroke:rgb(248_113_113)]'
    : '[--class-ref-edge-stroke:rgb(100_116_139)] dark:[--class-ref-edge-stroke:rgb(148_163_184)] [--class-ref-edge-id-stroke:rgb(67_56_202)] dark:[--class-ref-edge-id-stroke:rgb(165_180_252)] [--class-ref-edge-broken-stroke:rgb(185_28_28)] dark:[--class-ref-edge-broken-stroke:rgb(248_113_113)]';

  return (
    <div
      className={`w-full h-full bg-slate-100 dark:bg-slate-950 ${highContrastClass}`}
      role="application"
      aria-label={`Schema design canvas: ${screenReaderSummary}`}
      onKeyDown={handleCanvasKeyDown}
      tabIndex={0}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {screenReaderSummary}. {liveRegionMessage}
      </p>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdgesForFlow}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        onEdgeDoubleClick={handleEdgeDoubleClick}
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
        onInit={(instance) => {
          reactFlowRef.current = instance;
        }}
        viewport={viewportState}
        onViewportChange={onViewportChange}
        onMoveEnd={onMoveEnd}
        fitView={viewportState === undefined}
        nodesDraggable={!mutationLocked}
        nodesConnectable={!mutationLocked}
        elementsSelectable={true}
        panOnDrag={coarsePointer ? true : [1, 2]}
        panOnScroll={canvasSettings.canvasScrollPan}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={!isReducedMotion}
        selectionOnDrag={true}
        selectionKeyCode={null}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        deleteKeyCode={null}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onlyRenderVisibleElements={true}
        ariaLabelConfig={{
          'node.a11yDescription.default': 'Class node',
          'edge.a11yDescription.default': 'Class relationship edge',
        }}
        snapToGrid={canvasSettings.snapToGrid}
        snapGrid={[canvasSettings.gridSize, canvasSettings.gridSize]}
        defaultEdgeOptions={{
          animated: canvasSettings.edgeAnimated && !isReducedMotion,
        }}
        className="bg-slate-50 dark:bg-slate-900/50"
      >
        {(focusFilteredNodes?.length ?? displayNodes.length) >= LARGE_CANVAS_NODE_THRESHOLD && (
          <div className="absolute top-2 right-2 z-[10001] rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200">
            Large diagram detected (
            {focusFilteredNodes?.length ?? displayNodes.length} nodes currently
            visible). Consider using groups, focus mode, or simplified node view.
          </div>
        )}
        <PaneContextMenuRegistration />
        <ZoomToClassRegistration />
        <CanvasSearchMatchBridge
          orderedMatchIds={orderedSearchMatchNodeIds}
          animateViewport={animateViewport}
        />
        <ZoomToGroupRegistration groups={groups} classes={classes} />
        <CanvasExportRegistration />
        <AlignmentGuidesOverlay
          verticalX={alignmentGuides.verticalX}
          horizontalY={alignmentGuides.horizontalY}
        />
        <div className="pointer-events-none absolute top-2 left-2 z-[10001] max-w-[240px] rounded-md border border-slate-200 dark:border-slate-600 bg-white/95 dark:bg-slate-900/95 px-2.5 py-2 text-[10px] leading-snug text-slate-700 dark:text-slate-200 shadow">
          <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
            Edge legend
          </p>
          <ul className="space-y-1 list-none m-0 p-0">
            <li>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                Inheritance
              </span>{' '}
              — open arrow, label «extends» (class{' '}
              <code className="text-[9px]">allOf</code> / $ref)
            </li>
            <li>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                Schema $ref
              </span>{' '}
              — default stroke; dashed = optional / weak link type
            </li>
            <li>
              <span className="font-medium text-indigo-700 dark:text-indigo-300">
                SQL / ID ref
              </span>{' '}
              — when schema mode is SQL: indigo tone and longer dashes vs $ref (
              <code className="text-[9px]">x-ref-storage: id</code>)
            </li>
            <li>
              <span className="font-medium text-red-700 dark:text-red-300">
                Broken ref
              </span>{' '}
              — red dashes; click for details or to fix; double-click opens editor
            </li>
            <li>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                Selected edge
              </span>{' '}
              — detail card and edit actions; Esc clears selection
            </li>
            <li>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                Composition
              </span>{' '}
              — thicker line when{' '}
              <code className="text-[9px]">x-relationship: composition</code>
            </li>
            <li>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                Selection
              </span>{' '}
              — drag on empty canvas to box-select; Shift/Ctrl/Cmd+click to add
              classes; Space+drag, middle/right mouse, coarse-pointer drag, or scroll-pan
              (in canvas settings) to pan; pinch to zoom on touch
            </li>
            <li>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                Keyboard
              </span>{' '}
              — with the canvas region focused, arrow keys pan; Tab moves focus into
              a node, and arrow keys on the node shell move between nodes; optional
              class list (top-right) syncs selection with the diagram
            </li>
          </ul>
        </div>
        <Panel position="top-right" className="z-[10001] !m-2 !mt-14 max-w-[min(360px,92vw)]">
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <button
              type="button"
              aria-expanded={classListOpen}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() => {
                setClassListOpen((v) => {
                  const next = !v;
                  setLiveRegionMessage(next ? 'Class list shown' : 'Class list hidden');
                  return next;
                });
              }}
            >
              {classListOpen ? 'Hide class list' : 'Show class list'}
            </button>
            {classListOpen ? (
              <CanvasClassListView
                classes={classes}
                selectedClassIds={new Set(selectedClassNodeIds)}
                onSelectClassId={handleSelectClassFromList}
                onAnnounce={setLiveRegionMessage}
              />
            ) : null}
          </div>
        </Panel>
        {layoutQuality && (
          <LayoutHintsOverlay quality={layoutQuality} />
        )}
        {canvasSettings.showDependencyOverlay && (
          <DependencyOverlay
            selectedNodeId={selectedNodeId}
            selectedNodeId2={selectedNodeId2}
            upstreamCount={upstreamCount}
            downstreamCount={downstreamCount}
            pathLength={pathLength}
            circularEdgeCount={circularEdgeIds.size}
            selectedNodeName={selectedNodeName}
            selectedNodeName2={selectedNodeName2}
          />
        )}
        {schemaMetrics && (
          <SchemaMetricsPanel
            depth={schemaMetrics.depth}
            circularEdgeCount={schemaMetrics.circularEdgeCount}
            affectedCount={schemaMetrics.affectedCount}
            controlsVisible={canvasSettings.showControls}
          />
        )}
        {canvasSettings.showBackground && (
          <Background
            variant={gridStyleToBackgroundVariant(canvasSettings.gridStyle)}
            gap={canvasSettings.gridSize}
            size={1}
          />
        )}
        <Panel
          position="bottom-left"
          className={`pointer-events-none z-[10001] ${canvasSettings.showControls ? 'mb-14' : 'mb-2'}`}
        >
          <CanvasSelectionToolbar
            selectedClassIds={selectedClassNodeIds}
            selectedClassesInGroupsCount={selectedClassesInGroupsCount}
            groups={groups}
            availableTagNames={availableTagNames}
            mutationLocked={mutationLocked}
            imageExportAvailable={Boolean(canvasExport?.imageExportApi?.exportAsPng)}
            onSelectAll={handleSelectAllVisibleClasses}
            onSelectByGroup={handleSelectVisibleByGroup}
            onSelectByTag={handleSelectVisibleByTag}
            onClearSelection={handleClearNodeSelection}
            onBulkMoveToGroup={(gid) =>
              handleBulkAddClassesToGroup(selectedClassNodeIds, gid)
            }
            onCreateGroupFromSelection={handleCreateGroupFromSelection}
            onBulkRemoveFromGroup={() =>
              handleBulkRemoveFromGroup(selectedClassNodeIds)
            }
            onCreateGroupFromTag={handleCreateGroupFromTag}
            onBulkDelete={() => void handleDeleteClassesFromCanvas(selectedClassNodeIds)}
            onBulkDuplicate={() => handleDuplicateClasses(selectedClassNodeIds)}
            onBulkExportJson={handleExportSelectionJson}
            onBulkExportImage={() => void handleExportSelectionImage()}
          />
        </Panel>
        {canvasSettings.showControls && (
          <Controls
            position="bottom-left"
            className="!shadow-lg !rounded-lg !border-slate-200 dark:!border-slate-700"
          >
            <ControlButton onClick={fitCanvasToContent} title="Fit to content (Ctrl/Cmd+F)">
              Fit
            </ControlButton>
            <ControlButton
              onClick={fitCanvasToSelected}
              disabled={selectedNodeIds.length === 0}
              title="Fit selected (Ctrl/Cmd+Shift+F)"
            >
              Sel
            </ControlButton>
            <ControlButton onClick={resetCanvasViewport} title="Reset viewport (Ctrl/Cmd+0)">
              1:1
            </ControlButton>
          </Controls>
        )}
        {canvasSettings.showMiniMap && (
          <>
            <MiniMap
              position="bottom-right"
              className="!shadow-lg !rounded-lg !border-slate-200 dark:!border-slate-700 !bg-white dark:!bg-slate-900"
            />
            {canvasSettings.showMiniMapLegend && (
              <div className="pointer-events-none absolute bottom-[10.5rem] right-2 z-[10001] rounded-md border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-200 shadow">
                <p className="font-medium">MiniMap legend</p>
                <p>Groups: container nodes</p>
                <p>Selected: highlighted nodes</p>
              </div>
            )}
          </>
        )}
      </ReactFlow>
      {selectedClassRefEdge && (
        <div
          className={`absolute z-[10001] ${
            canvasSettings.showMiniMap ? 'bottom-28' : 'bottom-2'
          } right-2`}
        >
          <SelectedRefEdgePanel
            edge={selectedClassRefEdge}
            classes={classes}
            schemaMode={schemaMode}
            mutationLocked={mutationLocked}
            onEditProperty={(classId, propertyName) =>
              editClassRequest?.requestEditPropertyForClass(classId, propertyName)
            }
            onEditClass={(classId) => editClassRequest?.requestEditClass(classId)}
            onDismiss={clearSelectedEdges}
          />
        </div>
      )}
      {/* Focus mode indicator banner */}
      {focusState && isFocusModeActive(focusState) && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[10002] flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white text-sm shadow-lg">
          <span>
            Focus mode · {focusState.focusModeDegree}-degree
            {focusState.focusGroupIds.length > 0
              ? focusState.focusGroupIds.length === 1
                ? ' · group'
                : ` · ${focusState.focusGroupIds.length} groups`
              : ''}
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
                {!mutationLocked && (
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
                    const gid = nodeContextMenu.node.id;
                    focusMode?.enterFocusOnGroup(gid);
                    requestAnimationFrame(() => sidebarActions?.zoomToGroup(gid));
                    setNodeContextMenu(null);
                  }}
                >
                  Focus on group
                </button>
                {!mutationLocked && (
                  <>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={async () => {
                        const succeeded = await canvasGroup?.ungroupGroup(nodeContextMenu.node.id);
                        if (
                          succeeded &&
                          focusState?.focusGroupIds?.includes(nodeContextMenu.node.id)
                        ) {
                          focusMode?.exitFocusMode();
                        }
                        setNodeContextMenu(null);
                      }}
                    >
                      Ungroup
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={async () => {
                        const succeeded = await canvasGroup?.archiveGroup(nodeContextMenu.node.id);
                        if (
                          succeeded &&
                          focusState?.focusGroupIds?.includes(nodeContextMenu.node.id)
                        ) {
                          focusMode?.exitFocusMode();
                        }
                        setNodeContextMenu(null);
                      }}
                    >
                      Archive group
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={async () => {
                        const succeeded = await canvasGroup?.deleteGroupAndAllClasses(nodeContextMenu.node.id);
                        if (
                          succeeded &&
                          focusState?.focusGroupIds?.includes(nodeContextMenu.node.id)
                        ) {
                          focusMode?.exitFocusMode();
                        }
                        setNodeContextMenu(null);
                      }}
                    >
                      Delete group and classes…
                    </button>
                  </>
                )}
              </>
            )}
            {nodeContextMenu.node.type === 'brokenRef' && (
              <>
                {!mutationLocked && (
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      const d = nodeContextMenu.node.data as {
                        sourceClassId?: string;
                        propertyName?: string;
                      };
                      if (d.sourceClassId) {
                        editClassRequest?.requestEditPropertyForClass(
                          d.sourceClassId,
                          (d.propertyName ?? '').trim()
                        );
                      }
                      setNodeContextMenu(null);
                    }}
                  >
                    Fix reference…
                  </button>
                )}
              </>
            )}
            {nodeContextMenu.node.type === 'class' && (
              <>
                {!mutationLocked && validClassIds.has(nodeContextMenu.node.id) && (
                  <>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => {
                        editClassRequest?.requestEditClass(nodeContextMenu.node.id);
                        setNodeContextMenu(null);
                      }}
                    >
                      Edit class
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => {
                        setInlineRenameClassId(nodeContextMenu.node.id);
                        setNodeContextMenu(null);
                      }}
                    >
                      Quick rename
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => {
                        handleDuplicateClasses(
                          selectedClassNodeIds.length > 0
                            ? selectedClassNodeIds
                            : [nodeContextMenu.node.id]
                        );
                        setNodeContextMenu(null);
                      }}
                    >
                      Duplicate
                    </button>
                  </>
                )}
                {!mutationLocked &&
                  (nodeContextMenu.node.data as { canvas_metadata?: { group?: string } })
                    .canvas_metadata?.group ? (
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() =>
                      handleRemoveClassFromGroup(nodeContextMenu.node.id)
                    }
                  >
                    Remove from group
                  </button>
                ) : !mutationLocked && groups.length > 0 ? (
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
                ) : !mutationLocked ? (
                  <span className="block px-4 py-2 text-sm text-slate-500 dark:text-slate-400">
                    No groups
                  </span>
                ) : null}
                {!mutationLocked && validClassIds.has(nodeContextMenu.node.id) && (
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      editClassRequest?.requestAddPropertyForClass(nodeContextMenu.node.id);
                      setNodeContextMenu(null);
                    }}
                  >
                    Create reference…
                  </button>
                )}
                {!mutationLocked &&
                  validClassIds.has(nodeContextMenu.node.id) &&
                  (() => {
                    const currentTags =
                      (nodeContextMenu.node.data as { tags?: string[] }).tags ?? [];
                    return (
                      <>
                        {availableTagNames.filter((t) => !currentTags.includes(t)).length >
                          0 && (
                          <>
                            <span className="block px-4 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 mt-1">
                              Add tag
                            </span>
                            {availableTagNames
                              .filter((t) => !currentTags.includes(t))
                              .map((tagName) => (
                                <button
                                  key={tagName}
                                  type="button"
                                  className="w-full px-4 py-2 pl-6 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  onClick={() => {
                                    handleAssignTagToClass(nodeContextMenu.node.id, tagName);
                                  }}
                                >
                                  {tagName}
                                </button>
                              ))}
                          </>
                        )}
                        {currentTags.length > 0 && (
                          <>
                            <span className="block px-4 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 mt-1">
                              Remove tag
                            </span>
                            {currentTags.map((tagName) => (
                              <button
                                key={tagName}
                                type="button"
                                className="w-full px-4 py-2 pl-6 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                onClick={() => {
                                  handleRemoveTagFromClass(nodeContextMenu.node.id, tagName);
                                }}
                              >
                                {tagName}
                              </button>
                            ))}
                          </>
                        )}
                      </>
                    );
                  })()}
                {!mutationLocked && validClassIds.has(nodeContextMenu.node.id) && (
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800 mt-1"
                    onClick={() => {
                      void handleDeleteClassesFromCanvas([nodeContextMenu.node.id]);
                    }}
                  >
                    Delete
                  </button>
                )}
                <span className="block px-4 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 mt-1">
                  More
                </span>
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => {
                    handleCopyClasses(
                      selectedClassNodeIds.length > 0
                        ? selectedClassNodeIds
                        : [nodeContextMenu.node.id]
                    );
                    setNodeContextMenu(null);
                  }}
                >
                  Copy
                </button>
                {!mutationLocked && (
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!canvasClipboard?.length}
                    onClick={() => {
                      handlePasteClasses();
                      setNodeContextMenu(null);
                    }}
                  >
                    Paste
                  </button>
                )}
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
