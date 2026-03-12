'use client';

import { useSession } from 'next-auth/react';
import { Undo2, Redo2, Save, Loader2 } from 'lucide-react';
import { getRestClientOptions } from '@lib/api/rest-client';
import { useStudioOptional } from '@/app/contexts/StudioContext';

export default function StudioToolbar() {
  const studio = useStudioOptional();
  const { data: session } = useSession();
  const options = getRestClientOptions(
    (session as { accessToken?: string } | null) ?? null
  );

  if (!studio) return null;
  if (!studio.state) return null;

  const handleSave = () => {
    void studio.save(options);
  };

  return (
    <div className="flex items-center gap-2 shrink-0">
      {studio.error && (
        <span
          className="text-sm text-red-600 dark:text-red-400"
          role="alert"
          title={studio.error}
        >
          {studio.error}
        </span>
      )}
      <button
        type="button"
        onClick={studio.undo}
        disabled={!studio.canUndo || studio.loading}
        className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Undo"
        title="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={studio.redo}
        disabled={!studio.canRedo || studio.loading}
        className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Redo"
        title="Redo"
      >
        <Redo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={studio.loading}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        aria-label="Save to server"
        title="Save to server"
      >
        {studio.loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save
      </button>
    </div>
  );
}
