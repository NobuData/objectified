import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionsPage from '../../../src/app/dashboard/versions/VersionsPageClient';

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

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
  createVersion: jest.fn(),
  updateVersion: jest.fn(),
  deleteVersion: jest.fn(),
  publishVersion: jest.fn(),
  unpublishVersion: jest.fn(),
  listVersionPublishHistory: jest.fn(() => Promise.resolve([])),
  mergePreview: jest.fn(),
  listVersionSnapshotsMetadata: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
  isForbiddenError: jest.fn(() => false),
  getTenantQuotaStatus: jest.fn(() =>
    Promise.resolve({
      max_projects: null,
      active_project_count: 0,
      max_versions_per_project: null,
      active_version_count_for_project: 0,
    })
  ),
  VERSION_PUBLISH_TARGETS: ['development', 'staging', 'production'],
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

const sampleVersion = {
  id: 'v1',
  project_id: 'p1',
  source_version_id: null as string | null,
  creator_id: 'user1',
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

const sampleVersionTwo = {
  id: 'v2',
  project_id: 'p1',
  source_version_id: 'v1',
  creator_id: 'user1',
  name: 'v2.0.0',
  description: 'Second version',
  change_log: '',
  enabled: true,
  published: true,
  published_at: '2026-01-02T00:00:00Z',
  visibility: 'private',
  metadata: {},
  created_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-03T00:00:00Z',
};

describe('VersionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
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

  afterEach(async () => {
    // Flush any pending microtasks/state updates to prevent act() warnings
    // from cascading into the next test.
    await act(async () => {
      await Promise.resolve();
    });
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

  it('shows initial loading progress while first version load is pending', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    let resolveVersions!: (value: unknown[]) => void;
    listVersions.mockReturnValue(
      new Promise((resolve) => {
        resolveVersions = resolve;
      })
    );
    render(<VersionsPage />);
    expect(
      await screen.findByRole('progressbar', { name: /versions initial load progress/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/initial load/i)).toBeInTheDocument();
    await act(async () => {
      resolveVersions([]);
      await Promise.resolve();
    });
  });

  it('falls back to cached drafts and exposes retry when versions API fails', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockRejectedValue(new Error('Network unavailable'));
    window.localStorage.setItem(
      'objectified:dashboard:versions:draft-cache:v1:t1:p1',
      JSON.stringify({
        tenantId: 't1',
        projectId: 'p1',
        savedAt: '2026-03-21T00:00:00.000Z',
        versions: [sampleVersion],
      })
    );
    render(<VersionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/cached draft version/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('shows Version history menu item in version actions dropdown', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([sampleVersion]);
    render(<VersionsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /version actions/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /version actions/i }));
    await waitFor(() => {
      expect(screen.getByText(/version history/i)).toBeInTheDocument();
    });
  });

  it('filters versions by search text', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([sampleVersion, sampleVersionTwo]);
    render(<VersionsPage />);
    const search = await screen.findByRole('searchbox', { name: /search versions/i });
    await userEvent.type(search, 'Second version');
    await waitFor(() => {
      expect(screen.getByText('v2.0.0')).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(2);
    });
  });

  it('opens version history dialog and calls listVersionSnapshotsMetadata when Version history is selected', async () => {
    const { listVersions, listVersionSnapshotsMetadata } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([sampleVersion]);
    listVersionSnapshotsMetadata.mockResolvedValue([]);
    render(<VersionsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /version actions/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /version actions/i }));
    await waitFor(() => {
      expect(screen.getByText(/version history/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/version history/i));
    await waitFor(() => {
      expect(listVersionSnapshotsMetadata).toHaveBeenCalledWith('v1', expect.anything());
    });
  });

  it('selects a version row via checkbox and shows bulk action bar', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([sampleVersion, sampleVersionTwo]);
    render(<VersionsPage />);
    const checkbox = await screen.findByRole('checkbox', {
      name: /select version v1\.0\.0/i,
    });
    await userEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 selected');
    });
  });

  it('bulk publish calls publishVersion for each draft version in selection and clears selection', async () => {
    const { listVersions, publishVersion } = require('@lib/api/rest-client');
    const { useDialog } = require('@/app/components/providers/DialogProvider');
    useDialog.mockReturnValue({
      confirm: jest.fn(() => Promise.resolve(true)),
      alert: jest.fn(() => Promise.resolve()),
    });
    publishVersion.mockResolvedValue({});
    listVersions.mockResolvedValue([sampleVersion, sampleVersionTwo]);
    render(<VersionsPage />);
    const checkbox = await screen.findByRole('checkbox', {
      name: /select version v1\.0\.0/i,
    });
    await userEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 selected');
    });
    const publishBtn = screen.getByRole('button', { name: /publish \(private\)/i });
    await userEvent.click(publishBtn);
    await waitFor(() => {
      expect(publishVersion).toHaveBeenCalledWith(
        'v1',
        { visibility: 'private', target: 'production' },
        expect.anything()
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  it('bulk unpublish calls unpublishVersion for each published version in selection and clears selection', async () => {
    const { listVersions, unpublishVersion } = require('@lib/api/rest-client');
    const { useDialog } = require('@/app/components/providers/DialogProvider');
    useDialog.mockReturnValue({
      confirm: jest.fn(() => Promise.resolve(true)),
      alert: jest.fn(() => Promise.resolve()),
    });
    unpublishVersion.mockResolvedValue({});
    listVersions.mockResolvedValue([sampleVersion, sampleVersionTwo]);
    render(<VersionsPage />);
    const checkbox = await screen.findByRole('checkbox', {
      name: /select version v2\.0\.0/i,
    });
    await userEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 selected');
    });
    const unpublishBtn = screen.getByRole('button', { name: /unpublish/i });
    await userEvent.click(unpublishBtn);
    await waitFor(() => {
      expect(unpublishVersion).toHaveBeenCalledWith('v2', expect.anything());
    });
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  it('bulk delete (archive) calls deleteVersion for each selected version and clears selection', async () => {
    const { listVersions, deleteVersion } = require('@lib/api/rest-client');
    const { useDialog } = require('@/app/components/providers/DialogProvider');
    useDialog.mockReturnValue({
      confirm: jest.fn(() => Promise.resolve(true)),
      alert: jest.fn(() => Promise.resolve()),
    });
    deleteVersion.mockResolvedValue({});
    listVersions.mockResolvedValue([sampleVersion, sampleVersionTwo]);
    render(<VersionsPage />);
    const checkboxV1 = await screen.findByRole('checkbox', {
      name: /select version v1\.0\.0/i,
    });
    await userEvent.click(checkboxV1);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 selected');
    });
    const archiveBtn = screen.getByRole('button', { name: /^archive$/i });
    await userEvent.click(archiveBtn);
    await waitFor(() => {
      expect(deleteVersion).toHaveBeenCalledWith('v1', expect.anything());
    });
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  it('bulk action buttons are disabled while operation is in flight', async () => {
    const { listVersions, publishVersion } = require('@lib/api/rest-client');
    const { useDialog } = require('@/app/components/providers/DialogProvider');
    let resolvePublish!: () => void;
    const pendingPublish = new Promise<void>((resolve) => {
      resolvePublish = resolve;
    });
    useDialog.mockReturnValue({
      confirm: jest.fn(() => Promise.resolve(true)),
      alert: jest.fn(() => Promise.resolve()),
    });
    publishVersion.mockReturnValue(pendingPublish.then(() => ({})));
    listVersions.mockResolvedValue([sampleVersion]);
    render(<VersionsPage />);
    const checkbox = await screen.findByRole('checkbox', {
      name: /select version v1\.0\.0/i,
    });
    await userEvent.click(checkbox);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 selected');
    });
    const publishBtn = screen.getByRole('button', { name: /publish \(private\)/i });
    void userEvent.click(publishBtn);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /publish \(private\)/i })).toBeDisabled();
    });
    resolvePublish();
  });

  it('opens publish dialog with default channel production and note field', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([sampleVersion]);
    render(<VersionsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /version actions/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /version actions/i }));
    await waitFor(() => {
      expect(screen.getByText(/^publish…$/i)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/^publish…$/i));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /publish version/i })).toBeInTheDocument();
    });
    const channelSelect = screen.getByRole('combobox', { name: /publish channel/i });
    expect(channelSelect).toHaveValue('production');
    expect(screen.getByPlaceholderText(/changelog or release note/i)).toBeInTheDocument();
  });

  it('publish dialog sends non-default channel and publish_note to publishVersion', async () => {
    const { listVersions, publishVersion } = require('@lib/api/rest-client');
    const { useDialog } = require('@/app/components/providers/DialogProvider');
    useDialog.mockReturnValue({
      confirm: jest.fn(() => Promise.resolve(true)),
      alert: jest.fn(() => Promise.resolve()),
    });
    publishVersion.mockResolvedValue({});
    listVersions.mockResolvedValue([sampleVersion]);
    render(<VersionsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /version actions/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /version actions/i }));
    await waitFor(() => expect(screen.getByText(/^publish…$/i)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/^publish…$/i));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /publish version/i })).toBeInTheDocument()
    );
    const channelSelect = screen.getByRole('combobox', { name: /publish channel/i });
    await userEvent.selectOptions(channelSelect, 'staging');
    const noteArea = screen.getByPlaceholderText(/changelog or release note/i);
    await userEvent.type(noteArea, 'My release note');
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    await waitFor(() => {
      expect(publishVersion).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ target: 'staging', publish_note: 'My release note' }),
        expect.anything()
      );
    });
  });

  it('opens publish history dialog and calls listVersionPublishHistory', async () => {
    const { listVersions, listVersionPublishHistory } = require('@lib/api/rest-client');
    listVersionPublishHistory.mockResolvedValue([]);
    listVersions.mockResolvedValue([sampleVersion]);
    render(<VersionsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /version actions/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /version actions/i }));
    await waitFor(() => expect(screen.getByText(/publish history/i)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/publish history/i));
    await waitFor(() => {
      expect(listVersionPublishHistory).toHaveBeenCalledWith('v1', expect.anything());
    });
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /publish history/i })).toBeInTheDocument();
    });
  });

  it('renders publish history events in the history dialog', async () => {
    const { listVersions, listVersionPublishHistory } = require('@lib/api/rest-client');
    listVersionPublishHistory.mockResolvedValue([
      {
        id: 'ev1',
        version_id: 'v1',
        project_id: 'p1',
        event_type: 'publish',
        target: 'staging',
        visibility: 'private',
        note: 'Initial release',
        actor_id: 'user1',
        actor_name: 'User One',
        actor_email: 'user1@example.com',
        created_at: '2026-01-05T10:00:00Z',
      },
    ]);
    listVersions.mockResolvedValue([sampleVersion]);
    render(<VersionsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /version actions/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /version actions/i }));
    await waitFor(() => expect(screen.getByText(/publish history/i)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/publish history/i));
    await waitFor(() => {
      expect(screen.getByText('Published')).toBeInTheDocument();
      expect(screen.getByText(/staging/)).toBeInTheDocument();
      expect(screen.getByText(/Initial release/)).toBeInTheDocument();
    });
  });

  it('shows Export published list (CSV) button when published filter is active', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([{ ...sampleVersionTwo, publish_target: 'production' }]);
    render(<VersionsPage />);
    await waitFor(() => expect(screen.getByLabelText(/filter by status/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'published');
    await waitFor(() => {
      expect(screen.getByText(/export published list \(csv\)/i)).toBeInTheDocument();
    });
  });

  it('calls downloadCsvFile helper when Export published CSV is clicked', async () => {
    const { listVersions } = require('@lib/api/rest-client');
    listVersions.mockResolvedValue([{ ...sampleVersionTwo, publish_target: 'production' }]);
    // jsdom does not implement URL.createObjectURL or anchor click navigation; install mocks.
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const mockCreateObjectURL = jest.fn().mockReturnValue('blob:test');
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = jest.fn();
    const anchorClickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    render(<VersionsPage />);
    await waitFor(() => expect(screen.getByLabelText(/filter by status/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'published');
    const exportBtn = await screen.findByText(/export published list \(csv\)/i);
    await userEvent.click(exportBtn);
    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
    anchorClickSpy.mockRestore();
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });
});
