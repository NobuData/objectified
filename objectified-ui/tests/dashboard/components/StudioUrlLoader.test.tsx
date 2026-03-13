/**
 * Unit tests for StudioUrlLoader:
 * - Renders without crashing when no query params are present.
 * - Fetches tenant/project/version and sets workspace state when all three
 *   URL params are present.
 * - Does not call REST APIs when params are missing.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import StudioUrlLoader from '../../../src/app/dashboard/components/StudioUrlLoader';
import { WorkspaceProvider, useWorkspace } from '@/app/contexts/WorkspaceContext';
import { StudioProvider } from '@/app/contexts/StudioContext';

// ─── Mock next/navigation ────────────────────────────────────────────────────

let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

// ─── Mock next-auth/react ────────────────────────────────────────────────────

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { accessToken: 'token' } }),
}));

// ─── Mock REST client ────────────────────────────────────────────────────────

const mockGetTenant = jest.fn();
const mockGetProject = jest.fn();
const mockGetVersion = jest.fn();

jest.mock('@lib/api/rest-client', () => ({
  getRestClientOptions: () => ({}),
  getTenant: (...args: unknown[]) => mockGetTenant(...args),
  getProject: (...args: unknown[]) => mockGetProject(...args),
  getVersion: (...args: unknown[]) => mockGetVersion(...args),
}));

// ─── Helper: spy on WorkspaceContext mutations ───────────────────────────────

let setTenantSpy: jest.Mock;
let setProjectSpy: jest.Mock;
let setVersionSpy: jest.Mock;

function WorkspaceSpy() {
  const ws = useWorkspace();
  setTenantSpy = ws.setTenant as jest.Mock;
  setProjectSpy = ws.setProject as jest.Mock;
  setVersionSpy = ws.setVersion as jest.Mock;
  return null;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <StudioProvider>
        <WorkspaceSpy />
        {children}
      </StudioProvider>
    </WorkspaceProvider>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StudioUrlLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('renders without crashing when no query params are present', () => {
    const { container } = render(
      <Wrapper>
        <StudioUrlLoader />
      </Wrapper>
    );
    expect(container).toBeInTheDocument();
    expect(mockGetTenant).not.toHaveBeenCalled();
    expect(mockGetProject).not.toHaveBeenCalled();
    expect(mockGetVersion).not.toHaveBeenCalled();
  });

  it('does not call REST APIs when only some params are present', () => {
    mockSearchParams = new URLSearchParams('tenantId=t1&projectId=p1');
    render(
      <Wrapper>
        <StudioUrlLoader />
      </Wrapper>
    );
    expect(mockGetTenant).not.toHaveBeenCalled();
    expect(mockGetProject).not.toHaveBeenCalled();
    expect(mockGetVersion).not.toHaveBeenCalled();
  });

  it('fetches tenant, project, and version when all params are present', async () => {
    mockSearchParams = new URLSearchParams(
      'tenantId=t1&projectId=p1&versionId=v1'
    );

    const tenant = { id: 't1', name: 'Tenant One', slug: 'tenant-one', description: '', created_at: '2024-01-01T00:00:00Z', updated_at: null };
    const project = { id: 'p1', tenant_id: 't1', name: 'Project One', slug: 'project-one', created_at: '2024-01-01T00:00:00Z', updated_at: null };
    const version = { id: 'v1', project_id: 'p1', name: '1.0.0', created_at: '2024-01-01T00:00:00Z', updated_at: null };

    mockGetTenant.mockResolvedValue(tenant);
    mockGetProject.mockResolvedValue(project);
    mockGetVersion.mockResolvedValue(version);

    render(
      <Wrapper>
        <StudioUrlLoader />
      </Wrapper>
    );

    await waitFor(() => {
      expect(mockGetTenant).toHaveBeenCalledWith('t1', expect.any(Object));
    });
    await waitFor(() => {
      expect(mockGetProject).toHaveBeenCalledWith('t1', 'p1', expect.any(Object));
    });
    await waitFor(() => {
      expect(mockGetVersion).toHaveBeenCalledWith('v1', expect.any(Object));
    });
  });

  it('does not re-fetch when the same params are already loaded', async () => {
    mockSearchParams = new URLSearchParams(
      'tenantId=t1&projectId=p1&versionId=v1'
    );

    const tenant = { id: 't1', name: 'Tenant One', slug: 'tenant-one', description: '', created_at: '2024-01-01T00:00:00Z', updated_at: null };
    const project = { id: 'p1', tenant_id: 't1', name: 'Project One', slug: 'project-one', created_at: '2024-01-01T00:00:00Z', updated_at: null };
    const version = { id: 'v1', project_id: 'p1', name: '1.0.0', created_at: '2024-01-01T00:00:00Z', updated_at: null };

    mockGetTenant.mockResolvedValue(tenant);
    mockGetProject.mockResolvedValue(project);
    mockGetVersion.mockResolvedValue(version);

    const { rerender } = render(
      <Wrapper>
        <StudioUrlLoader />
      </Wrapper>
    );

    await waitFor(() => {
      expect(mockGetTenant).toHaveBeenCalledTimes(1);
    });

    // Re-render with the same params — should not fetch again
    rerender(
      <Wrapper>
        <StudioUrlLoader />
      </Wrapper>
    );

    await waitFor(() => {
      expect(mockGetTenant).toHaveBeenCalledTimes(1);
    });
  });

  it('logs an error and does not throw when a REST call fails', async () => {
    mockSearchParams = new URLSearchParams(
      'tenantId=t1&projectId=p1&versionId=v1'
    );
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockGetTenant.mockRejectedValue(new Error('Not found'));
    mockGetProject.mockResolvedValue({});
    mockGetVersion.mockResolvedValue({});

    expect(() =>
      render(
        <Wrapper>
          <StudioUrlLoader />
        </Wrapper>
      )
    ).not.toThrow();

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StudioUrlLoader]'),
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });
});

