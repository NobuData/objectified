'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  pullVersion,
  listProperties,
  commitVersion,
  pushVersion,
  mergeVersion,
  isConflictError,
  type RestClientOptions,
} from '@lib/api/rest-client';
import type { LocalVersionState } from '@lib/studio/types';
import { getStableClassId } from '@lib/studio/types';
import {
  pullResponseToState,
  stateToCommitPayload,
} from '@lib/studio/stateAdapter';
import {
  backupStorageKey,
  computeStateChecksum,
  saveStateBackup,
  loadStateBackup,
  loadStateBackupWithDiagnostics,
  clearStateBackup,
} from '@lib/studio/stateBackup';
import { getCanvasGroups, saveCanvasGroups } from '@lib/studio/canvasGroupStorage';

// ─── localStorage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'objectified:studio:';

interface PersistedCommitInfo {
  revision: number | null;
  lastCommittedAt: string;
  hasUnpushedCommits: boolean;
}

function commitStorageKey(versionId: string): string {
  return `${STORAGE_KEY_PREFIX}${versionId}:lastCommit`;
}

function loadPersistedCommitInfo(versionId: string): PersistedCommitInfo | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(commitStorageKey(versionId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedCommitInfo;
  } catch {
    return null;
  }
}

function savePersistedCommitInfo(versionId: string, info: PersistedCommitInfo): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(commitStorageKey(versionId), JSON.stringify(info));
  } catch {
    // Ignore localStorage errors (e.g. private browsing quota exceeded)
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function deepClone<T>(x: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(x) as T;
  }
  return JSON.parse(JSON.stringify(x)) as T;
}

export interface StudioMutationAudit {
  addedClassCount: number;
  removedClassCount: number;
  modifiedClassCount: number;
  modifiedGroupCount: number;
  projectPropertiesChanged: boolean;
  canvasMetadataChanged: boolean;
}

const EMPTY_MUTATION_AUDIT: StudioMutationAudit = {
  addedClassCount: 0,
  removedClassCount: 0,
  modifiedClassCount: 0,
  modifiedGroupCount: 0,
  projectPropertiesChanged: false,
  canvasMetadataChanged: false,
};

function isEqualJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pluralize(word: string, count: number): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function computeMutationAudit(
  baseline: LocalVersionState | null,
  current: LocalVersionState | null
): StudioMutationAudit {
  if (!baseline || !current) return EMPTY_MUTATION_AUDIT;

  const baselineClasses = new Map(
    baseline.classes.map((c) => [getStableClassId(c), c])
  );
  const currentClasses = new Map(
    current.classes.map((c) => [getStableClassId(c), c])
  );
  let addedClassCount = 0;
  let removedClassCount = 0;
  let modifiedClassCount = 0;

  for (const [id, cls] of currentClasses.entries()) {
    const before = baselineClasses.get(id);
    if (!before) {
      addedClassCount += 1;
      continue;
    }
    if (!isEqualJson(before, cls)) {
      modifiedClassCount += 1;
    }
  }

  for (const id of baselineClasses.keys()) {
    if (!currentClasses.has(id)) {
      removedClassCount += 1;
    }
  }

  const baselineGroups = new Map(baseline.groups.map((g) => [g.id, g]));
  const currentGroups = new Map(current.groups.map((g) => [g.id, g]));
  let modifiedGroupCount = 0;
  for (const [id, group] of currentGroups.entries()) {
    const before = baselineGroups.get(id);
    if (!before || !isEqualJson(before, group)) {
      modifiedGroupCount += 1;
    }
  }
  for (const id of baselineGroups.keys()) {
    if (!currentGroups.has(id)) {
      modifiedGroupCount += 1;
    }
  }

  return {
    addedClassCount,
    removedClassCount,
    modifiedClassCount,
    modifiedGroupCount,
    projectPropertiesChanged: !isEqualJson(baseline.properties, current.properties),
    canvasMetadataChanged: !isEqualJson(
      baseline.canvas_metadata,
      current.canvas_metadata
    ),
  };
}

