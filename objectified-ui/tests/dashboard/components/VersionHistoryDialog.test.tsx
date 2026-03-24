/**
 * Unit tests for VersionHistoryDialog: delete version flow.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionHistoryDialog from '@/app/dashboard/components/VersionHistoryDialog';

const emptyHistoryPage = { items: [] as unknown[], total: 0, latest_revision: null };
const mockListVersionSnapshotsMetadata = jest.fn(() => Promise.resolve(emptyHistoryPage));
const mockListVersionSnapshotsSchemaChanges = jest.fn(() => Promise.resolve([]));
const mockListVersionHistory = jest.fn(() => Promise.resolve([]));
const mockListVersionSnapshots = jest.fn(() => Promise.resolve([]));
const mockDeleteVersion = jest.fn(() => Promise.resolve());
const mockGetVersion = jest.fn(() =>
  Promise.resolve({
    id: 'v1',
    project_id: 'p1',
    last_revision: 2,
  })
);
const mockListVersions = jest.fn(() => Promise.resolve([]));
const mockPullVersion = jest.fn(() =>
  Promise.resolve({
    diff: {
      added_class_names: [],
      removed_class_names: ['Old'],
      modified_classes: [],
    },
  })
);
const mockRollbackVersion = jest.fn(() => Promise.resolve());
const mockAlert = jest.fn(() => Promise.resolve());

jest.mock('@lib/api/rest-client', () => ({
  listVersionSnapshotsMetadata: (...args: unknown[]) =>
    mockListVersionSnapshotsMetadata(...args),
  listVersionSnapshotsSchemaChanges: (...args: unknown[]) =>
    mockListVersionSnapshotsSchemaChanges(...args),
  listVersionHistory: (...args: unknown[]) => mockListVersionHistory(...args),
  listVersionSnapshots: (...args: unknown[]) => mockListVersionSnapshots(...args),
  deleteVersion: (...args: unknown[]) => mockDeleteVersion(...args),
  getVersion: (...args: unknown[]) => mockGetVersion(...args),
  listVersions: (...args: unknown[]) => mockListVersions(...args),
  pullVersion: (...args: unknown[]) => mockPullVersion(...args),
  rollbackVersion: (...args: unknown[]) => mockRollbackVersion(...args),
  createVersionFromRevision: jest.fn(() => Promise.resolve({ id: 'new-v' })),
  getTenantQuotaStatus: jest.fn(() =>
    Promise.resolve({
      max_projects: null,
      active_project_count: 0,
      max_versions_per_project: null,
      active_version_count_for_project: 0,
    })
  ),
}));

const mockConfirm = jest.fn(() => Promise.resolve(true));
jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: mockConfirm,
    alert: mockAlert,
  })),
}));

const defaultProps = {
  open: true,
  onOpenChange: jest.fn(),
  versionId: 'v1',
  versionName: 'My Version',
  options: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
  mockAlert.mockResolvedValue(undefined);
  mockDeleteVersion.mockResolvedValue(undefined);
  mockGetVersion.mockResolvedValue({
    id: 'v1',
    project_id: 'p1',
    last_revision: 2,
  });
  mockListVersions.mockResolvedValue([]);
  mockListVersionSnapshotsMetadata.mockResolvedValue(emptyHistoryPage);
  mockListVersionSnapshotsSchemaChanges.mockResolvedValue([]);
  mockListVersionHistory.mockResolvedValue([]);
  mockListVersionSnapshots.mockResolvedValue([]);
  mockPullVersion.mockResolvedValue({
    diff: {
      added_class_names: [],
      removed_class_names: ['Old'],
      modified_classes: [],
    },
  });
  mockRollbackVersion.mockResolvedValue(undefined);
});

describe('VersionHistoryDialog – archive version', () => {
  it('shows Archive version button when onDeleteSuccess is provided', async () => {
    render(
      <VersionHistoryDialog
        {...defaultProps}
        onDeleteSuccess={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /archive this version/i })
      ).toBeInTheDocument();
    });
  });

  it('does not show Archive version button when onDeleteSuccess is not provided', async () => {
    render(<VersionHistoryDialog {...defaultProps} />);
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /archive this version/i })
      ).not.toBeInTheDocument();
    });
  });

  it('calls deleteVersion and onDeleteSuccess after user confirms', async () => {
    const onDeleteSuccess = jest.fn(() => Promise.resolve());
    const onOpenChange = jest.fn();
    render(
      <VersionHistoryDialog
        {...defaultProps}
        onOpenChange={onOpenChange}
        onDeleteSuccess={onDeleteSuccess}
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: /archive this version/i })
    );

    await waitFor(() => {
      expect(mockGetVersion).toHaveBeenCalledWith('v1', {});
    });

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Archive version',
          variant: 'danger',
          confirmLabel: 'Archive',
        })
      );
    });

    await waitFor(() => {
      expect(mockDeleteVersion).toHaveBeenCalledWith('v1', {});
    });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onDeleteSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('awaits async onDeleteSuccess before completing', async () => {
    const order: string[] = [];
    const onDeleteSuccess = jest.fn(async () => {
      order.push('callback-start');
      await Promise.resolve();
      order.push('callback-end');
    });
    mockDeleteVersion.mockImplementation(async () => {
      order.push('delete');
    });

    render(
      <VersionHistoryDialog
        {...defaultProps}
        onDeleteSuccess={onDeleteSuccess}
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: /archive this version/i })
    );

    await waitFor(() => expect(mockGetVersion).toHaveBeenCalled());
    await waitFor(() => expect(onDeleteSuccess).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['delete', 'callback-start', 'callback-end']);
  });

  it('does not call deleteVersion when user cancels the confirmation', async () => {
    mockConfirm.mockResolvedValueOnce(false);
    const onDeleteSuccess = jest.fn();
    render(
      <VersionHistoryDialog
        {...defaultProps}
        onDeleteSuccess={onDeleteSuccess}
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: /archive this version/i })
    );

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
    });

    expect(mockDeleteVersion).not.toHaveBeenCalled();
    expect(onDeleteSuccess).not.toHaveBeenCalled();
  });

  it('shows error message when deleteVersion rejects', async () => {
    mockDeleteVersion.mockRejectedValueOnce(new Error('Server error'));
    const onDeleteSuccess = jest.fn();
    render(
      <VersionHistoryDialog
        {...defaultProps}
        onDeleteSuccess={onDeleteSuccess}
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: /archive this version/i })
    );

    await waitFor(() => {
      expect(mockGetVersion).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });

    expect(onDeleteSuccess).not.toHaveBeenCalled();
  });
});

describe('VersionHistoryDialog – schema audit', () => {
  it('loads and renders schema audit when toggled on', async () => {
    mockListVersionSnapshotsMetadata.mockResolvedValue({
      items: [
        {
          id: 'snap-1',
          version_id: 'v1',
          project_id: 'p1',
          committed_by: 'user-1',
          revision: 1,
          label: 'initial',
          description: 'first',
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
      latest_revision: 1,
    });

    mockListVersionSnapshotsSchemaChanges.mockResolvedValue([
      {
        id: 'snap-1',
        version_id: 'v1',
        project_id: 'p1',
        committed_by: 'user-1',
        revision: 1,
        label: 'initial',
        description: 'first',
        created_at: new Date().toISOString(),
        diff: {
          added_class_names: ['Person'],
          removed_class_names: [],
          modified_classes: [],
        },
      },
    ]);

    render(<VersionHistoryDialog {...defaultProps} />);

    const toggleButton = await waitFor(() =>
      screen.getByRole('button', { name: /show schema audit/i })
    );
    await userEvent.click(toggleButton);

    await waitFor(() => {
      expect(mockListVersionSnapshotsSchemaChanges).toHaveBeenCalledWith('v1', {});
    });

    expect(await screen.findByText(/added:/i)).toBeInTheDocument();
    expect(screen.getByText(/person/i)).toBeInTheDocument();
  });
});

describe('VersionHistoryDialog – compliance (GitHub #222)', () => {
  it('shows retention notice from API when configured', async () => {
    mockListVersionSnapshotsMetadata.mockResolvedValue({
      items: [],
      total: 0,
      latest_revision: null,
      retention_notice: 'Revisions older than 90 days may be archived.',
    });
    render(<VersionHistoryDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByRole('note')).toHaveTextContent(
        /Revisions older than 90 days may be archived/
      );
    });
  });

  it('shows optional compliance export controls when expanded', async () => {
    mockListVersionSnapshotsMetadata.mockResolvedValue({
      items: [
        {
          id: 'snap-1',
          version_id: 'v1',
          project_id: 'p1',
          committed_by: 'user-1',
          revision: 1,
          label: 'initial',
          description: 'first',
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
      latest_revision: 1,
    });
    render(<VersionHistoryDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Compliance export \(optional\)/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText(/Compliance export \(optional\)/));
    expect(
      screen.getByRole('button', { name: /Revision index \(metadata\)/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Version row audit/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Full state per revision/i })
    ).toBeInTheDocument();
  });
});

describe('VersionHistoryDialog – rollback', () => {
  it('hides rollback actions when canRollback is false', async () => {
    mockListVersionSnapshotsMetadata.mockResolvedValue({
      items: [
        {
          id: 'snap-1',
          version_id: 'v1',
          project_id: 'p1',
          committed_by: 'user-1',
          revision: 1,
          label: 'initial',
          description: 'first',
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
      latest_revision: 2,
    });

    render(
      <VersionHistoryDialog
        {...defaultProps}
        onRollbackSuccess={jest.fn()}
        canRollback={false}
        rollbackDisabledReason="No permission"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/no permission/i)).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: /rollback to revision 1/i })
    ).not.toBeInTheDocument();
  });

  it('loads pull diff and confirms rollback with summary and success alert', async () => {
    const onRollbackSuccess = jest.fn();
    mockListVersionSnapshotsMetadata.mockResolvedValue({
      items: [
        {
          id: 'snap-1',
          version_id: 'v1',
          project_id: 'p1',
          committed_by: 'user-1',
          revision: 1,
          label: 'initial',
          description: 'first',
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
      latest_revision: 2,
    });

    render(
      <VersionHistoryDialog
        {...defaultProps}
        onRollbackSuccess={onRollbackSuccess}
        canRollback
      />
    );

    const rollbackBtn = await screen.findByRole('button', {
      name: /rollback to revision 1/i,
    });
    await userEvent.click(rollbackBtn);

    await waitFor(() => {
      expect(mockPullVersion).toHaveBeenCalledWith('v1', {}, null, 1);
    });

    expect(
      await screen.findByText(/1 class will change/i)
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /restore to this revision/i })
    );

    await waitFor(() => {
      expect(mockRollbackVersion).toHaveBeenCalledWith(
        'v1',
        { revision: 1 },
        {}
      );
      expect(onRollbackSuccess).toHaveBeenCalledTimes(1);
      expect(mockAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'success',
          title: 'Rollback complete',
        })
      );
    });
  });
});
