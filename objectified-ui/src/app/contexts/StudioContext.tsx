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
  pullVersionWithEtag,
  buildPullEtag,
  listProperties,
  commitVersion,
  pushVersion,
  mergeVersion,
  isConflictError,
  type RestClientOptions,
  type VersionCommitResponse,
} from '@lib/api/rest-client';
import type { LocalVersionState } from '@lib/studio/types';
import { getStableClassId } from '@lib/studio/types';
import {
  pullResponseToState,
  stateToCommitPayload,
} from '@lib/studio/stateAdapter';
import {
  loadPersistedCommitInfo,
  savePersistedCommitInfo,
} from '@lib/studio/commitStorage';
import {
  backupStorageKey,
  computeStateChecksum,
  saveStateBackup,
  loadStateBackup,
  loadStateBackupWithDiagnostics,
  clearStateBackup,
  type BackupLoadResult,
} from '@lib/studio/stateBackup';
import { getCanvasGroups, saveCanvasGroups } from '@lib/studio/canvasGroupStorage';
import { getCanvasSettings } from '@lib/studio/canvasSettings';

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

export type ClassMutationStatus = 'new' | 'modified' | 'unchanged';

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

interface MutationAuditResult {
  audit: StudioMutationAudit;
  classMutationStatusById: Record<string, ClassMutationStatus>;
}

const EMPTY_MUTATION_AUDIT_RESULT: MutationAuditResult = {
  audit: EMPTY_MUTATION_AUDIT,
  classMutationStatusById: {},
};

function computeMutationAuditWithClassStatuses(
  baseline: LocalVersionState | null,
  current: LocalVersionState | null
): MutationAuditResult {
  if (!baseline || !current) return EMPTY_MUTATION_AUDIT_RESULT;

  const baselineClasses = new Map(
    baseline.classes.map((c) => [getStableClassId(c), c])
  );
  const currentClasses = new Map(
    current.classes.map((c) => [getStableClassId(c), c])
  );
  let addedClassCount = 0;
  let removedClassCount = 0;
  let modifiedClassCount = 0;
  let perClassCanvasMetadataChanged = false;
  const classMutationStatusById: Record<string, ClassMutationStatus> = {};

  for (const [id, cls] of currentClasses.entries()) {
    if (!id) continue;
    const before = baselineClasses.get(id);
    if (!before) {
      addedClassCount += 1;
      classMutationStatusById[id] = 'new';
      continue;
    }
    if (!isEqualJson(before, cls)) {
      modifiedClassCount += 1;
      classMutationStatusById[id] = 'modified';
    } else {
      classMutationStatusById[id] = 'unchanged';
    }
    if (!perClassCanvasMetadataChanged && !isEqualJson(before.canvas_metadata, cls.canvas_metadata)) {
      perClassCanvasMetadataChanged = true;
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
    audit: {
      addedClassCount,
      removedClassCount,
      modifiedClassCount,
      modifiedGroupCount,
      projectPropertiesChanged: !isEqualJson(baseline.properties, current.properties),
      canvasMetadataChanged:
        !isEqualJson(baseline.canvas_metadata, current.canvas_metadata) ||
        perClassCanvasMetadataChanged,
    },
    classMutationStatusById,
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
      /**
       * Controls whether a local draft backup should be restored or discarded while
       * loading server state. Used by restore-draft UX after refresh/crash.
       */
      draftBehavior?: 'restore' | 'discard';
      /** Weak ETag from a prior pull (latest only); enables 304 Not Modified. */
      ifNoneMatch?: string;
      /** Called when the server returns 304 (latest pull only). */
      onNotModified?: () => void;
    }
  ) => Promise<
    | { status: 'not_modified' }
    | { status: 'loaded'; revision: number | null }
    | undefined
  >;
  /** Last ETag used for conditional GET /pull (latest); for toolbar pull. */
  peekPullIfNoneMatch: (versionId: string) => string | undefined;
  /** Apply a mutation to state; pushes current state to undo stack and clears redo. */
  applyChange: (updater: (draft: LocalVersionState) => void) => void;
  /** Undo last change. */
  undo: () => void;
  /** Redo last undone change. */
  redo: () => void;
  /** Persist current state to server via commit. Updates revision on success. */
  save: (
    options: RestClientOptions,
    commitOpts?: {
      message?: string | null;
      label?: string | null;
      externalId?: string | null;
    }
  ) => Promise<void>;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Whether there are uncommitted local changes (dirty). */
  isDirty: boolean;
  /** Whether there are commits that have not yet been pushed to another version. */
  hasUnpushedCommits: boolean;
  /** Number of local commits on this version not yet pushed elsewhere (≥1 when hasUnpushedCommits). */
  unpushedCommitCount: number;
  /** ISO time of last successful push to another version, when known. */
  lastPushedAt: string | null;
  /** Highest snapshot revision on the server from the last successful pull (head). */
  serverHeadRevision: number | null;
  /** Whether the server has newer changes (after checkServerForUpdates). */
  serverHasNewChanges: boolean;
  /** Check server for updates since current revision; sets serverHasNewChanges. */
  checkServerForUpdates: (options: RestClientOptions) => Promise<void>;
  /** Push current state to another version. */
  push: (
    targetVersionId: string | string[],
    options: RestClientOptions,
    commitOpts?: { message?: string | null; overwrite?: boolean }
  ) => Promise<VersionCommitResponse[]>;
  /** Merge server changes (e.g. after diverged/conflicts). */
  merge: (options: RestClientOptions, message?: string | null) => Promise<void>;
  /** Clear state and stacks (e.g. when switching version). */
  clear: (opts?: { clearBackup?: boolean }) => void;
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
  /** Per-class mutation status versus loaded baseline, keyed by stable class id. */
  classMutationStatusById: Record<string, ClassMutationStatus>;
  /** Most recent commit details for toolbar/status display. */
  lastCommitInfo: {
    revision: number | null;
    committedAt: string | null;
    message: string | null;
    externalId: string | null;
  } | null;
}

