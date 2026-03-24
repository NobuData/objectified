/**
 * Route-level tests for the deep-link page:
 * /dashboard/projects/[projectId]/versions/[versionId]/page.tsx
 *
 * Covers: success redirect, forbidden, not-found, and abort-on-unmount.
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import DeepLinkPage from '../../../src/app/dashboard/projects/[projectId]/versions/[versionId]/ProjectVersionPageClient';

// ---------------------------------------------------------------------------
// Stable module-level references used inside mocks.
// Returning new objects/arrays on every render causes infinite re-render loops
// because the hook values appear in the useEffect dependency array.
// ---------------------------------------------------------------------------
const mockRouterReplace = jest.fn();
const STABLE_ROUTER = { replace: mockRouterReplace };

const mockSetSelectedTenantId = jest.fn();
const TENANTS = [
  { id: 't1', name: 'Tenant One', slug: 'tenant-one', enabled: true, created_at: '2024-01-01T00:00:00Z' },
];
const STABLE_TENANT_CONTEXT = {
  tenants: TENANTS,
  tenantsLoading: false,
  selectedTenantId: null as string | null,
  setSelectedTenantId: mockSetSelectedTenantId,
};
const STABLE_TENANT_CONTEXT_LOADING = {
  tenants: [] as typeof TENANTS,
  tenantsLoading: true,
  selectedTenantId: null as string | null,
  setSelectedTenantId: mockSetSelectedTenantId,
};

const SESSION_AUTHENTICATED = {
  status: 'authenticated' as const,
  data: { user: { name: 'User' }, accessToken: 'tok' },
};
const SESSION_LOADING = { status: 'loading' as const, data: null };
const SESSION_UNAUTH = { status: 'unauthenticated' as const, data: null };

// ---------------------------------------------------------------------------
// next/navigation mocks
// ---------------------------------------------------------------------------
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(() => STABLE_ROUTER),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// ---------------------------------------------------------------------------
// next-auth mock
// ---------------------------------------------------------------------------
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

// ---------------------------------------------------------------------------
// TenantSelectionContext mock
// ---------------------------------------------------------------------------
jest.mock('@/app/contexts/TenantSelectionContext', () => ({
  useTenantSelection: jest.fn(),
}));

// ---------------------------------------------------------------------------
// REST client mock
// ---------------------------------------------------------------------------
jest.mock('@lib/api/rest-client', () => ({
  getVersion: jest.fn(),
  getProject: jest.fn(),
  getTenant: jest.fn(),
  resolveTenantIdForProject: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
  isForbiddenError: jest.fn(),
  isNotFoundError: jest.fn(),
  isRestApiError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// lucide-react stub (ShieldAlert used by DashboardForbidden)
// ---------------------------------------------------------------------------
jest.mock('lucide-react', () => ({
  Loader2: ({ 'aria-label': label }: { 'aria-label'?: string }) => (
    <span className="animate-spin" aria-label={label} />
  ),
  ShieldAlert: () => <span data-testid="shield-alert" />,
}));

// ---------------------------------------------------------------------------
// next/link stub
// ---------------------------------------------------------------------------
jest.mock('next/link', () => {
  const MockLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupMocks({
  sessionStatus = 'authenticated' as 'authenticated' | 'loading' | 'unauthenticated',
  projectId = 'proj-1',
  versionId = 'ver-1',
  tenantsLoading = false,
} = {}) {
  const { useSession } = require('next-auth/react');
  const { useParams } = require('next/navigation');
  const { useTenantSelection } = require('@/app/contexts/TenantSelectionContext');

  useSession.mockReturnValue(
    sessionStatus === 'authenticated'
      ? SESSION_AUTHENTICATED
      : sessionStatus === 'loading'
        ? SESSION_LOADING
        : SESSION_UNAUTH
  );
  useParams.mockReturnValue({ projectId, versionId });
  useTenantSelection.mockReturnValue(
    tenantsLoading ? STABLE_TENANT_CONTEXT_LOADING : STABLE_TENANT_CONTEXT
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardProjectVersionDeepLinkPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-register stable router after clearAllMocks clears useRouter implementation
    const { useRouter } = require('next/navigation');
    useRouter.mockReturnValue(STABLE_ROUTER);
  });

  it('redirects to /data-designer with correct query params on success', async () => {
    setupMocks();
    const { getVersion, resolveTenantIdForProject, getTenant, getProject } =
      require('@lib/api/rest-client');

    getVersion.mockResolvedValue({ id: 'ver-1', project_id: 'proj-1' });
    resolveTenantIdForProject.mockResolvedValue('t1');
    getTenant.mockResolvedValue({ id: 't1', name: 'Tenant One' });
    getProject.mockResolvedValue({ id: 'proj-1', name: 'Project One' });

    render(<DeepLinkPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        expect.stringContaining('/data-designer?')
      );
    });

    const callArg: string = mockRouterReplace.mock.calls[0][0];
    const qs = new URLSearchParams(callArg.split('?')[1]);
    expect(qs.get('tenantId')).toBe('t1');
    expect(qs.get('projectId')).toBe('proj-1');
    expect(qs.get('versionId')).toBe('ver-1');
    expect(mockSetSelectedTenantId).toHaveBeenCalledWith('t1');
  });

  it('shows forbidden when session is unauthenticated', async () => {
    setupMocks({ sessionStatus: 'unauthenticated' });

    render(<DeepLinkPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/you do not have permission to open this project or version/i)
    ).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('shows forbidden when getVersion throws a 403', async () => {
    setupMocks();
    const { getVersion, isForbiddenError } = require('@lib/api/rest-client');
    const err = new Error('Forbidden');
    getVersion.mockRejectedValue(err);
    isForbiddenError.mockImplementation((e: unknown) => e === err);

    render(<DeepLinkPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows not-found when version project_id does not match', async () => {
    setupMocks();
    const { getVersion } = require('@lib/api/rest-client');
    getVersion.mockResolvedValue({ id: 'ver-1', project_id: 'other-proj' });

    render(<DeepLinkPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /not found/i })).toBeInTheDocument();
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('shows not-found when no tenant owns the project', async () => {
    setupMocks();
    const { getVersion, resolveTenantIdForProject } = require('@lib/api/rest-client');
    getVersion.mockResolvedValue({ id: 'ver-1', project_id: 'proj-1' });
    resolveTenantIdForProject.mockResolvedValue(null);

    render(<DeepLinkPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /not found/i })).toBeInTheDocument();
    });
  });

  it('shows loading spinner while session is loading', () => {
    setupMocks({ sessionStatus: 'loading' });

    render(<DeepLinkPage />);

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    expect(screen.getByLabelText('Loading session')).toBeInTheDocument();
  });

  it('does not redirect after unmount (abort-on-unmount)', async () => {
    setupMocks();
    const { getVersion, resolveTenantIdForProject, getTenant, getProject } =
      require('@lib/api/rest-client');

    let resolveGetVersion: ((v: unknown) => void) | undefined;
    getVersion.mockReturnValue(new Promise((res) => { resolveGetVersion = res; }));
    resolveTenantIdForProject.mockResolvedValue('t1');
    getTenant.mockResolvedValue({ id: 't1' });
    getProject.mockResolvedValue({ id: 'proj-1' });

    const { unmount } = render(<DeepLinkPage />);

    // Unmount before the async chain completes
    unmount();

    // Now resolve the version — the component should not call router.replace
    await act(async () => {
      resolveGetVersion?.({ id: 'ver-1', project_id: 'proj-1' });
      await Promise.resolve();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('waits for tenantsLoading to finish before probing', () => {
    setupMocks({ tenantsLoading: true });
    const { getVersion } = require('@lib/api/rest-client');

    render(<DeepLinkPage />);

    // Should not have called getVersion yet while tenants are loading
    expect(getVersion).not.toHaveBeenCalled();
  });

  it('forwards revision and readOnly query params to data-designer redirect', async () => {
    setupMocks();
    const { useSearchParams } = require('next/navigation');
    useSearchParams.mockReturnValue(new URLSearchParams('revision=5&readOnly=1'));

    const { getVersion, resolveTenantIdForProject, getTenant, getProject } =
      require('@lib/api/rest-client');

    getVersion.mockResolvedValue({ id: 'ver-1', project_id: 'proj-1' });
    resolveTenantIdForProject.mockResolvedValue('t1');
    getTenant.mockResolvedValue({ id: 't1', name: 'Tenant One' });
    getProject.mockResolvedValue({ id: 'proj-1', name: 'Project One' });

    render(<DeepLinkPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        expect.stringContaining('/data-designer?')
      );
    });

    const callArg: string = mockRouterReplace.mock.calls[0][0];
    const qs = new URLSearchParams(callArg.split('?')[1]);
    expect(qs.get('tenantId')).toBe('t1');
    expect(qs.get('projectId')).toBe('proj-1');
    expect(qs.get('versionId')).toBe('ver-1');
    expect(qs.get('revision')).toBe('5');
    expect(qs.get('readOnly')).toBe('1');
  });

  it('forwards revision and view query params (view=1) to data-designer redirect', async () => {
    setupMocks();
    const { useSearchParams } = require('next/navigation');
    useSearchParams.mockReturnValue(new URLSearchParams('revision=3&view=1'));

    const { getVersion, resolveTenantIdForProject, getTenant, getProject } =
      require('@lib/api/rest-client');

    getVersion.mockResolvedValue({ id: 'ver-1', project_id: 'proj-1' });
    resolveTenantIdForProject.mockResolvedValue('t1');
    getTenant.mockResolvedValue({ id: 't1', name: 'Tenant One' });
    getProject.mockResolvedValue({ id: 'proj-1', name: 'Project One' });

    render(<DeepLinkPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        expect.stringContaining('/data-designer?')
      );
    });

    const callArg: string = mockRouterReplace.mock.calls[0][0];
    const qs = new URLSearchParams(callArg.split('?')[1]);
    expect(qs.get('revision')).toBe('3');
    expect(qs.get('readOnly')).toBe('1');
  });

  it('forwards revision and edit=1 to data-designer redirect', async () => {
    setupMocks();
    const { useSearchParams } = require('next/navigation');
    useSearchParams.mockReturnValue(new URLSearchParams('revision=4&edit=1'));

    const { getVersion, resolveTenantIdForProject, getTenant, getProject } =
      require('@lib/api/rest-client');

    getVersion.mockResolvedValue({ id: 'ver-1', project_id: 'proj-1' });
    resolveTenantIdForProject.mockResolvedValue('t1');
    getTenant.mockResolvedValue({ id: 't1', name: 'Tenant One' });
    getProject.mockResolvedValue({ id: 'proj-1', name: 'Project One' });

    render(<DeepLinkPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        expect.stringContaining('/data-designer?')
      );
    });

    const callArg: string = mockRouterReplace.mock.calls[0][0];
    const qs = new URLSearchParams(callArg.split('?')[1]);
    expect(qs.get('revision')).toBe('4');
    expect(qs.get('edit')).toBe('1');
  });

  it('does not forward revision when only readOnly is present without revision', async () => {
    setupMocks();
    const { useSearchParams } = require('next/navigation');
    useSearchParams.mockReturnValue(new URLSearchParams('readOnly=1'));

    const { getVersion, resolveTenantIdForProject, getTenant, getProject } =
      require('@lib/api/rest-client');

    getVersion.mockResolvedValue({ id: 'ver-1', project_id: 'proj-1' });
    resolveTenantIdForProject.mockResolvedValue('t1');
    getTenant.mockResolvedValue({ id: 't1', name: 'Tenant One' });
    getProject.mockResolvedValue({ id: 'proj-1', name: 'Project One' });

    render(<DeepLinkPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        expect.stringContaining('/data-designer?')
      );
    });

    const callArg: string = mockRouterReplace.mock.calls[0][0];
    const qs = new URLSearchParams(callArg.split('?')[1]);
    expect(qs.get('revision')).toBeNull();
    expect(qs.get('readOnly')).toBeNull();
  });
});
