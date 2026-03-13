import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PublishedPage from '../../../src/app/dashboard/published/page';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    status: 'authenticated',
    data: {
      user: { name: 'User', email: 'user@example.com' },
      accessToken: 'token',
    },
  })),
}));

jest.mock('@lib/api/rest-client', () => ({
  listMyTenants: jest.fn(),
  listProjects: jest.fn(),
  listVersions: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
  isForbiddenError: jest.fn(() => false),
}));

describe('PublishedPage', () => {
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
    const { listMyTenants, listProjects, listVersions } =
      require('@lib/api/rest-client');
    listMyTenants.mockResolvedValue([
      { id: 't1', name: 'Tenant One', slug: 'tenant-one' },
    ]);
    listProjects.mockResolvedValue([
      { id: 'p1', name: 'Project One', project_id: 'p1', description: '' },
    ]);
    listVersions.mockResolvedValue([]);
  });

  it('renders Published heading', async () => {
    render(<PublishedPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /published/i })
      ).toBeInTheDocument();
    });
  });

  it('shows tenant selector', async () => {
    render(<PublishedPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/select tenant/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when no published versions', async () => {
    render(<PublishedPage />);
    await waitFor(() => {
      expect(screen.getByText(/no published versions/i)).toBeInTheDocument();
    });
  });

  it('calls listProjects and listVersions when tenant is selected', async () => {
    const { listProjects, listVersions } = require('@lib/api/rest-client');
    render(<PublishedPage />);
    await waitFor(() => {
      expect(listProjects).toHaveBeenCalledWith('t1', expect.anything());
    });
    await waitFor(() => {
      expect(listVersions).toHaveBeenCalledWith('t1', 'p1', expect.anything());
    });
  });

  it('renders published version rows with project, visibility, and Open in Studio link', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([
      {
        id: 'v1',
        project_id: 'p1',
        name: '1.0.0',
        description: 'First release',
        published: true,
        published_at: '2024-02-01T00:00:00Z',
        visibility: 'public',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
      },
    ]);
    render(<PublishedPage />);
    await waitFor(() => {
      expect(screen.getByText('1.0.0')).toBeInTheDocument();
    });
    expect(screen.getByText('Project One')).toBeInTheDocument();
    expect(screen.getAllByText('Public').length).toBeGreaterThanOrEqual(1);
    const studioLink = screen.getByRole('link', { name: 'Open 1.0.0 in Studio' });
    expect(studioLink).toHaveAttribute(
      'href',
      '/data-designer?tenantId=t1&projectId=p1&versionId=v1'
    );
  });

  it('filters out unpublished versions', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([
      {
        id: 'v1',
        project_id: 'p1',
        name: '1.0.0',
        description: 'Draft',
        published: false,
        published_at: null,
        visibility: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
      },
    ]);
    render(<PublishedPage />);
    await waitFor(() => {
      expect(screen.getByText(/no published versions/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('1.0.0')).not.toBeInTheDocument();
  });
});
