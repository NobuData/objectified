import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ProjectsPage from '../../../src/app/dashboard/projects/page';

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
  createProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
  restoreProject: jest.fn(),
  permanentDeleteProject: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
  isForbiddenError: jest.fn(() => false),
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('@/app/hooks/useTenantPermissions', () => ({
  useTenantPermissions: jest.fn(() => ({
    loading: false,
    error: null,
    permissions: { permission_keys: ['project:read', 'project:write'] },
    permissionKeys: new Set(['project:read', 'project:write']),
    has: (key: string) => key === 'project:read' || key === 'project:write',
  })),
}));

describe('ProjectsPage', () => {
  beforeEach(() => {
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
    const { listProjects } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue([]);
  });

  it('renders projects heading', async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /projects/i })).toBeInTheDocument();
    });
  });

  it('renders description for managing projects by tenant', async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText(/manage projects for the selected tenant/i)).toBeInTheDocument();
    });
  });

  it('renders New project button when authenticated', async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
    });
  });

  it('shows tenant selector and empty state when no projects', async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/select tenant/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });
  });

  it('shows sign-in message when unauthenticated', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({ status: 'unauthenticated', data: null });
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText(/you must be signed in/i)).toBeInTheDocument();
    });
  });

  it('renders show deleted toggle button', async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /show deleted/i })).toBeInTheDocument();
    });
  });

  it('calls listProjects with include_deleted=false by default', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(listProjects).toHaveBeenCalledWith('t1', expect.anything(), false);
    });
  });
});
