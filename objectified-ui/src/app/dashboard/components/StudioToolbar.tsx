'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Undo2,
  Redo2,
  GitCommit,
  RotateCcw,
  Upload,
  Download,
  GitMerge,
  Loader2,
  Circle,
  Cloud,
  GitBranchPlus,
} from 'lucide-react';
import { getRestClientOptions } from '@lib/api/rest-client';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import CommitMessageDialog from '@/app/dashboard/components/CommitMessageDialog';
import PushTargetDialog from '@/app/dashboard/components/PushTargetDialog';

const btnBase =
  'p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const btnPrimary =
  'flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium';

export default function StudioToolbar() {
  const studio = useStudioOptional();
  const workspace = useWorkspaceOptional();
  const { data: session } = useSession();
  const options = getRestClientOptions(
    (session as { accessToken?: string } | null) ?? null
  );
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);

  useEffect(() => {
    if (!studio?.state?.versionId || (!options.jwt && !options.apiKey)) return;
    void studio.checkServerForUpdates(options);
  }, [studio?.state?.versionId, studio?.state?.revision, options.jwt, options.apiKey]);

  if (!studio) return null;
  if (!studio.state) return null;

  const versionId = studio.state.versionId;
  const tenantId = workspace?.tenant?.id ?? '';
  const projectId = workspace?.project?.id ?? '';

  const handlePull = useCallback(() => {
    if (!versionId) return;
    void studio.loadFromServer(versionId, options, {
      tenantId: tenantId || undefined,
      projectId: projectId || undefined,
    });
  }, [studio, versionId, options, tenantId, projectId]);

  const handleReset = useCallback(() => {
    handlePull();
  }, [handlePull]);

  const handleCommitWithMessage = useCallback(
    (message: string | null) => {
      void studio.save(options, { message });
    },
    [studio, options]
  );

  const handlePushToTarget = useCallback(
    (targetVersionId: string) => {
      void studio.push(targetVersionId, options);
    },
    [studio, options]
  );

  const handleMerge = useCallback(() => {
    void studio.merge(options);
  }, [studio, options]);

  return (
    <div className="flex items-center gap-2 shrink-0 flex-wrap">
      {studio.error && (
        <span
          className="text-sm text-red-600 dark:text-red-400"
          role="alert"
          title={studio.error}
        >
          {studio.error}
        </span>
      )}

      {/* Indicators */}
      {studio.isDirty && (
        <span
          className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-medium"
          title="Uncommitted local changes"
        >
          <Circle className="h-2 w-2 fill-current" />
          Dirty
        </span>
      )}
      {studio.hasUnpushedCommits && (
        <span
          className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400 text-xs font-medium"
          title="Committed locally but not yet pushed to another version"
        >
          <GitBranchPlus className="h-4 w-4" />
          Unpushed commits
        </span>
      )}
      {studio.serverHasNewChanges && (
        <span
          className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 text-xs font-medium"
          title="Server has new changes"
        >
          <Cloud className="h-4 w-4" />
          Server has new changes
        </span>
      )}

      <div className="h-4 w-px bg-slate-200 dark:bg-slate-600" aria-hidden />

      <button
        type="button"
        onClick={studio.undo}
        disabled={!studio.canUndo || studio.loading}
        className={btnBase}
        aria-label="Undo"
        title="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={studio.redo}
        disabled={!studio.canRedo || studio.loading}
        className={btnBase}
        aria-label="Redo"
        title="Redo"
      >
        <Redo2 className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setCommitDialogOpen(true)}
        disabled={studio.loading}
        className={btnPrimary}
        aria-label="Commit (snapshot to server)"
        title="Commit local state to server (optional message)"
      >
        {studio.loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitCommit className="h-4 w-4" />
        )}
        Commit
      </button>

      <button
        type="button"
        onClick={handleReset}
        disabled={studio.loading}
        className={btnBase}
        aria-label="Reset to last committed state"
        title="Discard local changes and reload from server"
      >
        <RotateCcw className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setPushDialogOpen(true)}
        disabled={studio.loading || !tenantId || !projectId}
        className={btnBase}
        aria-label="Push to another version"
        title="Push current state to another version"
      >
        <Upload className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={handlePull}
        disabled={studio.loading}
        className={btnBase}
        aria-label="Pull from server"
        title="Reload from server"
      >
        <Download className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={handleMerge}
        disabled={studio.loading || !studio.serverHasNewChanges}
        className={btnBase}
        aria-label="Merge server changes"
        title="Merge (enabled when server has new changes)"
      >
        <GitMerge className="h-4 w-4" />
      </button>

      <CommitMessageDialog
        open={commitDialogOpen}
        onOpenChange={setCommitDialogOpen}
        onCommit={handleCommitWithMessage}
        loading={studio.loading}
      />
      <PushTargetDialog
        open={pushDialogOpen}
        onOpenChange={setPushDialogOpen}
        tenantId={tenantId}
        projectId={projectId}
        currentVersionId={versionId}
        options={options}
        onPush={handlePushToTarget}
        loading={studio.loading}
      />
    </div>
  );
}
