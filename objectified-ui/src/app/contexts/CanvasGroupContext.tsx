'use client';

/**
 * Context for canvas group actions: create group at position, open group editor.
 * Reference: GitHub #83 — Add ability to create groups in the react-flow canvas.
 * Reference: GitHub #84 — Deletion of groups in the UI (delete all classes in group with confirm).
 * Reference: GitHub #239 — Ungroup, archive, delete group only vs delete-all-classes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LocalVersionState } from '@lib/studio/types';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useDialog } from '@/app/components/providers/DialogProvider';
import { generateGroupId, type StudioGroup } from '@lib/studio/types';
import type { GroupCanvasMetadata } from '@lib/studio/canvasGroupStorage';
import {
  getGroupAbsolutePosition,
  getStrictDescendantGroupIds,
} from '@lib/studio/canvasGroupLayout';
import {
  classLayoutEntriesFromDraft,
  detachGroupKeepClasses,
  getDirectMemberClassNames,
} from '@lib/studio/canvasGroupMutations';
import { saveDefaultCanvasLayout } from '@lib/studio/canvasLayout';
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
  /**
   * Delete a group and all classes directly in it (after strong confirmation).
   * Nested child groups are kept and re-parented to the canvas.
   */
  deleteGroupAndAllClasses: (groupId: string) => Promise<void>;
  /** @deprecated Prefer deleteGroupAndAllClasses, ungroupGroup, or archiveGroup. */
  deleteGroup: (groupId: string) => Promise<void>;
  /** Remove the group frame; classes keep absolute positions. */
  ungroupGroup: (groupId: string) => Promise<boolean>;
  /** Hide group (and nested structure) from the canvas; restore from sidebar. */
  archiveGroup: (groupId: string) => Promise<boolean>;
  /** Clear archived flag so the group appears on the canvas again. */
  restoreArchivedGroup: (groupId: string) => Promise<void>;
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
  const readOnly = studio?.state?.readOnly === true;

  const persistClassLayoutFromDraft = useCallback((draft: LocalVersionState, versionId: string) => {
    saveDefaultCanvasLayout(versionId, classLayoutEntriesFromDraft(draft));
  }, []);

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
        const prevParentId = prevMeta.parentGroupId;
        const newParentId = payload.parentGroupId || undefined;
        if (prevParentId !== newParentId) {
          const absPos = getGroupAbsolutePosition(draft.groups as StudioGroup[], editGroupId);
          if (newParentId) {
            const parentAbsPos = getGroupAbsolutePosition(draft.groups as StudioGroup[], newParentId);
            meta.position = { x: absPos.x - parentAbsPos.x, y: absPos.y - parentAbsPos.y };
          } else {
            meta.position = absPos;
          }
        }
        if (newParentId) meta.parentGroupId = newParentId;
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

  const ungroupGroup = useCallback(
    async (groupId: string): Promise<boolean> => {
      if (readOnly) {
        await alert({
          title: 'Read-only',
          message: 'Cannot change groups while viewing a read-only version.',
          variant: 'warning',
        });
        return false;
      }
      const state = studio?.state;
      const group = state?.groups.find((g) => g.id === groupId);
      if (!group || !studio?.applyChange || !state) return false;
      const groupName = group.name ?? 'group';
      const ok = await confirm({
        title: 'Ungroup',
        message: `Remove the “${groupName}” frame and keep classes on the canvas at their current positions? Nested groups become top-level. You can undo with the editor undo shortcut.`,
        variant: 'info',
        confirmLabel: 'Ungroup',
      });
      if (!ok) return false;
      const versionId = state.versionId;
      studio.applyChange((draft) => {
        detachGroupKeepClasses(draft, groupId);
        if (versionId) persistClassLayoutFromDraft(draft, versionId);
      });
      if (editGroupId === groupId) setEditGroupId(null);
      return true;
    },
    [readOnly, studio, confirm, alert, editGroupId, persistClassLayoutFromDraft]
  );

  const archiveGroup = useCallback(
    async (groupId: string): Promise<boolean> => {
      if (readOnly) {
        await alert({
          title: 'Read-only',
          message: 'Cannot archive groups while viewing a read-only version.',
          variant: 'warning',
        });
        return false;
      }
      const state = studio?.state;
      const group = state?.groups.find((g) => g.id === groupId);
      if (!group || !studio?.applyChange) return false;
      const groupName = group.name ?? 'group';
      const ok = await confirm({
        title: 'Archive group',
        message: `Archive “${groupName}”? It will be hidden from the canvas with its classes until you restore it from the Groups sidebar.`,
        variant: 'info',
        confirmLabel: 'Archive',
      });
      if (!ok) return false;
      studio.applyChange((draft) => {
        const g = draft.groups.find((x) => x.id === groupId);
        if (!g) return;
        const meta = { ...(g.metadata ?? {}) } as GroupCanvasMetadata;
        meta.archived = true;
        g.metadata = meta as Record<string, unknown>;
      });
      if (editGroupId === groupId) setEditGroupId(null);
      return true;
    },
    [readOnly, studio, confirm, alert, editGroupId]
  );

  const restoreArchivedGroup = useCallback(
    async (groupId: string): Promise<void> => {
      if (readOnly) {
        await alert({
          title: 'Read-only',
          message: 'Cannot restore groups while viewing a read-only version.',
          variant: 'warning',
        });
        return;
      }
      if (!studio?.applyChange) return;
      studio.applyChange((draft) => {
        const g = draft.groups.find((x) => x.id === groupId);
        if (!g) return;
        const meta = { ...(g.metadata ?? {}) } as GroupCanvasMetadata;
        delete meta.archived;
        g.metadata = meta as Record<string, unknown>;
      });
    },
    [readOnly, studio, alert]
  );

  const handleDeleteAllClassesInGroup = useCallback(
    async (groupId: string, groupName: string): Promise<boolean> => {
      if (readOnly) {
        await alert({
          title: 'Read-only',
          message: 'Cannot delete groups while viewing a read-only version.',
          variant: 'warning',
        });
        return false;
      }
      const state = studio?.state;
      if (!state?.classes || !studio?.applyChange) return false;
      const memberNames = getDirectMemberClassNames(state.classes, groupId);
      const nested = [...getStrictDescendantGroupIds(state.groups, groupId)];
      const nestedNote =
        nested.length > 0
          ? ` Nested groups (${nested.length}) stay on the canvas; only direct members are removed.`
          : '';
      const list =
        memberNames.length === 0 ? (
          <p className="text-sm">No classes are directly inside this group.{nestedNote}</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              This permanently deletes the group and removes{' '}
              <strong>{memberNames.length}</strong> class
              {memberNames.length === 1 ? '' : 'es'} from the version:
            </p>
            <ul className="list-disc pl-5 max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-md p-2 bg-slate-50 dark:bg-slate-800/50">
              {memberNames.map((n, i) => (
                <li key={`${i}-${n}`}>{n}</li>
              ))}
            </ul>
            <p className="text-slate-600 dark:text-slate-400">
              You can undo with the editor undo shortcut immediately after.{nestedNote}
            </p>
          </div>
        );
      const ok = await confirm({
        title: 'Delete group and all classes in it',
        message: list,
        variant: 'danger',
        confirmLabel: 'Delete all listed classes',
      });
      if (!ok) return false;
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
    [readOnly, studio, confirm, alert, editGroupId]
  );

  const handleGroupUngroupFromDialog = useCallback(async (): Promise<boolean> => {
    if (!editGroupId) return false;
    return ungroupGroup(editGroupId);
  }, [editGroupId, ungroupGroup]);

  const handleGroupArchiveFromDialog = useCallback(async (): Promise<boolean> => {
    if (!editGroupId) return false;
    return archiveGroup(editGroupId);
  }, [editGroupId, archiveGroup]);

  const handleGroupDeleteFromDialog = useCallback(async (): Promise<boolean> => {
    if (!editGroupId || !studio?.state) return false;
    const group = studio.state.groups.find((g) => g.id === editGroupId);
    const groupName = group?.name ?? 'group';
    return handleDeleteAllClassesInGroup(editGroupId, groupName);
  }, [editGroupId, studio?.state, handleDeleteAllClassesInGroup]);

  const deleteGroupAndAllClasses = useCallback(
    async (groupId: string): Promise<void> => {
      if (!studio?.state?.groups) return;
      const group = studio.state.groups.find((g) => g.id === groupId);
      const groupName = group?.name ?? 'group';
      await handleDeleteAllClassesInGroup(groupId, groupName);
    },
    [studio?.state?.groups, handleDeleteAllClassesInGroup]
  );

  const deleteGroup = deleteGroupAndAllClasses;

  const registerPaneContextMenuHandler = useCallback((handler: PaneContextMenuHandler | null) => {
    setPaneContextMenuHandler(handler);
  }, []);

  const value: CanvasGroupContextValue = {
    createGroupAtPosition,
    editGroupId,
    openGroupEditor,
    closeGroupEditor,
    deleteGroupAndAllClasses,
    deleteGroup,
    ungroupGroup,
    archiveGroup,
    restoreArchivedGroup,
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
        readOnly={readOnly}
        onSave={handleGroupSave}
        onUngroup={handleGroupUngroupFromDialog}
        onArchive={handleGroupArchiveFromDialog}
        onDeleteAllClasses={handleGroupDeleteFromDialog}
        onClose={closeGroupEditor}
      />
    </CanvasGroupContext.Provider>
  );
}
