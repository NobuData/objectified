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
} from 'lucide-react';
import { getRestClientOptions } from '@lib/api/rest-client';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useDialog } from '@/app/components/providers/DialogProvider';
import { useUndoKeyboard, getModifierLabel } from '@lib/studio/useUndoKeyboard';
import CommitMessageDialog from '@/app/dashboard/components/CommitMessageDialog';
import CanvasSettingsDialog from '@/app/dashboard/components/CanvasSettingsDialog';
import MergeDialog from '@/app/dashboard/components/MergeDialog';
import PushTargetDialog from '@/app/dashboard/components/PushTargetDialog';
import VersionHistoryDialog from '@/app/dashboard/components/VersionHistoryDialog';

const btnBase =
  'p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const btnPrimary =
  'flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium';

export default function StudioToolbar() {
  const router = useRouter();
  const studio = useStudioOptional();
  const workspace = useWorkspaceOptional();
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

  const versionId = studio?.state?.versionId ?? '';
  const tenantId = workspace?.tenant?.id ?? '';
  const projectId = workspace?.project?.id ?? '';
  const isReadOnly =
    studio?.state?.readOnly === true || workspace?.version?.published === true;

  useEffect(() => {
    if (!studio?.state?.versionId || (!options.jwt && !options.apiKey)) return;
    void studio.checkServerForUpdates(options);
  }, [studio?.state?.versionId, studio?.state?.revision, options.jwt, options.apiKey]);

  const performPull = useCallback(() => {
    if (!versionId || !studio) return;
    void studio.loadFromServer(versionId, options, {
      tenantId: tenantId || undefined,
      projectId: projectId || undefined,
    });
  }, [studio, versionId, options, tenantId, projectId]);

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
    performPull();
  }, [studio, confirm, performPull]);

  const handleReset = useCallback(() => {
    performPull();
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
    (message: string | null) => {
      if (!studio) return;
      void studio.save(options, { message });
    },
    [studio, options]
  );

  const handlePushToTarget = useCallback(
    async (targetVersionId: string) => {
      if (!studio) return;
      try {
        await studio.push(targetVersionId, options);
        setPushDialogOpen(false);
      } catch {
        // Error and pushConflict409 set in context; dialog stays open for Pull then Merge suggestion
      }
    },
    [studio, options]
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

  const showGitToolbar = Boolean(studio && studio.state);

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
        disabled={studio!.loading || isReadOnly}
        className={btnPrimary}
        aria-label="Commit (snapshot to server)"
        title={
          isReadOnly
            ? 'Cannot commit (read-only)'
            : 'Commit local state to server (optional message)'
        }
      >
        {studio!.loading ? (
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
        disabled={studio!.loading || isReadOnly || !tenantId || !projectId}
        className={btnBase}
        aria-label="Push to another version"
        title="Push current state to another version"
      >
        <Upload className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={handlePull}
        disabled={studio!.loading}
        className={btnBase}
        aria-label="Pull from server"
        title="Reload from server"
      >
        <Download className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => openMergeDialog(null)}
        disabled={studio!.loading || isReadOnly || !tenantId || !projectId}
        className={btnBase}
        aria-label="Merge from another version"
        title="Merge changes from another version"
      >
        <GitMerge className="h-4 w-4" />
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

      {showGitToolbar && (
        <>
      <CommitMessageDialog
        open={commitDialogOpen}
        onOpenChange={setCommitDialogOpen}
        onCommit={handleCommitWithMessage}
        loading={studio!.loading}
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
        onPull={handlePull}
        onMerge={handleMergeFromPush}
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
    </div>
  );
}
