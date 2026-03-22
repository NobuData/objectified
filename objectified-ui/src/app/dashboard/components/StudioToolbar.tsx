'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Undo2,
  Redo2,
  GitCommit,
  RotateCcw,
  Upload,
  Download,
  GitMerge,
  History,
  Loader2,
  Circle,
  Cloud,
  GitBranchPlus,
  Eye,
  Settings2,
  Group,
  Network,
  FileDown,
  ChevronDown,
  Code2,
  Columns2,
} from 'lucide-react';
import { useCanvasGroupOptional } from '@/app/contexts/CanvasGroupContext';
import { useCanvasLayoutOptional } from '@/app/contexts/CanvasLayoutContext';
import { getRestClientOptions, pullVersion } from '@lib/api/rest-client';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useDialog } from '@/app/components/providers/DialogProvider';
import { useUndoKeyboard, getModifierLabel } from '@lib/studio/useUndoKeyboard';
import { useTenantPermissions } from '@/app/hooks/useTenantPermissions';
import CommitMessageDialog from '@/app/dashboard/components/CommitMessageDialog';
import CanvasSettingsDialog from '@/app/dashboard/components/CanvasSettingsDialog';
import MergeDialog from '@/app/dashboard/components/MergeDialog';
import PushTargetDialog from '@/app/dashboard/components/PushTargetDialog';
import VersionHistoryDialog from '@/app/dashboard/components/VersionHistoryDialog';
import ExportDialog from '@/app/dashboard/components/ExportDialog';
import GenerateCodeDialog from '@/app/dashboard/components/GenerateCodeDialog';
import { useCodeGenerationPanelOptional } from '@/app/contexts/CodeGenerationPanelContext';
import { getSchemaMode, setSchemaModeOnDraft, type SchemaMode } from '@lib/studio/schemaMode';
import * as Select from '@radix-ui/react-select';

const btnBase =
  'p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const btnPrimary =
  'flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium';

const selectTrigger =
  'h-9 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

type ToolbarOperation = 'commit' | 'push' | 'pull' | 'merge';

