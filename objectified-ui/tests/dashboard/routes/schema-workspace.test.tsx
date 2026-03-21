import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchemaWorkspacePage from '../../../src/app/dashboard/schema-workspace/SchemaWorkspacePageClient';

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
  pullVersion: jest.fn(),
  listVersionSnapshotsMetadata: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
  isForbiddenError: jest.fn(() => false),
}));

jest.mock('@/app/dashboard/utils/compareSchemas', () => ({
  compareSchemas: jest.fn(() => ({
    added_class_names: [],
    removed_class_names: [],
    modified_classes: [],
  })),
}));

const sampleVersion = {
  id: 'v1',
  project_id: 'p1',
  name: 'v1.0.0',
  description: 'First version',
  change_log: '',
  enabled: true,
  published: false,
  visibility: 'private',
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const sampleVersionPullResponse = {
  classes: [
    { name: 'User', properties: [{ name: 'id' }, { name: 'email' }] },
    { name: 'Post', properties: [{ name: 'title' }] },
  ],
};

describe('SchemaWorkspacePage', () => {
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
    const { listProjects, listVersions, listVersionSnapshotsMetadata } =
      require('@lib/api/rest-client');
    listProjects.mockResolvedValue([
      { id: 'p1', name: 'Project One', project_id: 'p1', description: '' },
    ]);
    listVersions.mockResolvedValue([sampleVersion]);
    listVersionSnapshotsMetadata.mockResolvedValue([]);
  });

  it('renders Schema workspace heading', async () => {
    render(<SchemaWorkspacePage />);
    await waitFor(() => {
      expect(screen.getByText(/schema workspace/i)).toBeInTheDocument();
    });
  });

  it('shows tenant and project selectors', async () => {
    render(<SchemaWorkspacePage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/select tenant/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/select project/i)).toBeInTheDocument();
    });
  });

  it('calls listProjects when tenant selected from context', async () => {
    const { listProjects } = require('@lib/api/rest-client');
    render(<SchemaWorkspacePage />);
    await waitFor(() => {
      expect(listProjects).toHaveBeenCalledWith('t1', expect.anything());
    });
  });

  it('calls listVersions when project selected', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    render(<SchemaWorkspacePage />);
    await waitFor(() => {
      expect(listVersions).toHaveBeenCalledWith('t1', 'p1', expect.anything());
    });
  });

  it('shows left and right schema selectors when project is selected', async () => {
    render(<SchemaWorkspacePage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/left version/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/right version/i)).toBeInTheDocument();
    });
  });

  it('renders Load & compare button', async () => {
    render(<SchemaWorkspacePage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /load.*compare/i })).toBeInTheDocument();
    });
  });

  it('calls pullVersion for both slots when Load & compare is clicked with versions selected', async () => {
    const { pullVersion } = require('@lib/api/rest-client');
    pullVersion.mockResolvedValue(sampleVersionPullResponse);

    render(<SchemaWorkspacePage />);

    // Wait for version options to be populated
    await waitFor(() => {
      const leftSelect = screen.getByLabelText(/left version/i);
      expect(leftSelect.querySelectorAll('option[value="v1"]').length).toBeGreaterThan(0);
    });

    // Select versions
    const leftSelect = screen.getByLabelText(/left version/i);
    const rightSelect = screen.getByLabelText(/right version/i);
    await userEvent.selectOptions(leftSelect, 'v1');
    await userEvent.selectOptions(rightSelect, 'v1');

    // Click Load & compare
    const loadBtn = screen.getByRole('button', { name: /load.*compare/i });
    await userEvent.click(loadBtn);

    await waitFor(() => {
      expect(pullVersion).toHaveBeenCalledWith('v1', expect.anything(), undefined, undefined);
    });
  });

  it('shows diff summary after loading both schemas', async () => {
    const { pullVersion } = require('@lib/api/rest-client');
    const { compareSchemas } = require('@/app/dashboard/utils/compareSchemas');
    pullVersion.mockResolvedValue(sampleVersionPullResponse);
    compareSchemas.mockReturnValue({
      added_class_names: ['NewClass'],
      removed_class_names: [],
      modified_classes: [],
    });

    render(<SchemaWorkspacePage />);

    // Wait for version options to be populated
    await waitFor(() => {
      const leftSelect = screen.getByLabelText(/left version/i);
      expect(leftSelect.querySelectorAll('option[value="v1"]').length).toBeGreaterThan(0);
    });

    const leftSelect = screen.getByLabelText(/left version/i);
    const rightSelect = screen.getByLabelText(/right version/i);
    await userEvent.selectOptions(leftSelect, 'v1');
    await userEvent.selectOptions(rightSelect, 'v1');

    const loadBtn = screen.getByRole('button', { name: /load.*compare/i });
    await userEvent.click(loadBtn);

    await waitFor(() => {
      expect(screen.getByText(/diff.*left.*right/i)).toBeInTheDocument();
    });
  });

  it('shows no-tenant message when there are no tenants', async () => {
    const { useTenantSelection } = require('@/app/contexts/TenantSelectionContext');
    useTenantSelection.mockReturnValue({
      tenants: [],
      tenantsLoading: false,
      selectedTenantId: null,
      setSelectedTenantId: jest.fn(),
    });
    render(<SchemaWorkspacePage />);
    await waitFor(() => {
      expect(screen.getByText(/select a tenant to compare schemas/i)).toBeInTheDocument();
    });
  });
});