const StudioContext = createContext<StudioContextValue | null>(null);

const DEFAULT_MAX_UNDO = 50;
const UNDO_STACK_SESSION_KEY_PREFIX = 'objectified:studio:undo-stack:v1';

interface StudioStackState {
  state: LocalVersionState | null;
  undoStack: LocalVersionState[];
  redoStack: LocalVersionState[];
}

interface PersistedUndoStackRecord {
  versionId: string;
  savedAt: string;
  baseRevision: number | null;
  state: LocalVersionState;
  undoStack: LocalVersionState[];
  redoStack: LocalVersionState[];
}

const initialStack: StudioStackState = {
  state: null,
  undoStack: [],
  redoStack: [],
};

function getUndoStackStorageKey(versionId: string): string {
  return `${UNDO_STACK_SESSION_KEY_PREFIX}:${versionId}`;
}

function getUndoSettings(): { persistUndoStackInSession: boolean; maxUndoDepth: number } {
  const settings = getCanvasSettings();
  const safeDepth =
    typeof settings.maxUndoDepth === 'number' &&
    Number.isFinite(settings.maxUndoDepth) &&
    settings.maxUndoDepth >= 1
      ? Math.floor(settings.maxUndoDepth)
      : DEFAULT_MAX_UNDO;
  return {
    persistUndoStackInSession: Boolean(settings.persistUndoStackInSession),
    maxUndoDepth: safeDepth,
  };
}

function trimUndoState(
  stack: StudioStackState,
  maxUndoDepth: number
): StudioStackState {
  if (stack.undoStack.length <= maxUndoDepth && stack.redoStack.length <= maxUndoDepth) {
    return stack;
  }
  return {
    state: stack.state,
    undoStack:
      stack.undoStack.length > maxUndoDepth
        ? stack.undoStack.slice(-maxUndoDepth)
        : stack.undoStack,
    redoStack:
      stack.redoStack.length > maxUndoDepth
        ? stack.redoStack.slice(-maxUndoDepth)
        : stack.redoStack,
  };
}

