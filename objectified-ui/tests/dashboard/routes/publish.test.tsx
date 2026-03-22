import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PublishPage from '../../../src/app/dashboard/publish/PublishPageClient';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    status: 'authenticated',
    data: {
      user: { name: 'User', email: 'user@example.com' },
      accessToken: 'token',
    },
  })),
}));

jest.mock('@/app/contexts/TenantSelectionContext', () => ({
  useTenantSelection: jest.fn(),
}));

jest.mock('@lib/api/rest-client', () => ({
  listProjects: jest.fn(),
  listVersions: jest.fn(),
  publishVersion: jest.fn(),
  unpublishVersion: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
  isForbiddenError: jest.fn(() => false),
  VERSION_PUBLISH_TARGETS: ['development', 'staging', 'production'],
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

describe('PublishPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { name: 'User', email: 'user@example.com' },
        accessToken: 'token',
      },
    });
    const { useTenantSelection } = require('@/app/contexts/TenantSelectionContext');
    useTenantSelection.mockReturnValue({
      tenants: [{ id: 't1', name: 'Tenant One', slug: 'tenant-one' }],
      tenantsLoading: false,
      selectedTenantId: 't1',
      setSelectedTenantId: jest.fn(),
    });
    const { listProjects, listVersions } =
      require('@lib/api/rest-client');
    listProjects.mockResolvedValue([
      { id: 'p1', name: 'Project One', slug: 'project-one', description: '' },
    ]);
    listVersions.mockResolvedValue([]);
  });

  it('renders publish heading', async () => {
    render(<PublishPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /publish/i })
      ).toBeInTheDocument();
    });
  });

  it('shows tenant and project selectors', async () => {
    render(<PublishPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/select tenant/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/select project/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when no versions', async () => {
    render(<PublishPage />);
    await waitFor(() => {
      expect(screen.getByText(/no versions yet/i)).toBeInTheDocument();
    });
  });

  it('calls listVersions when tenant and project are selected', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    render(<PublishPage />);
    await waitFor(() => {
      expect(listVersions).toHaveBeenCalledWith('t1', 'p1', expect.anything());
    });
  });

  it('calls listProjects when tenant is selected from context', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    render(<PublishPage />);
    await waitFor(() => {
      expect(listProjects).toHaveBeenCalledWith('t1', expect.anything());
    });
  });

  it('renders published version row with publish action', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([
      {
        id: 'v1',
        project_id: 'p1',
        name: '1.0.0',
        description: 'First version',
        published: false,
        visibility: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
      },
    ]);
    render(<PublishPage />);
    await waitFor(() => {
      expect(screen.getByText('1.0.0')).toBeInTheDocument();
    });
  });

  it('shows published status for published version', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([
      {
        id: 'v2',
        project_id: 'p1',
        name: '2.0.0',
        description: 'Published version',
        published: true,
        published_at: '2024-02-01T00:00:00Z',
        visibility: 'public',
        created_at: '2024-01-15T00:00:00Z',
        updated_at: null,
      },
    ]);
    render(<PublishPage />);
    await waitFor(() => {
      const publishedElements = screen.getAllByText('Published');
      expect(publishedElements.length).toBeGreaterThanOrEqual(1);
    });
    await waitFor(() => {
      expect(screen.getByText('Public')).toBeInTheDocument();
    });
  });

  it('shows "—" for null visibility in published version', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([
      {
        id: 'v3',
        project_id: 'p1',
        name: '3.0.0',
        description: 'Published with null visibility',
        published: true,
        published_at: '2024-03-01T00:00:00Z',
        visibility: null,
        created_at: '2024-01-20T00:00:00Z',
        updated_at: null,
      },
    ]);
    render(<PublishPage />);
    await waitFor(() => {
      expect(screen.getByText('3.0.0')).toBeInTheDocument();
    });
    expect(screen.queryByText('Public')).not.toBeInTheDocument();
    expect(screen.queryByText('Private')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});