function buildPendingChangesSummary(audit: StudioMutationAudit): string | null {
  const parts: string[] = [];
  if (audit.addedClassCount > 0) {
    parts.push(`${pluralize('class', audit.addedClassCount)} added`);
  }
  if (audit.removedClassCount > 0) {
    parts.push(`${pluralize('class', audit.removedClassCount)} removed`);
  }
  if (audit.modifiedClassCount > 0) {
    parts.push(`${pluralize('class', audit.modifiedClassCount)} modified`);
  }
  if (audit.modifiedGroupCount > 0) {
    parts.push(`${pluralize('group', audit.modifiedGroupCount)} modified`);
  }
  if (audit.projectPropertiesChanged) {
    parts.push('project properties modified');
  }
  if (audit.canvasMetadataChanged) {
    parts.push('canvas metadata updated');
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function buildSuggestedCommitMessage(summary: string | null): string | null {
  if (!summary) return null;
  return `Update studio: ${summary}`;
}

export interface StudioContextValue {
  /** Current local version state; null when no version loaded or not yet loaded. */
  state: LocalVersionState | null;
  /** Whether a load or save is in progress. */
  loading: boolean;
  /** Last load or save error message. */
  error: string | null;
  /** Load version from server (pull + optional project properties). Clears undo/redo. */
  loadFromServer: (
    versionId: string,
    options: RestClientOptions,
    opts?: {
      tenantId?: string;
      projectId?: string;
      /** Load a specific revision; when omitted, loads latest. */
      revision?: number;
      /** When true and revision is set, loaded state is read-only (no commit/edit). */
      readOnly?: boolean;
    }
  ) => Promise<void>;
  /** Apply a mutation to state; pushes current state to undo stack and clears redo. */
  applyChange: (updater: (draft: LocalVersionState) => void) => void;
  /** Undo last change. */
  undo: () => void;
  /** Redo last undone change. */
  redo: () => void;
  /** Persist current state to server via commit. Updates revision on success. */
  save: (
    options: RestClientOptions,
    commitOpts?: { message?: string | null; label?: string | null }
  ) => Promise<void>;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Whether there are uncommitted local changes (dirty). */
  isDirty: boolean;
  /** Whether there are commits that have not yet been pushed to another version. */
  hasUnpushedCommits: boolean;
  /** Whether the server has newer changes (after checkServerForUpdates). */
  serverHasNewChanges: boolean;
  /** Check server for updates since current revision; sets serverHasNewChanges. */
  checkServerForUpdates: (options: RestClientOptions) => Promise<void>;
  /** Push current state to another version. */
  push: (
    targetVersionId: string,
    options: RestClientOptions,
    commitOpts?: { message?: string | null }
  ) => Promise<void>;
  /** Merge server changes (e.g. after diverged/conflicts). */
  merge: (options: RestClientOptions, message?: string | null) => Promise<void>;
  /** Clear state and stacks (e.g. when switching version). */
  clear: () => void;
  /** True when last push failed with 409 (target has newer changes); suggest pull then merge. */
  pushConflict409: boolean;
  /** Clear the push 409 suggestion state (e.g. after user dismisses or runs pull/merge). */
  clearPushConflict409: () => void;
  /** Non-fatal warning for backup integrity/version or cross-tab conflicts. */
  backupWarning: string | null;
  /** Clear backup warning after user reviews it. */
  clearBackupWarning: () => void;
  /** In-memory audit of changes since last load/save. */
  mutationAudit: StudioMutationAudit;
  /** Human-readable summary for pending changes in commit UX. */
  pendingChangesSummary: string | null;
  /** Optional suggested commit message based on current mutations. */
  suggestedCommitMessage: string | null;
}

const StudioContext = createContext<StudioContextValue | null>(null);

const MAX_UNDO = 50;

interface StudioStackState {
  state: LocalVersionState | null;
  undoStack: LocalVersionState[];
  redoStack: LocalVersionState[];
}

const initialStack: StudioStackState = {
  state: null,
  undoStack: [],
  redoStack: [],
};

export function StudioProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<StudioStackState>(initialStack);
  const [baselineState, setBaselineState] = useState<LocalVersionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverHasNewChanges, setServerHasNewChanges] = useState(false);
  const [hasUnpushedCommits, setHasUnpushedCommits] = useState(false);
  const [pushConflict409, setPushConflict409] = useState(false);
  const [backupWarning, setBackupWarning] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const tabIdRef = useRef(
    `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );

  const state = stack.state;

  const clearPushConflict409 = useCallback(() => {
    setPushConflict409(false);
  }, []);

  const clearBackupWarning = useCallback(() => {
    setBackupWarning(null);
  }, []);

  const clear = useCallback(() => {
    setStack(initialStack);
    setBaselineState(null);
    setError(null);
    setServerHasNewChanges(false);
    setHasUnpushedCommits(false);
    setPushConflict409(false);
    setBackupWarning(null);
  }, []);

  const loadFromServer = useCallback(
    async (
      versionId: string,
      options: RestClientOptions,
      opts?: {
        tenantId?: string;
        projectId?: string;
        revision?: number;
        readOnly?: boolean;
      }
    ) => {
      const requestId = (loadRequestIdRef.current += 1);
      setLoading(true);
      setError(null);
      setBackupWarning(null);
      setStack(initialStack);
      try {
        const revision = opts?.revision;
        const [pullRes, propertiesList] = await Promise.all([
          pullVersion(versionId, options, revision ?? undefined),
          opts?.tenantId && opts?.projectId
            ? listProperties(opts.tenantId, opts.projectId, options)
            : Promise.resolve([]),
        ]);
        if (requestId !== loadRequestIdRef.current) return;
        const newState = pullResponseToState(pullRes, propertiesList, {
          readOnly: revision != null ? (opts?.readOnly ?? false) : false,
        });
        if (newState.versionId !== versionId) return;
        // Hydrate groups from localStorage (not yet returned by API)
        const storedGroups = getCanvasGroups(versionId);
        if (storedGroups.length > 0) newState.groups = storedGroups;
        setStack({
          state: newState,
          undoStack: [],
          redoStack: [],
        });
        setBaselineState(deepClone(newState));
        // Do not persist read-only revision views to the backup; the backup
        // represents the user's editable working copy, and restoring a
        // read-only state on a failed server load would lock the user out.
        if (!newState.readOnly) {
          saveStateBackup(newState, { sourceTabId: tabIdRef.current });
        }
        setServerHasNewChanges(false);
        setPushConflict409(false);
        // Restore persisted commit info only when the persisted revision matches
        // the revision that was just loaded, to avoid a stale indicator.
        const persisted = loadPersistedCommitInfo(versionId);
        const revisionMatches = typeof persisted?.revision === 'number' && persisted.revision === newState.revision;
        setHasUnpushedCommits(revisionMatches ? (persisted?.hasUnpushedCommits ?? false) : false);
      } catch (e) {
        if (requestId !== loadRequestIdRef.current) return;
        const message = e instanceof Error ? e.message : 'Failed to load version';
        setError(message);
        // Fall back to a locally-saved backup if one exists, so work is not lost
        // on page refresh or when the backend is temporarily unreachable.
        // If no backup exists, initialise with a valid empty state so the UI
        // remains interactive.
        const backup = loadStateBackupWithDiagnostics(versionId);
        if (backup.warning) {
          setBackupWarning(backup.warning);
        }
        setStack({
          state: backup.state ?? {
            versionId,
            revision: null,
            classes: [],
            properties: [],
            canvas_metadata: null,
            groups: [],
          },
          undoStack: [],
          redoStack: [],
        });
        setBaselineState(
          deepClone(
            backup.state ?? {
              versionId,
              revision: null,
              classes: [],
              properties: [],
              canvas_metadata: null,
              groups: [],
            }
          )
        );
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  const applyChange = useCallback((updater: (draft: LocalVersionState) => void) => {
    setStack((prev) => {
      if (!prev.state || prev.state.readOnly) return prev;
      const draft = deepClone(prev.state);
      updater(draft);
      const undoStack = [...prev.undoStack, deepClone(prev.state)];
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      saveStateBackup(draft, { sourceTabId: tabIdRef.current });
      saveCanvasGroups(draft.versionId, draft.groups);
      return {
        state: draft,
        undoStack,
        redoStack: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setStack((prev) => {
      if (prev.undoStack.length === 0) return prev;
      const nextState = prev.undoStack[prev.undoStack.length - 1];
      const redoStack = prev.state ? [...prev.redoStack, prev.state] : prev.redoStack;
      if (nextState) {
        saveStateBackup(nextState, { sourceTabId: tabIdRef.current });
        saveCanvasGroups(nextState.versionId, nextState.groups);
      }
      return {
        state: nextState,
        undoStack: prev.undoStack.slice(0, -1),
        redoStack,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setStack((prev) => {
      if (prev.redoStack.length === 0) return prev;
      const nextState = prev.redoStack[prev.redoStack.length - 1];
      const undoStack = prev.state ? [...prev.undoStack, prev.state] : prev.undoStack;
      if (nextState) {
        saveStateBackup(nextState, { sourceTabId: tabIdRef.current });
        saveCanvasGroups(nextState.versionId, nextState.groups);
      }
      return {
        state: nextState,
        undoStack,
        redoStack: prev.redoStack.slice(0, -1),
      };
    });
  }, []);

  const save = useCallback(
    async (
      options: RestClientOptions,
      commitOpts?: { message?: string | null; label?: string | null }
    ) => {
      const current = state;
      if (!current) {
        setError('No version state to save');
        return;
      }
      if (current.readOnly) {
        setError('Cannot save: viewing a past revision (read-only). Load latest to edit.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload = stateToCommitPayload(current, {
          message: commitOpts?.message ?? null,
          label: commitOpts?.label ?? 'save',
        });
        const res = await commitVersion(current.versionId, payload, options);
        setStack((s) =>
          s.state
            ? {
                ...s,
                state: { ...s.state, revision: res.revision },
                undoStack: [],
                redoStack: [],
              }
            : s
        );
        setBaselineState({
          ...deepClone(current),
          revision: res.revision,
        });
        saveStateBackup(
          { ...current, revision: res.revision },
          { sourceTabId: tabIdRef.current }
        );
        setServerHasNewChanges(false);
        setHasUnpushedCommits(true);
        savePersistedCommitInfo(current.versionId, {
          revision: res.revision,
          lastCommittedAt: res.committed_at,
          hasUnpushedCommits: true,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save');
      } finally {
        setLoading(false);
      }
    },
    [state]
  );

  const checkServerForUpdates = useCallback(
    async (options: RestClientOptions) => {
      const current = state;
      if (!current || current.revision == null) return;
      try {
        const res = await pullVersion(
          current.versionId,
          options,
          undefined,
          current.revision
        );
        const serverRev = res.revision ?? 0;
        const hasDiff =
          res.diff &&
          (res.diff.added_class_names?.length ||
            res.diff.removed_class_names?.length ||
            (res.diff.modified_classes?.length ?? 0));
        if (serverRev > current.revision || hasDiff) {
          setServerHasNewChanges(true);
        } else {
          setServerHasNewChanges(false);
        }
      } catch {
        // Ignore errors (e.g. network); leave serverHasNewChanges unchanged
      }
    },
    [state]
  );

  const push = useCallback(
    async (
      targetVersionId: string,
      options: RestClientOptions,
      commitOpts?: { message?: string | null }
    ) => {
      const current = state;
      if (!current) {
        setError('No version state to push');
        return;
      }
      if (current.readOnly) {
        setError('Cannot push: viewing a past revision (read-only). Load latest to edit.');
        return;
      }
      setLoading(true);
      setError(null);
      setPushConflict409(false);
      try {
        const payload = stateToCommitPayload(current, {
          message: commitOpts?.message ?? null,
          label: 'push',
        });
        await pushVersion(current.versionId, targetVersionId, payload, options);
        clearStateBackup(current.versionId);
        setServerHasNewChanges(false);
        setHasUnpushedCommits(false);
        // Only flip hasUnpushedCommits; leave revision/lastCommittedAt unchanged
        // since push updates the target version, not the source.
        const existingInfo = loadPersistedCommitInfo(current.versionId);
        if (existingInfo) {
          savePersistedCommitInfo(current.versionId, {
            ...existingInfo,
            hasUnpushedCommits: false,
          });
        }
      } catch (e) {
        setPushConflict409(isConflictError(e));
        setError(e instanceof Error ? e.message : 'Failed to push');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [state]
  );

  const merge = useCallback(
    async (options: RestClientOptions, message?: string | null) => {
      const current = state;
      if (!current) {
        setError('No version state to merge');
        return;
      }
      if (current.readOnly) {
        setError('Cannot merge: viewing a past revision (read-only). Load latest to edit.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await mergeVersion(
          current.versionId,
          {
            strategy: 'override',
            message: message ?? null,
            source_version_id: current.versionId,
          },
          options
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to merge');
        setLoading(false);
        return;
      }
      setPushConflict409(false);
      // Reload from server to pick up the merged state
      await loadFromServer(current.versionId, options);
    },
    [state, loadFromServer]
  );

  const canUndo = stack.undoStack.length > 0;
  const canRedo = stack.redoStack.length > 0;
  const isDirty = stack.undoStack.length > 0;
  const mutationAudit = useMemo(
    () => computeMutationAudit(baselineState, state),
    [baselineState, state]
  );
  const pendingChangesSummary = useMemo(
    () => buildPendingChangesSummary(mutationAudit),
    [mutationAudit]
  );
  const suggestedCommitMessage = useMemo(
    () => buildSuggestedCommitMessage(pendingChangesSummary),
    [pendingChangesSummary]
  );

  // Refs to track latest checksum and isDirty without re-registering the storage listener.
  const checksumRef = useRef<string | null>(null);
  const isDirtyRef = useRef(isDirty);
  checksumRef.current = state?.versionId ? computeStateChecksum(state) : null;
  isDirtyRef.current = isDirty;

  // Re-register only when versionId or readOnly changes (not on every local edit).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const versionId = state?.versionId;
    if (!versionId || state?.readOnly) return;

    const backupKey = backupStorageKey(versionId);

    const onStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      if (event.key !== backupKey || event.newValue == null) return;
      const incoming = loadStateBackup(versionId);
      if (!incoming) {
        setBackupWarning(
          'Another Studio tab changed this version, but the shared backup was invalid or missing.'
        );
        return;
      }
      const incomingChecksum = computeStateChecksum(incoming);
      if (incomingChecksum === checksumRef.current) return;
      setBackupWarning(
        isDirtyRef.current
          ? 'Another Studio tab updated this version while you have local edits. Review before pushing.'
          : 'Another Studio tab updated this version. Reload to sync the latest backup.'
      );
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.versionId, state?.readOnly]);

  const value = useMemo<StudioContextValue>(
    () => ({
      state,
      loading,
      error,
      loadFromServer,
      applyChange,
      undo,
      redo,
      save,
      canUndo,
      canRedo,
      isDirty,
      hasUnpushedCommits,
      serverHasNewChanges,
      checkServerForUpdates,
      push,
      merge,
      clear,
      pushConflict409,
      clearPushConflict409,
      backupWarning,
      clearBackupWarning,
      mutationAudit,
      pendingChangesSummary,
      suggestedCommitMessage,
    }),
    [
      state,
      loading,
      error,
      loadFromServer,
      applyChange,
      undo,
      redo,
      save,
      canUndo,
      canRedo,
      isDirty,
      hasUnpushedCommits,
      serverHasNewChanges,
      checkServerForUpdates,
      push,
      merge,
      clear,
      pushConflict409,
      clearPushConflict409,
      backupWarning,
      clearBackupWarning,
      mutationAudit,
      pendingChangesSummary,
      suggestedCommitMessage,
    ]
  );

  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  );
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudio must be used within StudioProvider');
  }
  return ctx;
}

export function useStudioOptional(): StudioContextValue | null {
  return useContext(StudioContext);
}
