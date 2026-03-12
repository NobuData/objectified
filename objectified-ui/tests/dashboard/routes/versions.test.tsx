import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import VersionsPage from '../../../src/app/dashboard/versions/page';

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
  createVersion: jest.fn(),
  updateVersion: jest.fn(),
  deleteVersion: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
  isForbiddenError: jest.fn(() => false),
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

describe('VersionsPage', () => {
  beforeEach(() => {
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

  it('renders versions heading', async () => {
    render(<VersionsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /versions/i })
      ).toBeInTheDocument();
    });
  });

  it('renders description for managing versions by project', async () => {
    render(<VersionsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/manage specification versions by project/i)
      ).toBeInTheDocument();
    });
  });

  it('renders New Version button when project selected', async () => {
    render(<VersionsPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /new version/i });
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows tenant and project selectors', async () => {
    render(<VersionsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/select tenant/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/select project/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when no versions', async () => {
    render(<VersionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/no versions yet/i)).toBeInTheDocument();
    });
  });

  it('calls listVersions when tenant and project selected', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    render(<VersionsPage />);
    await waitFor(() => {
      expect(listVersions).toHaveBeenCalledWith('t1', 'p1', expect.anything());
    });
  });
});
