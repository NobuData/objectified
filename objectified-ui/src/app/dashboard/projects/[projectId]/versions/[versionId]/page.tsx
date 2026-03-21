'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import {
  getProject,
  getTenant,
  getVersion,
  getRestClientOptions,
  isForbiddenError,
  isNotFoundError,
  isRestApiError,
  resolveTenantIdForProject,
} from '@lib/api/rest-client';
import { useTenantSelection } from '@/app/contexts/TenantSelectionContext';
import DashboardForbidden from '@/app/dashboard/components/DashboardForbidden';

type ResolveState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

/**
 * Deep link: /dashboard/projects/{projectId}/versions/{versionId}
 * Validates access, syncs tenant selection, redirects to Data Designer (GitHub #188).
 */
export default function DashboardProjectVersionDeepLinkPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';
  const versionId = typeof params?.versionId === 'string' ? params.versionId : '';
  const { data: session, status } = useSession();
  const { setSelectedTenantId } = useTenantSelection();
  const [state, setState] = useState<ResolveState>({ kind: 'loading' });

  const accessToken = (session as { accessToken?: string } | null)?.accessToken ?? null;

  useEffect(() => {
    if (status === 'unauthenticated') {
      setState({ kind: 'forbidden' });
      return;
    }
    if (status !== 'authenticated' || !accessToken || !projectId || !versionId) {
      return;
    }

    setState({ kind: 'loading' });
    const controller = new AbortController();
    const callOpts = {
      ...getRestClientOptions({ accessToken }),
      signal: controller.signal,
    };

    void (async () => {
      try {
        const version = await getVersion(versionId, callOpts);
        if (controller.signal.aborted) return;
        if (version.project_id !== projectId) {
          setState({ kind: 'not_found' });
          return;
        }
        const tenantId = await resolveTenantIdForProject(projectId, callOpts);
        if (controller.signal.aborted) return;
        if (!tenantId) {
          setState({ kind: 'not_found' });
          return;
        }
        await Promise.all([getTenant(tenantId, callOpts), getProject(tenantId, projectId, callOpts)]);
        if (controller.signal.aborted) return;
        setSelectedTenantId(tenantId);
        const qs = new URLSearchParams({
          tenantId,
          projectId,
          versionId: version.id,
        }).toString();
        router.replace(`/data-designer?${qs}`);
      } catch (e) {
        if (controller.signal.aborted) return;
        if (isForbiddenError(e)) {
          setState({ kind: 'forbidden' });
        } else if (isNotFoundError(e)) {
          setState({ kind: 'not_found' });
        } else {
          const msg = isRestApiError(e)
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Something went wrong';
          setState({ kind: 'error', message: msg });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [status, accessToken, projectId, versionId, router, setSelectedTenantId]);

  if (status === 'loading') {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading session" />
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (state.kind === 'forbidden') {
    return (
      <DashboardForbidden message="You do not have permission to open this project or version." />
    );
  }

  if (state.kind === 'not_found') {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Not found
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This project/version link is invalid or no longer available.
        </p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Could not open link
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
      <Loader2 className="h-8 w-8 animate-spin" aria-label="Opening workspace" />
      <p className="text-sm">Opening Data Designer…</p>
    </div>
  );
}
