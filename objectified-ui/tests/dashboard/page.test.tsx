import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from '../../src/app/dashboard/page';

const pushMock = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    status: 'authenticated',
    data: { user: { email: 'test@example.com' }, accessToken: 'token' },
  })),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: pushMock })),
}));

jest.mock('@/app/contexts/TenantSelectionContext', () => ({
  useTenantSelection: jest.fn(() => ({
    selectedTenantId: 'tenant-1',
    tenants: [{ id: 'tenant-1', name: 'Tenant One' }],
    setSelectedTenantId: jest.fn(),
  })),
}));

jest.mock('@lib/api/rest-client', () => ({
  getRestClientOptions: jest.fn(() => ({})),
  listProjects: jest.fn(),
  listVersions: jest.fn(),
  pullVersion: jest.fn(),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    const { listProjects, listVersions, pullVersion } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue([
      { id: 'project-1', tenant_id: 'tenant-1', name: 'Project One', created_at: '', updated_at: '' },
    ]);
    listVersions.mockResolvedValue([
      {
        id: 'version-1',
        project_id: 'project-1',
        source_version_id: null,
        creator_id: 'user-1',
        name: 'Version One',
        metadata: {},
        created_at: '2026-03-20T10:00:00Z',
        updated_at: '2026-03-21T10:00:00Z',
      },
    ]);
    pullVersion.mockResolvedValue({
      classes: [
        {
          name: 'Order',
          properties: [{ name: 'customer', data: { $ref: '#/components/schemas/Customer' } }],
        },
        { name: 'Customer', properties: [] },
      ],
    });
  });

  afterEach(() => {
    pushMock.mockReset();
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  it('renders quick actions and recently updated versions with schema metrics', async () => {
    render(<DashboardPage />);

    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Version One')).toBeInTheDocument();
    });
    expect(screen.getByText(/project one/i)).toBeInTheDocument();
    expect(screen.getByText(/classes 2/i)).toBeInTheDocument();
    expect(screen.getByText(/depth 1/i)).toBeInTheDocument();
    expect(screen.getByText(/circular refs 0/i)).toBeInTheDocument();
  });

  it('opens last version from quick action', async () => {
    window.localStorage.setItem(
      'objectified:dashboard:last-opened-version',
      JSON.stringify({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        versionId: 'version-1',
        readOnly: true,
      })
    );

    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open last version/i })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole('button', { name: /open last version/i }));

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('/data-designer?tenantId=tenant-1&projectId=project-1&versionId=version-1')
    );
  });
});
