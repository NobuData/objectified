'use client';

/**
 * Context for canvas group actions: create group at position, open group editor.
 * Reference: GitHub #83 — Add ability to create groups in the react-flow canvas.
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
import { generateGroupId } from '@lib/studio/types';
import GroupDialog from '@/app/dashboard/components/GroupDialog';

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
  /** Delete a group (and move its class nodes out to flow space). */
  deleteGroup: (groupId: string) => void;
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
    (name: string, style: Record<string, string | number>) => {
      if (!editGroupId || !studio?.applyChange) return;
      studio.applyChange((draft) => {
        const g = draft.groups.find((x) => x.id === editGroupId);
        if (g) {
          g.name = name;
          g.metadata = { ...g.metadata, style };
        }
      });
      setEditGroupId(null);
    },
    [editGroupId, studio]
  );

  const handleGroupDeleteFromDialog = useCallback(() => {
    if (!editGroupId || !studio?.applyChange) return;
    studio.applyChange((draft) => {
      const group = draft.groups.find((g) => g.id === editGroupId);
      const groupPos = (group?.metadata as { position?: { x: number; y: number } } | undefined)?.position ?? { x: 0, y: 0 };
      draft.groups = draft.groups.filter((g) => g.id !== editGroupId);
      draft.classes.forEach((c) => {
        if (c.canvas_metadata?.group === editGroupId) {
          const pos = c.canvas_metadata.position ?? { x: 0, y: 0 };
          const meta = { ...c.canvas_metadata };
          delete meta.group;
          meta.position = { x: groupPos.x + pos.x, y: groupPos.y + pos.y };
          c.canvas_metadata = meta;
        }
      });
    });
    setEditGroupId(null);
  }, [editGroupId, studio]);

  const deleteGroup = useCallback(
    (groupId: string) => {
      if (!studio?.applyChange) return;
      studio.applyChange((draft) => {
        const group = draft.groups.find((g) => g.id === groupId);
        const groupPos = (group?.metadata as { position?: { x: number; y: number } } | undefined)?.position ?? { x: 0, y: 0 };
        draft.groups = draft.groups.filter((g) => g.id !== groupId);
        draft.classes.forEach((c) => {
          if (c.canvas_metadata?.group === groupId) {
            const pos = c.canvas_metadata.position ?? { x: 0, y: 0 };
            const meta = { ...c.canvas_metadata };
            delete meta.group;
            meta.position = { x: groupPos.x + pos.x, y: groupPos.y + pos.y };
            c.canvas_metadata = meta;
          }
        });
      });
      if (editGroupId === groupId) setEditGroupId(null);
    },
    [studio, editGroupId]
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
        onSave={handleGroupSave}
        onDelete={handleGroupDeleteFromDialog}
        onClose={closeGroupEditor}
      />
    </CanvasGroupContext.Provider>
  );
}