interface PreCommitValidationSummary {
  errors: string[];
  warnings: string[];
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function buildPreCommitValidationSummary(
  state: (NonNullable<ReturnType<typeof useStudioOptional>>['state']) | null | undefined
): PreCommitValidationSummary {
  if (!state) return { errors: [], warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const classNames = new Map<string, string[]>();

  state.classes.forEach((cls, classIndex) => {
    const className = cls.name?.trim() ?? '';
    if (className.length === 0) {
      errors.push(`Class #${classIndex + 1} is missing a name.`);
    } else {
      const key = normalizeName(className);
      const existing = classNames.get(key) ?? [];
      existing.push(className);
      classNames.set(key, existing);
    }
    cls.properties.forEach((prop, propertyIndex) => {
      if ((prop.name?.trim() ?? '').length === 0) {
        errors.push(
          `Class "${className || `#${classIndex + 1}`}" has a property #${propertyIndex + 1} with no name.`
        );
      }
    });
  });

  for (const [, names] of classNames.entries()) {
    if (names.length > 1) {
      const displayNames = [...new Set(names)].map((n) => `"${n}"`).join(', ');
      warnings.push(`Class names ${displayNames} are duplicates (case-insensitive, ${names.length} occurrences).`);
    }
  }

  return { errors, warnings };
}

function composeCommitMessage(
  message: string | null,
  externalId: string | null
): string | null {
  const cleanMessage = message?.trim() ?? '';
  const cleanExternalId = externalId?.trim() ?? '';
  if (cleanMessage && cleanExternalId) return `${cleanMessage} [external:${cleanExternalId}]`;
  if (cleanMessage) return cleanMessage;
  if (cleanExternalId) return `[external:${cleanExternalId}]`;
  return null;
}

export default function StudioToolbar() {
  const router = useRouter();
  const studio = useStudioOptional();
  const workspace = useWorkspaceOptional();
  const codePreviewPanel = useCodeGenerationPanelOptional();
  const [generateCodeOpen, setGenerateCodeOpen] = useState(false);

  const registerOpenGenerateCodeDialog = codePreviewPanel?.registerOpenGenerateCodeDialog;
  useEffect(() => {
    if (!registerOpenGenerateCodeDialog) return undefined;
    registerOpenGenerateCodeDialog(() => setGenerateCodeOpen(true));
    return () => registerOpenGenerateCodeDialog(null);
  }, [registerOpenGenerateCodeDialog]);
  const canvasGroup = useCanvasGroupOptional();
  const canvasLayout = useCanvasLayoutOptional();
  const { data: session } = useSession();
  const options = useMemo(
    () => getRestClientOptions((session as { accessToken?: string } | null) ?? null),
    [(session as { accessToken?: string } | null)?.accessToken]
  );
  const { confirm } = useDialog();
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSourceVersionId, setMergeSourceVersionId] = useState<string | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [canvasSettingsDialogOpen, setCanvasSettingsDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [activeOperation, setActiveOperation] = useState<ToolbarOperation | null>(null);
  const [requireCommitMessage, setRequireCommitMessage] = useState(false);

  const versionId = studio?.state?.versionId ?? '';
  const tenantId = workspace?.tenant?.id ?? '';
  const projectId = workspace?.project?.id ?? '';
  const isReadOnly =
    studio?.state?.readOnly === true || workspace?.version?.published === true;
  const tenantPerms = useTenantPermissions(tenantId || null);
  const hasSchemaRead = tenantPerms.permissions?.is_tenant_admin || tenantPerms.has('schema:read');
  const hasSchemaWrite = tenantPerms.permissions?.is_tenant_admin || tenantPerms.has('schema:write');
  const canCommitPushMerge = !isReadOnly && !tenantPerms.loading && hasSchemaWrite;
  const canPull = !tenantPerms.loading && (hasSchemaRead || hasSchemaWrite);

  const runWithOperation = useCallback(
    async (operation: ToolbarOperation, action: () => Promise<void>) => {
      setActiveOperation(operation);
      try {
        await action();
      } finally {
        setActiveOperation((current) => (current === operation ? null : current));
      }
    },
    []
  );

  useEffect(() => {
    if (!studio?.state?.versionId || (!options.jwt && !options.apiKey)) return;
    void studio.checkServerForUpdates(options);
  }, [studio?.state?.versionId, studio?.state?.revision, options.jwt, options.apiKey]);

  const performPull = useCallback(async () => {
    if (!versionId || !studio) return;
    await runWithOperation('pull', async () => {
      await studio.loadFromServer(versionId, options, {
        tenantId: tenantId || undefined,
        projectId: projectId || undefined,
      });
    });
  }, [studio, versionId, options, tenantId, projectId, runWithOperation]);

  const handlePull = useCallback(async () => {
    if (!studio) return;
    if (studio.isDirty) {
      const ok = await confirm({
        title: 'Discard local changes?',
        message:
          'You have uncommitted changes. Discarding will replace your local state with the server version. Continue?',
        variant: 'warning',
        confirmLabel: 'Discard and pull',
        cancelLabel: 'Cancel',
      });
      if (!ok) return;
    }
    await performPull();
  }, [studio, confirm, performPull]);

  const handleReset = useCallback(() => {
    void performPull();
  }, [performPull]);

  const handleLoadRevision = useCallback(
    async (revision: number, readOnly: boolean) => {
      if (!studio || !versionId) return;
      if (studio.isDirty && !readOnly) {
        const ok = await confirm({
          title: 'Discard local changes?',
          message:
            'You have uncommitted changes. Loading this revision will replace your local state. Continue?',
          variant: 'warning',
          confirmLabel: 'Discard and load',
          cancelLabel: 'Cancel',
        });
        if (!ok) return;
      }
      if (studio.isDirty && readOnly) {
        const ok = await confirm({
          title: 'Discard local changes?',
          message:
            'You have uncommitted changes. Viewing this revision will replace your local state. Continue?',
          variant: 'warning',
          confirmLabel: 'Discard and view',
          cancelLabel: 'Cancel',
        });
        if (!ok) return;
      }
      await studio.loadFromServer(versionId, options, {
        revision,
        readOnly,
        tenantId: tenantId || undefined,
        projectId: projectId || undefined,
      });
    },
    [studio, versionId, options, tenantId, projectId, confirm]
  );

  const handleCommitWithMessage = useCallback(
    async ({ message, externalId }: { message: string | null; externalId: string | null }) => {
      if (!studio) return;
      const composedMessage = composeCommitMessage(message, externalId);
      await runWithOperation('commit', async () => {
        await studio.save(options, {
          message: composedMessage,
          externalId: externalId?.trim() || null,
        });
      });
    },
    [studio, options, runWithOperation]
  );

  const handlePushToTarget = useCallback(
    async (targetVersionId: string) => {
      if (!studio) return;
      try {
        await runWithOperation('push', async () => {
          await studio.push(targetVersionId, options);
        });
        setPushDialogOpen(false);
      } catch {
        // Error and pushConflict409 set in context; dialog stays open for Pull then Merge suggestion
      }
    },
    [studio, options, runWithOperation]
  );

  const checkTargetServerAhead = useCallback(
    async (targetVersionId: string): Promise<boolean> => {
      const sourceRevision = studio?.state?.revision;
      if (!studio || sourceRevision == null) return false;
      try {
        const res = await pullVersion(targetVersionId, options, undefined, sourceRevision);
        const serverRev = res.revision ?? 0;
        const hasDiff =
          Boolean(res.diff?.added_class_names?.length) ||
          Boolean(res.diff?.removed_class_names?.length) ||
          Boolean(res.diff?.modified_classes?.length);
        return serverRev > sourceRevision || hasDiff;
      } catch (error: unknown) {
        const anyError = error as { status?: number; response?: { status?: number } };
        const status = anyError?.status ?? anyError?.response?.status;

        // If the revision from the source does not exist on the target, treat it as an
        // independent history: fetch the target's current revision without since_revision
        // and compare revisions instead of failing the push flow.
        if (status === 404) {
          try {
            const res = await pullVersion(targetVersionId, options);
            const serverRev = res.revision ?? 0;
            return serverRev > sourceRevision;
          } catch (fallbackError) {
            // If we cannot determine the target revision, log and treat as "not ahead"
            // so we don't block push with an unrelated error.
            // eslint-disable-next-line no-console
            console.error('Failed to check target server revision (fallback).', fallbackError);
            return false;
          }
        }

        // For non-404 errors, log and treat as "not ahead" to avoid blocking the push.
        // eslint-disable-next-line no-console
        console.error('Failed to check if target server is ahead.', error);
        return false;
      }
    },
    [studio, options]
  );

  const pushOverwriteAllowedByPolicy = useMemo(() => {
    const metadata = workspace?.project?.metadata;
    if (!metadata || typeof metadata !== 'object') return false;
    const policy = (metadata as Record<string, unknown>).push_policy;
    if (!policy || typeof policy !== 'object') return false;
    const policyRecord = policy as Record<string, unknown>;
    return (
      policyRecord.allow_overwrite === true ||
      policyRecord.allow_overwrite_on_server_ahead === true
    );
  }, [workspace?.project?.metadata]);

  const handleOverwriteToTarget = useCallback(
    async (targetVersionId: string) => {
      if (!studio) return;
      await runWithOperation('push', async () => {
        await studio.push(targetVersionId, options, {
          message: 'Overwrite push after server-ahead confirmation',
          overwrite: true,
        });
      });
    },
    [studio, options, runWithOperation]
  );

  const openMergeDialog = useCallback((sourceVersionId?: string | null) => {
    setMergeSourceVersionId(sourceVersionId ?? null);
    setMergeDialogOpen(true);
  }, []);

  const handleMergeFromPush = useCallback(
    (sourceVersionId: string) => {
      openMergeDialog(sourceVersionId);
    },
    [openMergeDialog]
  );

  const modLabel = useMemo(() => getModifierLabel(), []);
  const preCommitValidation = useMemo(
    () => buildPreCommitValidationSummary(studio?.state),
    [studio?.state]
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('objectified:studio:commit-message-required');
      setRequireCommitMessage(raw === 'true');
    } catch {
      // Ignore localStorage read failures.
    }
  }, []);
  const updateRequireCommitMessage = useCallback((required: boolean) => {
    setRequireCommitMessage(required);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        'objectified:studio:commit-message-required',
        required ? 'true' : 'false'
      );
    } catch {
      // Ignore localStorage write failures.
    }
  }, []);
  const progressLabel = useMemo(() => {
    if (activeOperation === 'commit') return 'Committing...';
    if (activeOperation === 'push') return 'Pushing...';
    if (activeOperation === 'pull') return 'Pulling...';
    if (activeOperation === 'merge') return 'Merging...';
    return null;
  }, [activeOperation]);

  useUndoKeyboard({
    onUndo: () => {
      if (studio?.canUndo && !studio?.loading) studio.undo();
    },
    onRedo: () => {
      if (studio?.canRedo && !studio?.loading) studio.redo();
    },
    disabled: !studio?.state || studio?.loading || isReadOnly,
  });

  // Auto-close mutating dialogs when entering read-only mode.
  useEffect(() => {
    if (isReadOnly) {
      setCommitDialogOpen(false);
      setPushDialogOpen(false);
      setMergeDialogOpen(false);
    }
  }, [isReadOnly]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const withPrimaryModifier = event.metaKey || event.ctrlKey;
      if (!withPrimaryModifier || event.altKey) return;

      if (event.key.toLowerCase() === 's' && !event.shiftKey) {
        event.preventDefault();
        if (canCommitPushMerge && !studio?.loading) {
          setCommitDialogOpen(true);
        }
        return;
      }

      if (event.key.toLowerCase() === 'p' && event.shiftKey) {
        event.preventDefault();
        if (canCommitPushMerge && !studio?.loading && tenantId && projectId) {
          setPushDialogOpen(true);
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [canCommitPushMerge, studio?.loading, tenantId, projectId]);

  const showGitToolbar = Boolean(studio && studio.state);
  const schemaMode: SchemaMode = studio?.state ? getSchemaMode(studio.state) : 'openapi';

  return (
    <div className="flex items-center gap-2 shrink-0 flex-wrap">
      {showGitToolbar && studio!.error && (
        <span
          className="text-sm text-red-600 dark:text-red-400"
          role="alert"
          title={studio!.error}
        >
          {studio!.error}
        </span>
      )}

      {/* Indicators and git-like buttons — only when a version is loaded */}
      {showGitToolbar && studio!.isDirty && (
        <span
          className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-medium"
          title="Uncommitted local changes"
        >
          <Circle className="h-2 w-2 fill-current" />
          Dirty
        </span>
      )}
      {showGitToolbar && studio!.hasUnpushedCommits && (
        <span
          className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400 text-xs font-medium"
          title="Committed locally but not yet pushed to another version"
        >
          <GitBranchPlus className="h-4 w-4" />
          Unpushed commits
        </span>
      )}
      {showGitToolbar && studio!.serverHasNewChanges && (
        <span
          className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 text-xs font-medium"
          title="Server has new changes"
        >
          <Cloud className="h-4 w-4" />
          Server has new changes
        </span>
      )}
      {showGitToolbar && studio!.state?.readOnly && (
        <span
          className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-medium"
          title={`Viewing revision ${studio!.state?.revision ?? '?'} (read-only)`}
        >
          <Eye className="h-3.5 w-3.5" />
          Revision {studio!.state?.revision ?? '?'} (read-only)
        </span>
      )}
      {showGitToolbar && progressLabel && (
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {progressLabel}
        </span>
      )}
      {showGitToolbar && studio!.lastCommitInfo && (
        <span
          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 max-w-[28rem]"
          title={
            studio!.lastCommitInfo.committedAt
              ? `Last commit at ${studio!.lastCommitInfo.committedAt}`
              : 'Last commit'
          }
        >
          <GitCommit className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            Last commit r{studio!.lastCommitInfo.revision ?? '?'}:{' '}
            {studio!.lastCommitInfo.message ?? 'No message'}
          </span>
        </span>
      )}
      {showGitToolbar && isReadOnly && !studio!.state?.readOnly && (
        <span
          className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-medium"
          title="Published version (read-only)"
        >
          <Eye className="h-3.5 w-3.5" />
          Published (read-only)
        </span>
      )}

      {showGitToolbar && (
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-600" aria-hidden />
      )}
      {showGitToolbar && studio!.state?.readOnly && (
        <button
          type="button"
          onClick={() => {
            void studio!.loadFromServer(versionId, options, {
              tenantId: tenantId || undefined,
              projectId: projectId || undefined,
            });
          }}
          disabled={studio!.loading}
          className={btnPrimary}
          aria-label="Load latest revision to edit"
          title="Load latest revision to edit"
        >
          {studio!.loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Load latest
        </button>
      )}

      {showGitToolbar && (
        <>
      <button
        type="button"
        onClick={studio!.undo}
        disabled={!studio!.canUndo || studio!.loading || isReadOnly}
        className={btnBase}
        aria-label="Undo"
        title={`Undo (${modLabel}+Z)`}
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={studio!.redo}
        disabled={!studio!.canRedo || studio!.loading || isReadOnly}
        className={btnBase}
        aria-label="Redo"
        title={`Redo (${modLabel}+Shift+Z)`}
      >
        <Redo2 className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setCommitDialogOpen(true)}
        disabled={studio!.loading || !canCommitPushMerge}
        className={btnPrimary}
        aria-label="Commit (snapshot to server)"
        title={
          isReadOnly
            ? 'Cannot commit (read-only)'
            : tenantPerms.loading
              ? 'Checking permissions…'
              : !hasSchemaWrite
                ? 'Cannot commit (schema:write permission required)'
                : `Commit local state to server (optional message) (${modLabel}+S)`
        }
      >
        {activeOperation === 'commit' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitCommit className="h-4 w-4" />
        )}
        Commit
      </button>

      <button
        type="button"
        onClick={handleReset}
        disabled={studio!.loading || isReadOnly}
        className={btnBase}
        aria-label="Reset to last committed state"
        title="Discard local changes and reload from server"
      >
        <RotateCcw className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setPushDialogOpen(true)}
        disabled={studio!.loading || !canCommitPushMerge || !tenantId || !projectId}
        className={btnBase}
        aria-label="Push to another version"
        title={
          isReadOnly
            ? 'Cannot push (read-only)'
            : tenantPerms.loading
              ? 'Checking permissions…'
              : !hasSchemaWrite
                ? 'Cannot push (schema:write permission required)'
                : `Push current state to another version (${modLabel}+Shift+P)`
        }
      >
        {activeOperation === 'push' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
      </button>

      <button
        type="button"
        onClick={handlePull}
        disabled={studio!.loading || !canPull}
        className={btnBase}
        aria-label="Pull from server"
        title={
          tenantPerms.loading
            ? 'Checking permissions…'
            : canPull
              ? 'Reload from server'
              : 'Cannot pull (schema:read permission required)'
        }
      >
        {activeOperation === 'pull' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>

      <button
        type="button"
        onClick={() => openMergeDialog(null)}
        disabled={studio!.loading || !canCommitPushMerge || !tenantId || !projectId}
        className={btnBase}
        aria-label="Merge from another version"
        title={
          isReadOnly
            ? 'Cannot merge (read-only)'
            : tenantPerms.loading
              ? 'Checking permissions…'
              : !hasSchemaWrite
                ? 'Cannot merge (schema:write permission required)'
                : 'Merge changes from another version'
        }
      >
        {activeOperation === 'merge' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitMerge className="h-4 w-4" />
        )}
      </button>

      <button
        type="button"
        onClick={() => setHistoryDialogOpen(true)}
        disabled={studio!.loading}
        className={btnBase}
        aria-label="Version history"
        title="View version history (revisions)"
      >
        <History className="h-4 w-4" />
      </button>
        </>
      )}

      {showGitToolbar && (
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-600" aria-hidden />
      )}
      {showGitToolbar && (
        <Select.Root
          value={schemaMode}
          onValueChange={(v) => {
            if (!studio?.applyChange) return;
            if (v !== 'openapi' && v !== 'sql') return;
            studio.applyChange((draft) => {
              setSchemaModeOnDraft(draft, v);
            });
          }}
          disabled={studio?.loading || isReadOnly}
        >
          <Select.Trigger
            className={selectTrigger}
            aria-label="Schema mode"
            title="Schema mode"
          >
            <Select.Value />
            <Select.Icon>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="z-[10010] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
              <Select.Viewport className="p-1">
                <Select.Item
                  value="openapi"
                  className="px-3 py-2 rounded-md text-sm text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800"
                >
                  <Select.ItemText>OpenAPI mode</Select.ItemText>
                </Select.Item>
                <Select.Item
                  value="sql"
                  className="px-3 py-2 rounded-md text-sm text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800"
                >
                  <Select.ItemText>SQL mode</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      )}
      <button
        type="button"
        onClick={() => canvasGroup?.createGroupAtPosition({ x: 150, y: 150 })}
        disabled={!showGitToolbar || isReadOnly}
        className={btnBase}
        aria-label="Create group"
        title="Create a new group on the canvas"
      >
        <Group className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => canvasLayout?.openLayoutPreview()}
        disabled={!showGitToolbar || isReadOnly}
        className={btnBase}
        aria-label="Auto layout"
        title="Preview and apply auto layout (dagre) to class nodes"
      >
        <Network className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setCanvasSettingsDialogOpen(true)}
        className={btnPrimary}
        aria-label="Canvas settings"
        title="Configure canvas (background, controls, minimap, viewport)"
      >
        <Settings2 className="h-4 w-4" />
        Canvas
      </button>
      <button
        type="button"
        onClick={() => setExportDialogOpen(true)}
        className={btnBase}
        aria-label="Export canvas"
        title="Export canvas as image (PNG, SVG, JPEG, PDF) or data (Mermaid, PlantUML, DOT, GraphML, JSON)"
      >
        <FileDown className="h-4 w-4" />
      </button>
      {codePreviewPanel && (
        <button
          type="button"
          onClick={() => codePreviewPanel.togglePanel()}
          className={codePreviewPanel.panelOpen ? btnPrimary : btnBase}
          aria-pressed={codePreviewPanel.panelOpen}
          aria-label="Toggle code preview panel"
          title="Live code preview beside the canvas (refreshes when the schema changes)"
        >
          <Columns2 className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setGenerateCodeOpen(true)}
        className={btnBase}
        aria-label="Generate code"
        title="Generate TypeScript, Prisma, GraphQL, Go, Pydantic, SQL, or custom Mustache from schema"
      >
        <Code2 className="h-4 w-4" />
      </button>

      {showGitToolbar && (
        <>
      <CommitMessageDialog
        open={commitDialogOpen}
        onOpenChange={setCommitDialogOpen}
        onCommit={handleCommitWithMessage}
        loading={studio!.loading}
        suggestedMessage={studio!.suggestedCommitMessage}
        pendingChangesSummary={studio!.pendingChangesSummary}
        validationErrors={preCommitValidation.errors}
        validationWarnings={preCommitValidation.warnings}
        requireMessage={requireCommitMessage}
        onRequireMessageChange={updateRequireCommitMessage}
      />
      <PushTargetDialog
        open={pushDialogOpen}
        onOpenChange={(open) => {
          setPushDialogOpen(open);
          if (!open && studio) studio.clearPushConflict409();
        }}
        tenantId={tenantId}
        projectId={projectId}
        currentVersionId={versionId}
        options={options}
        onPush={handlePushToTarget}
        onCheckServerAhead={checkTargetServerAhead}
        onPull={handlePull}
        onMerge={handleMergeFromPush}
        onOverwrite={handleOverwriteToTarget}
        allowOverwriteOnServerAhead={pushOverwriteAllowedByPolicy}
        loading={studio!.loading}
        pushConflict409={studio!.pushConflict409}
        pushError={studio!.error}
        clearPushConflict409={studio!.clearPushConflict409}
      />
      <MergeDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        versionId={versionId}
        initialSourceVersionId={mergeSourceVersionId}
        options={options}
        tenantId={tenantId}
        projectId={projectId}
        onMergeProgressChange={(inProgress) =>
          setActiveOperation((current) => {
            if (inProgress) return 'merge';
            if (current === 'merge') return null;
            return current;
          })
        }
        onApplied={() => setMergeDialogOpen(false)}
      />
      <VersionHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        versionId={versionId}
        versionName={workspace?.version?.name}
        options={options}
        tenantId={tenantId || undefined}
        projectId={projectId || undefined}
        onLoadRevision={handleLoadRevision}
        onRollbackSuccess={performPull}
        onBranchSuccess={(newVersion) => {
          if (tenantId && projectId) {
            router.push(
              `/data-designer?tenantId=${encodeURIComponent(tenantId)}&projectId=${encodeURIComponent(projectId)}&versionId=${encodeURIComponent(newVersion.id)}`
            );
          }
        }}
        onDeleteSuccess={() => router.push('/dashboard/versions')}
      />
        </>
      )}
      <CanvasSettingsDialog
        open={canvasSettingsDialogOpen}
        onOpenChange={setCanvasSettingsDialogOpen}
      />
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />
      <GenerateCodeDialog open={generateCodeOpen} onOpenChange={setGenerateCodeOpen} />
    </div>
  );
}
