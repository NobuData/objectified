import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectsPage from '../../../src/app/dashboard/projects/ProjectsPageClient';

const SESSION = {
  status: 'authenticated',
  data: {
    user: { name: 'User', email: 'user@example.com' },
    accessToken: 'token',
  },
};

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => SESSION),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

jest.mock('@/app/contexts/TenantSelectionContext', () => ({
  useTenantSelection: jest.fn(),
}));

jest.mock('@lib/api/rest-client', () => ({
  listProjects: jest.fn(),
  listVersions: jest.fn(),
  createProject: jest.fn(),
  cloneProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
  restoreProject: jest.fn(),
  permanentDeleteProject: jest.fn(),
  getUser: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
  isForbiddenError: jest.fn(() => false),
  getTenantQuotaStatus: jest.fn(() =>
    Promise.resolve({
      max_projects: null,
      active_project_count: 0,
      max_versions_per_project: null,
      active_version_count_for_project: null,
    })
  ),
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

const SAMPLE_PROJECTS = [
  {
    id: 'p1',
    name: 'Alpha Project',
    slug: 'alpha-project',
    enabled: true,
    deleted_at: null,
    creator_id: 'u1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
    metadata: { tags: ['frontend', 'react'] },
    description: 'First project',
  },
  {
    id: 'p2',
    name: 'Beta Project',
    slug: 'beta-project',
    enabled: false,
    deleted_at: null,
    creator_id: 'u2',
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-07-01T00:00:00Z',
    metadata: { tags: ['backend'] },
    description: 'Second project',
  },
  {
    id: 'p3',
    name: 'Gamma Project',
    slug: 'gamma-project',
    enabled: true,
    deleted_at: '2024-08-01T00:00:00Z',
    creator_id: 'u1',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-08-01T00:00:00Z',
    metadata: {},
    description: null,
  },
];

describe('ProjectsPage', () => {
  beforeEach(() => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue(SESSION);
    const { useTenantSelection } = require('@/app/contexts/TenantSelectionContext');
    useTenantSelection.mockReturnValue({
      tenants: [{ id: 't1', name: 'Tenant One', slug: 'tenant-one' }],
      tenantsLoading: false,
      selectedTenantId: 't1',
      setSelectedTenantId: jest.fn(),
    });
    const { listProjects, listVersions, getUser } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue([]);
    listVersions.mockResolvedValue([]);
    getUser.mockResolvedValue({ name: 'User', email: 'user@example.com' });
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  it('renders project rows when projects are loaded', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue(SAMPLE_PROJECTS);
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
      expect(screen.getByText('Beta Project')).toBeInTheDocument();
    });
  });

  it('filters projects by search query', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue(SAMPLE_PROJECTS);
    render(<ProjectsPage />);
    await waitFor(() => expect(screen.getByText('Alpha Project')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/name or slug/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'alpha' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
      expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
    });
  });

  it('filters projects by status', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue(SAMPLE_PROJECTS);
    render(<ProjectsPage />);
    await waitFor(() => expect(screen.getByText('Alpha Project')).toBeInTheDocument());

    const statusSelect = screen.getByLabelText(/status/i);
    await act(async () => {
      fireEvent.change(statusSelect, { target: { value: 'active' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
      expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
    });
  });

  it('filters projects by tag', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue(SAMPLE_PROJECTS);
    render(<ProjectsPage />);
    await waitFor(() => expect(screen.getByText('Alpha Project')).toBeInTheDocument());

    const tagInput = screen.getByPlaceholderText(/filter by tag/i);
    await act(async () => {
      fireEvent.change(tagInput, { target: { value: 'backend' } });
    });

    await waitFor(() => {
      expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument();
      expect(screen.getByText('Beta Project')).toBeInTheDocument();
    });
  });

  it('bulk archive button is not visible when no projects are selected', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue(SAMPLE_PROJECTS);
    render(<ProjectsPage />);
    await waitFor(() => expect(screen.getByText('Alpha Project')).toBeInTheDocument());

    // With no selections, the bulk action bar should not be visible
    expect(screen.queryByRole('button', { name: /^archive$/i })).not.toBeInTheDocument();
  });

  it('bulk archive button is visible when projects are selected', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue([SAMPLE_PROJECTS[0]]);
    render(<ProjectsPage />);
    await waitFor(() => expect(screen.getByText('Alpha Project')).toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox', { name: /select alpha project/i });
    await act(async () => {
      fireEvent.click(checkbox);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^archive$/i })).toBeInTheDocument();
    });
  });

  it('selectedWritableProjects excludes disabled projects', async () => {
    const { listProjects, deleteProject } = require('@lib/api/rest-client');
    const { useDialog } = require('@/app/components/providers/DialogProvider');
    const alertMock = jest.fn(() => Promise.resolve());
    useDialog.mockReturnValue({
      confirm: jest.fn(() => Promise.resolve(true)),
      alert: alertMock,
    });

    // Only the disabled project
    listProjects.mockResolvedValue([SAMPLE_PROJECTS[1]]);
    render(<ProjectsPage />);
    await waitFor(() => expect(screen.getByText('Beta Project')).toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox', { name: /select beta project/i });
    await act(async () => {
      fireEvent.click(checkbox);
    });

    // The bulk action bar should appear since a project is selected
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^archive$/i })).toBeInTheDocument();
    });

    // Clicking archive with only a disabled project selected should show the info alert,
    // NOT call deleteProject (since selectedWritableProjects is empty for disabled projects)
    const archiveButton = screen.getByRole('button', { name: /^archive$/i });
    await act(async () => {
      fireEvent.click(archiveButton);
    });

    expect(deleteProject).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'info' }));
  });

  it('renders project tags as badges', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue([SAMPLE_PROJECTS[0]]);
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText('frontend')).toBeInTheDocument();
      expect(screen.getByText('react')).toBeInTheDocument();
    });
  });

  it('deduplicates tags so each unique tag renders only once', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    const projectWithDuplicateTags = {
      ...SAMPLE_PROJECTS[0],
      metadata: { tags: ['react', 'react', 'frontend'] },
    };
    listProjects.mockResolvedValue([projectWithDuplicateTags]);
    render(<ProjectsPage />);
    await waitFor(() => expect(screen.getByText('react')).toBeInTheDocument());

    // With deduplication, 'react' should appear exactly once in the tag badges
    const reactBadges = screen.getAllByText('react');
    expect(reactBadges).toHaveLength(1);
  });

  it('calls listVersions for visible project IDs', async () => {
    const { listProjects, listVersions } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue([SAMPLE_PROJECTS[0]]);
    listVersions.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }]);
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(listVersions).toHaveBeenCalledWith('t1', 'p1', expect.anything());
    });
  });

  it('shows version count for each visible project', async () => {
    const { listProjects, listVersions } = require('@lib/api/rest-client');
    listProjects.mockResolvedValue([SAMPLE_PROJECTS[0]]);
    listVersions.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }]);
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('shows sort controls', async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/^sort$/i)).toBeInTheDocument();
    });
  });

  it('opens clone dialog, calls cloneProject with correct payload, and navigates to new project settings', async () => {
    const { listProjects, cloneProject } = require('@lib/api/rest-client');
    const { useRouter } = require('next/navigation');
    const pushMock = jest.fn();
    useRouter.mockReturnValue({ push: pushMock });

    const newProjectId = 'p-new';
    listProjects.mockResolvedValue([SAMPLE_PROJECTS[0]]);
    cloneProject.mockResolvedValue({
      project: {
        ...SAMPLE_PROJECTS[0],
        id: newProjectId,
        name: 'Alpha Project (copy)',
        slug: 'alpha-project-copy',
      },
      cloned_version_id: null,
    });

    render(<ProjectsPage />);
    await waitFor(() => expect(screen.getByText('Alpha Project')).toBeInTheDocument());

    // Open the actions dropdown
    await userEvent.click(screen.getByRole('button', { name: /actions for alpha project/i }));

    // Click "Duplicate project" in the dropdown
    await waitFor(() => expect(screen.getByText('Duplicate project')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Duplicate project'));

    // Clone dialog should open
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /duplicate project/i })).toBeInTheDocument()
    );

    // Submit the pre-filled form
    await userEvent.click(screen.getByRole('button', { name: /^duplicate$/i }));

    // Assert cloneProject was called with the expected payload
    await waitFor(() => {
      expect(cloneProject).toHaveBeenCalledWith(
        't1',
        'p1',
        expect.objectContaining({ name: 'Alpha Project (copy)' }),
        expect.anything()
      );
    });

    // Assert navigation to the new project's settings page
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(`/dashboard/projects/${newProjectId}/settings`);
    });
  });
});
