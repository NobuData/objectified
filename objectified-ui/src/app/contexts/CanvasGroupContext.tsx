'use client';

/**
 * Context for canvas group actions: create group at position, open group editor.
 * Reference: GitHub #83 — Add ability to create groups in the react-flow canvas.
 * Reference: GitHub #84 — Deletion of groups in the UI (delete all classes in group with confirm).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useDialog } from '@/app/components/providers/DialogProvider';
import { generateGroupId } from '@lib/studio/types';
import type { GroupCanvasMetadata } from '@lib/studio/canvasGroupStorage';
import { getGroupAbsolutePosition } from '@lib/studio/canvasGroupLayout';
import GroupDialog, {
  type GroupDialogSavePayload,
} from '@/app/dashboard/components/GroupDialog';

/** Minimal event shape we need; avoids React Flow event type mismatch. */
export interface PaneContextMenuEvent {
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
}

export type PaneContextMenuHandler = (event: PaneContextMenuEvent) => void;

export interface CanvasGroupContextValue {
  /** Create a new group at the given flow position. */
  createGroupAtPosition: (position: { x: number; y: number }) => void;
  /** Currently editing group id (for GroupDialog). */
  editGroupId: string | null;
  /** Open the group editor for the given group. */
  openGroupEditor: (groupId: string) => void;
  /** Close the group editor. */
  closeGroupEditor: () => void;
  /** Delete a group and all classes in it (after confirm). */
  deleteGroup: (groupId: string) => Promise<void>;
  /** Handler for pane right-click (set by a child of ReactFlow that has useReactFlow). */
  paneContextMenuHandler: PaneContextMenuHandler | null;
  /** Register the pane context menu handler (called from inside ReactFlow). */
  registerPaneContextMenuHandler: (handler: PaneContextMenuHandler | null) => void;
}

const CanvasGroupContext = createContext<CanvasGroupContextValue | null>(null);

export function useCanvasGroupOptional(): CanvasGroupContextValue | null {
  return useContext(CanvasGroupContext);
}

export function CanvasGroupProvider({ children }: { children: ReactNode }) {
  const studio = useStudioOptional();
  const { confirm, alert } = useDialog();
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [paneContextMenuHandler, setPaneContextMenuHandler] = useState<PaneContextMenuHandler | null>(null);

  const createGroupAtPosition = useCallback(
    (position: { x: number; y: number }) => {
      if (!studio?.applyChange) return;
      const id = generateGroupId();
      studio.applyChange((draft) => {
        draft.groups.push({
          id,
          name: 'New group',
          metadata: {
            position: { x: position.x, y: position.y },
            dimensions: { width: 280, height: 160 },
            style: {},
          },
        });
      });
    },
    [studio]
  );

  const openGroupEditor = useCallback((groupId: string) => {
    setEditGroupId(groupId);
  }, []);

  const closeGroupEditor = useCallback(() => {
    setEditGroupId(null);
  }, []);

  const editGroup = useMemo(() => {
    if (!editGroupId || !studio?.state) return null;
    return studio.state.groups.find((g) => g.id === editGroupId) ?? null;
  }, [editGroupId, studio?.state?.groups]);

  const handleGroupSave = useCallback(
    (payload: GroupDialogSavePayload) => {
      if (!editGroupId || !studio?.applyChange) return;
      studio.applyChange((draft) => {
        const g = draft.groups.find((x) => x.id === editGroupId);
        if (!g) return;
        g.name = payload.name;
        const prevMeta = (g.metadata ?? {}) as GroupCanvasMetadata;
        const meta: GroupCanvasMetadata = {
          ...prevMeta,
          style: payload.style,
        };
        if (payload.parentGroupId) meta.parentGroupId = payload.parentGroupId;
        else delete meta.parentGroupId;
        if (payload.description) meta.description = payload.description;
        else delete meta.description;
        if (payload.owner) meta.owner = payload.owner;
        else delete meta.owner;
        if (payload.governanceTag) meta.governanceTag = payload.governanceTag;
        else delete meta.governanceTag;
        g.metadata = meta as Record<string, unknown>;
      });
      setEditGroupId(null);
    },
    [editGroupId, studio]
  );

  /** Delete group and all classes in it; show confirm first. Returns true if deleted, false if cancelled or read-only. */
  const handleDeleteAllClassesInGroup = useCallback(
    async (groupId: string, groupName: string): Promise<boolean> => {
      if (studio?.state?.readOnly) {
        await alert({
          title: 'Read-only',
          message: 'Cannot delete groups while viewing a read-only version.',
          variant: 'warning',
        });
        return false;
      }
      const ok = await confirm({
        title: 'Delete group',
        message: `Delete all classes in group "${groupName}"? This cannot be undone.`,
        variant: 'danger',
        confirmLabel: 'Delete',
      });
      if (!ok || !studio?.applyChange) return false;
      studio.applyChange((draft) => {
        const gAbs = getGroupAbsolutePosition(draft.groups, groupId);
        for (const h of draft.groups) {
          if (h.id === groupId) continue;
          const hm = (h.metadata ?? {}) as GroupCanvasMetadata;
          if (hm.parentGroupId !== groupId) continue;
          const rel = hm.position ?? { x: 0, y: 0 };
          h.metadata = {
            ...h.metadata,
            parentGroupId: undefined,
            position: {
              x: gAbs.x + (rel.x ?? 0),
              y: gAbs.y + (rel.y ?? 0),
            },
          } as Record<string, unknown>;
        }
        draft.groups = draft.groups.filter((g) => g.id !== groupId);
        draft.classes = draft.classes.filter((c) => c.canvas_metadata?.group !== groupId);
      });
      if (editGroupId === groupId) setEditGroupId(null);
      return true;
    },
    [studio, editGroupId, confirm, alert]
  );

  const handleGroupDeleteFromDialog = useCallback(async (): Promise<boolean> => {
    if (!editGroupId || !studio?.state) return false;
    const group = studio.state.groups.find((g) => g.id === editGroupId);
    const groupName = group?.name ?? 'group';
    return handleDeleteAllClassesInGroup(editGroupId, groupName);
  }, [editGroupId, studio?.state, handleDeleteAllClassesInGroup]);

  const deleteGroup = useCallback(
    async (groupId: string): Promise<void> => {
      if (!studio?.state?.groups) return;
      const group = studio.state.groups.find((g) => g.id === groupId);
      const groupName = group?.name ?? 'group';
      await handleDeleteAllClassesInGroup(groupId, groupName);
    },
    [studio?.state?.groups, handleDeleteAllClassesInGroup]
  );

  const registerPaneContextMenuHandler = useCallback((handler: PaneContextMenuHandler | null) => {
    setPaneContextMenuHandler(handler);
  }, []);

  const value: CanvasGroupContextValue = {
    createGroupAtPosition,
    editGroupId,
    openGroupEditor,
    closeGroupEditor,
    deleteGroup,
    paneContextMenuHandler,
    registerPaneContextMenuHandler,
  };

  return (
    <CanvasGroupContext.Provider value={value}>
      {children}
      <GroupDialog
        open={editGroupId !== null}
        group={editGroup}
        allGroups={studio?.state?.groups ?? []}
        onSave={handleGroupSave}
        onDelete={handleGroupDeleteFromDialog}
        onClose={closeGroupEditor}
      />
    </CanvasGroupContext.Provider>
  );
}