function persistUndoSessionState(stack: StudioStackState): void {
  try {
    if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return;
    const state = stack.state;
    if (!state) return;
    const { persistUndoStackInSession, maxUndoDepth } = getUndoSettings();
    const key = getUndoStackStorageKey(state.versionId);
    if (!persistUndoStackInSession) {
      window.sessionStorage.removeItem(key);
      return;
    }
    const trimmed = trimUndoState(stack, maxUndoDepth);
    const payload: PersistedUndoStackRecord = {
      versionId: state.versionId,
      savedAt: new Date().toISOString(),
      baseRevision: state.revision ?? null,
      state: deepClone(trimmed.state as LocalVersionState),
      undoStack: trimmed.undoStack.map((entry) => deepClone(entry)),
      redoStack: trimmed.redoStack.map((entry) => deepClone(entry)),
    };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore sessionStorage write failures.
  }
}

function readPersistedUndoSessionState(
  versionId: string,
  baseRevision: number | null
): StudioStackState | null {
  try {
    if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return null;
    const { persistUndoStackInSession, maxUndoDepth } = getUndoSettings();
    if (!persistUndoStackInSession) return null;
    const raw = window.sessionStorage.getItem(getUndoStackStorageKey(versionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedUndoStackRecord>;
    if (parsed.versionId !== versionId) return null;
    if ((parsed.baseRevision ?? null) !== (baseRevision ?? null)) return null;
    if (!parsed.state || !Array.isArray(parsed.undoStack) || !Array.isArray(parsed.redoStack)) {
      return null;
    }
    const restored: StudioStackState = {
      state: parsed.state as LocalVersionState,
      undoStack: parsed.undoStack as LocalVersionState[],
      redoStack: parsed.redoStack as LocalVersionState[],
    };
    return trimUndoState(restored, maxUndoDepth);
  } catch {
    return null;
  }
}

function clearPersistedUndoSessionState(versionId: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return;
    window.sessionStorage.removeItem(getUndoStackStorageKey(versionId));
  } catch {
    // Ignore sessionStorage remove failures.
  }
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<StudioStackState>(initialStack);
  const [baselineState, setBaselineState] = useState<LocalVersionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverHasNewChanges, setServerHasNewChanges] = useState(false);
  const [hasUnpushedCommits, setHasUnpushedCommits] = useState(false);
  const [unpushedCommitCount, setUnpushedCommitCount] = useState(0);
  const [lastPushedAt, setLastPushedAt] = useState<string | null>(null);
  const [serverHeadRevision, setServerHeadRevision] = useState<number | null>(null);
  const [pushConflict409, setPushConflict409] = useState(false);
  const [backupWarning, setBackupWarning] = useState<string | null>(null);
  const [lastCommitInfo, setLastCommitInfo] = useState<{
    revision: number | null;
    committedAt: string | null;
    message: string | null;
    externalId: string | null;
  } | null>(null);
  const loadRequestIdRef = useRef(0);
  const pullIfNoneMatchRef = useRef<Map<string, string>>(new Map());
  const tabIdRef = useRef(
    `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );

  const peekPullIfNoneMatch = useCallback((vid: string) => pullIfNoneMatchRef.current.get(vid), []);

  const state = stack.state;

  const clearPushConflict409 = useCallback(() => {
    setPushConflict409(false);
  }, []);

  const clearBackupWarning = useCallback(() => {
    setBackupWarning(null);
  }, []);

  const clear = useCallback((opts?: { clearBackup?: boolean }) => {
    const currentVersionId = stack.state?.versionId ?? null;
    if (currentVersionId) {
      clearPersistedUndoSessionState(currentVersionId);
      pullIfNoneMatchRef.current.delete(currentVersionId);
      if (opts?.clearBackup) {
        clearStateBackup(currentVersionId);
      }
    }
    setStack(initialStack);
    setBaselineState(null);
    setError(null);
    setServerHasNewChanges(false);
    setHasUnpushedCommits(false);
    setUnpushedCommitCount(0);
    setLastPushedAt(null);
    setServerHeadRevision(null);
    setPushConflict409(false);
    setBackupWarning(null);
    setLastCommitInfo(null);
  }, [stack.state?.versionId]);

  const loadFromServer = useCallback(
    async (
      versionId: string,
      options: RestClientOptions,
      opts?: {
        tenantId?: string;
        projectId?: string;
        revision?: number;
        readOnly?: boolean;
        draftBehavior?: 'restore' | 'discard';
        preloadedBackupResult?: BackupLoadResult;
        ifNoneMatch?: string;
        onNotModified?: () => void;
      }
    ) => {
      const requestId = (loadRequestIdRef.current += 1);
      setLoading(true);
      setError(null);
      setBackupWarning(null);
      try {
        const revision = opts?.revision;
        const pullOptions: RestClientOptions = { ...options };
        if (opts?.ifNoneMatch != null && revision == null) {
          pullOptions.ifNoneMatch = opts.ifNoneMatch;
        }
        const pullOutcome = await pullVersionWithEtag(
          versionId,
          pullOptions,
          revision ?? undefined
        );
        if (requestId !== loadRequestIdRef.current) return;
        if (pullOutcome.notModified) {
          if (revision == null && pullOutcome.etag) {
            pullIfNoneMatchRef.current.set(versionId, pullOutcome.etag);
          }
          setServerHasNewChanges(false);
          opts?.onNotModified?.();
          return { status: 'not_modified' as const };
        }
        setStack(initialStack);
        const pullRes = pullOutcome.data;
        const propertiesList =
          opts?.tenantId && opts?.projectId
            ? await listProperties(opts.tenantId, opts.projectId, options)
            : [];
        if (requestId !== loadRequestIdRef.current) return;
        if (revision == null) {
          const etag =
            pullOutcome.etag ??
            buildPullEtag(versionId, pullRes.revision ?? null, undefined, undefined);
          pullIfNoneMatchRef.current.set(versionId, etag);
        }
        const newState = pullResponseToState(pullRes, propertiesList, {
          readOnly: revision != null ? (opts?.readOnly ?? false) : false,
        });
        if (newState.versionId !== versionId) return;
        const headRev: number | null =
          typeof pullRes.latest_revision === 'number'
            ? pullRes.latest_revision
            : revision == null
              ? (newState.revision ?? null)
              : null;
        setServerHeadRevision(headRev);
        // Hydrate groups from localStorage (not yet returned by API)
        const storedGroups = getCanvasGroups(versionId);
        if (storedGroups.length > 0) newState.groups = storedGroups;
        const draftBackup =
          !newState.readOnly
            ? (opts?.preloadedBackupResult ?? loadStateBackupWithDiagnostics(versionId))
            : null;
        if (draftBackup?.warning) {
          setBackupWarning(draftBackup.warning);
        }
        const shouldRestoreDraft =
          !newState.readOnly &&
          opts?.draftBehavior === 'restore' &&
          draftBackup?.state != null;
        if (shouldRestoreDraft && draftBackup?.state) {
          // Mark restored draft as dirty by keeping the server snapshot on the undo stack.
          setStack({
            state: draftBackup.state,
            undoStack: [deepClone(newState)],
            redoStack: [],
          });
          clearPersistedUndoSessionState(versionId);
          setBaselineState(deepClone(newState));
          saveStateBackup(draftBackup.state, { sourceTabId: tabIdRef.current });
        } else {
          if (!newState.readOnly && opts?.draftBehavior === 'discard') {
            clearStateBackup(versionId);
            clearPersistedUndoSessionState(versionId);
          }
          const forceClearUndoOnRevision =
            revision != null && getCanvasSettings().clearUndoStackOnRevisionLoad;
          const restoredStack =
            !forceClearUndoOnRevision &&
            !newState.readOnly &&
            opts?.draftBehavior !== 'discard'
              ? readPersistedUndoSessionState(versionId, newState.revision ?? null)
              : null;
          const nextStack = restoredStack ?? {
            state: newState,
            undoStack: [],
            redoStack: [],
          };
          setStack(nextStack);
          if (!restoredStack) {
            clearPersistedUndoSessionState(versionId);
          }
          setBaselineState(deepClone(newState));
          // Do not persist read-only revision views to the backup; the backup
          // represents the user's editable working copy, and restoring a
          // read-only state on a failed server load would lock the user out.
          if (!newState.readOnly) {
            saveStateBackup(newState, { sourceTabId: tabIdRef.current });
          }
        }
        setServerHasNewChanges(false);
        setPushConflict409(false);
        if (revision != null) {
          const snapMsg =
            pullRes.snapshot_label?.trim() ||
            pullRes.snapshot_description?.trim() ||
            null;
          setHasUnpushedCommits(false);
          setUnpushedCommitCount(0);
          setLastPushedAt(null);
          setLastCommitInfo({
            revision: newState.revision ?? null,
            committedAt: pullRes.snapshot_committed_at ?? null,
            message: snapMsg,
            externalId: null,
          });
        } else {
          // Restore persisted commit info only when the persisted revision matches
          // the revision that was just loaded, to avoid a stale indicator.
          const persisted = loadPersistedCommitInfo(versionId);
          const revisionMatches =
            typeof persisted?.revision === 'number' && persisted.revision === newState.revision;
          const restoredUnpushed = revisionMatches ? (persisted?.hasUnpushedCommits ?? false) : false;
          setHasUnpushedCommits(restoredUnpushed);
          if (revisionMatches && restoredUnpushed) {
            const n = persisted?.commitsSinceLastPush;
            setUnpushedCommitCount(typeof n === 'number' && n > 0 ? n : 1);
          } else {
            setUnpushedCommitCount(0);
          }
          setLastPushedAt(revisionMatches && persisted ? (persisted.lastPushedAt ?? null) : null);
          setLastCommitInfo(
            revisionMatches && persisted
              ? {
                  revision: persisted.revision ?? null,
                  committedAt: persisted.lastCommittedAt ?? null,
                  message: persisted.message ?? null,
                  externalId: persisted.externalId ?? null,
                }
              : null
          );
        }
        return { status: 'loaded' as const, revision: newState.revision ?? null };
      } catch (e) {
        if (requestId !== loadRequestIdRef.current) return;
        const message = e instanceof Error ? e.message : 'Failed to load version';
        setError(message);
        setServerHeadRevision(null);
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
        clearPersistedUndoSessionState(versionId);
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
      const { maxUndoDepth } = getUndoSettings();
      const draft = deepClone(prev.state);
      updater(draft);
      const undoStack = [...prev.undoStack, deepClone(prev.state)];
      if (undoStack.length > maxUndoDepth) undoStack.shift();
      const next: StudioStackState = {
        state: draft,
        undoStack,
        redoStack: [],
      };
      saveStateBackup(draft, { sourceTabId: tabIdRef.current });
      saveCanvasGroups(draft.versionId, draft.groups);
      persistUndoSessionState(next);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setStack((prev) => {
      if (prev.undoStack.length === 0) return prev;
      const { maxUndoDepth } = getUndoSettings();
      const nextState = prev.undoStack[prev.undoStack.length - 1];
      const redoStack = prev.state ? [...prev.redoStack, prev.state] : prev.redoStack;
      if (nextState) {
        saveStateBackup(nextState, { sourceTabId: tabIdRef.current });
        saveCanvasGroups(nextState.versionId, nextState.groups);
      }
      const next = trimUndoState(
        {
        state: nextState,
        undoStack: prev.undoStack.slice(0, -1),
        redoStack,
        },
        maxUndoDepth
      );
      persistUndoSessionState(next);
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setStack((prev) => {
      if (prev.redoStack.length === 0) return prev;
      const { maxUndoDepth } = getUndoSettings();
      const nextState = prev.redoStack[prev.redoStack.length - 1];
      const undoStack = prev.state ? [...prev.undoStack, prev.state] : prev.undoStack;
      if (nextState) {
        saveStateBackup(nextState, { sourceTabId: tabIdRef.current });
        saveCanvasGroups(nextState.versionId, nextState.groups);
      }
      const next = trimUndoState(
        {
        state: nextState,
        undoStack,
        redoStack: prev.redoStack.slice(0, -1),
        },
        maxUndoDepth
      );
      persistUndoSessionState(next);
      return next;
    });
  }, []);

  const save = useCallback(
    async (
      options: RestClientOptions,
      commitOpts?: {
        message?: string | null;
        label?: string | null;
        externalId?: string | null;
      }
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
        clearPersistedUndoSessionState(current.versionId);
        setServerHasNewChanges(false);
        setHasUnpushedCommits(true);
        const priorCommit = loadPersistedCommitInfo(current.versionId);
        const isSameRevision =
          priorCommit != null && priorCommit.revision === current.revision;
        const nextUnpushedCount = isSameRevision
          ? (priorCommit.commitsSinceLastPush ?? 0) + 1
          : 1;
        const lastPushedAt = isSameRevision
          ? priorCommit.lastPushedAt ?? null
          : null;
        setUnpushedCommitCount(nextUnpushedCount);
        savePersistedCommitInfo(current.versionId, {
          revision: res.revision,
          lastCommittedAt: res.committed_at,
          hasUnpushedCommits: true,
          commitsSinceLastPush: nextUnpushedCount,
          lastPushedAt,
          message: commitOpts?.message ?? null,
          externalId: commitOpts?.externalId ?? null,
        });
        pullIfNoneMatchRef.current.set(
          current.versionId,
          buildPullEtag(current.versionId, res.revision, undefined, undefined)
        );
        setLastCommitInfo({
          revision: res.revision,
          committedAt: res.committed_at,
          message: commitOpts?.message ?? null,
          externalId: commitOpts?.externalId ?? null,
        });
        setServerHeadRevision(res.revision);
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
      targetVersionId: string | string[],
      options: RestClientOptions,
      commitOpts?: { message?: string | null; overwrite?: boolean }
    ): Promise<VersionCommitResponse[]> => {
      const current = state;
      if (!current) {
        setError('No version state to push');
        return [];
      }
      if (current.readOnly) {
        setError('Cannot push: viewing a past revision (read-only). Load latest to edit.');
        return [];
      }
      setLoading(true);
      setError(null);
      setPushConflict409(false);
      try {
        const payload = stateToCommitPayload(current, {
          message: commitOpts?.message ?? null,
          label: 'push',
          overwrite: commitOpts?.overwrite,
        });
        const responses = await pushVersion(current.versionId, targetVersionId, payload, options);
        clearStateBackup(current.versionId);
        setServerHasNewChanges(false);
        setHasUnpushedCommits(false);
        setUnpushedCommitCount(0);
        const pushedAt = responses[0]?.committed_at ?? new Date().toISOString();
        setLastPushedAt(pushedAt);
        const existingInfo = loadPersistedCommitInfo(current.versionId);
        savePersistedCommitInfo(current.versionId, {
          revision: existingInfo?.revision ?? current.revision ?? null,
          lastCommittedAt: existingInfo?.lastCommittedAt ?? pushedAt,
          hasUnpushedCommits: false,
          commitsSinceLastPush: 0,
          lastPushedAt: pushedAt,
          message: existingInfo?.message ?? null,
          externalId: existingInfo?.externalId ?? null,
        });
        return responses;
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
  const mutationAuditResult = useMemo(
    () => computeMutationAuditWithClassStatuses(baselineState, state),
    [baselineState, state]
  );
  const mutationAudit = mutationAuditResult.audit;
  const classMutationStatusById = mutationAuditResult.classMutationStatusById;
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
      peekPullIfNoneMatch,
      applyChange,
      undo,
      redo,
      save,
      canUndo,
      canRedo,
      isDirty,
      hasUnpushedCommits,
      unpushedCommitCount,
      lastPushedAt,
      serverHeadRevision,
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
      classMutationStatusById,
      lastCommitInfo,
    }),
    [
      state,
      loading,
      error,
      loadFromServer,
      peekPullIfNoneMatch,
      applyChange,
      undo,
      redo,
      save,
      canUndo,
      canRedo,
      isDirty,
      hasUnpushedCommits,
      unpushedCommitCount,
      lastPushedAt,
      serverHeadRevision,
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
      classMutationStatusById,
      lastCommitInfo,
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
