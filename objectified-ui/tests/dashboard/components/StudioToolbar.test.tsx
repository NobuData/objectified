/**
 * Unit tests for StudioToolbar: visibility, button states, and keyboard shortcuts.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudioToolbar from '@/app/dashboard/components/StudioToolbar';
import { CodeGenerationPanelProvider } from '@/app/contexts/CodeGenerationPanelContext';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { accessToken: 'token' } }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockListVersionSnapshotsMetadata = jest.fn(() =>
  Promise.resolve({ items: [], total: 0, latest_revision: null })
);
const mockGetTenantQuotaStatus = jest.fn(() =>
  Promise.resolve({
    max_projects: null,
    active_project_count: 0,
    max_versions_per_project: null,
    active_version_count_for_project: 0,
  })
);
const mockPullVersion = jest.fn(() =>
  Promise.resolve({
    version_id: 'v2',
    revision: 1,
    pulled_at: '2026-03-22T00:00:00Z',
    diff: null,
  })
);
const mockListVersions = jest.fn(() =>
  Promise.resolve([
    { id: 'v1', name: 'Current' },
    { id: 'v2', name: 'Target' },
  ])
);
jest.mock('@lib/api/rest-client', () => ({
  getRestClientOptions: () => ({}),
  pullVersion: (...args: unknown[]) => mockPullVersion(...args),
  listVersions: (...args: unknown[]) => mockListVersions(...args),
  listVersionSnapshotsMetadata: (...args: unknown[]) => mockListVersionSnapshotsMetadata(...args),
  listVersionSnapshots: jest.fn(() => Promise.resolve([])),
  getTenantQuotaStatus: (...args: unknown[]) => mockGetTenantQuotaStatus(...args),
}));

const mockUndo = jest.fn();
const mockRedo = jest.fn();
const mockSave = jest.fn();
const mockLoadFromServer = jest.fn(() =>
  Promise.resolve({ status: 'loaded' as const, revision: 1 })
);
const mockPeekPullIfNoneMatch = jest.fn(() => undefined);
const mockCheckServerForUpdates = jest.fn();
const mockPush = jest.fn();
const mockMerge = jest.fn();
const mockClearPushConflict409 = jest.fn();

jest.mock('@/app/contexts/StudioContext', () => ({
  useStudioOptional: jest.fn(),
  useStudio: jest.fn(),
}));

jest.mock('@/app/contexts/WorkspaceContext', () => ({
  useWorkspaceOptional: jest.fn(() => ({
    tenant: { id: 't1' },
    project: { id: 'p1' },
    version: { id: 'v1' },
  })),
}));
jest.mock('@/app/hooks/useTenantPermissions', () => ({
  useTenantPermissions: jest.fn(() => ({
    loading: false,
    permissions: { is_tenant_admin: false },
    has: (key: string) => key === 'schema:read' || key === 'schema:write',
  })),
}));

const mockConfirm = jest.fn(() => Promise.resolve(true));
const mockAlert = jest.fn(() => Promise.resolve());
jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: mockConfirm,
    alert: mockAlert,
  })),
}));

const { useStudioOptional, useStudio } =
  require('@/app/contexts/StudioContext') as {
    useStudioOptional: jest.Mock;
    useStudio: jest.Mock;
  };
const { useTenantPermissions } = require('@/app/hooks/useTenantPermissions') as {
  useTenantPermissions: jest.Mock;
};

const studioState = {
  versionId: 'v1',
  revision: 1,
  classes: [],
  properties: [],
  canvas_metadata: null,
  groups: [],
};

describe('StudioToolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    useTenantPermissions.mockReturnValue({
      loading: false,
      permissions: { is_tenant_admin: false },
      has: (key: string) => key === 'schema:read' || key === 'schema:write',
    });
    mockConfirm.mockResolvedValue(true);
    mockPullVersion.mockResolvedValue({
      version_id: 'v2',
      revision: 1,
      pulled_at: '2026-03-22T00:00:00Z',
      diff: null,
    });
    mockPush.mockResolvedValue([]);
    useStudioOptional.mockReturnValue(null);
    useStudio.mockImplementation(() => useStudioOptional());
  });

  it('renders only Canvas button when studio context is null', () => {
    const { getByRole, queryByRole } = render(<StudioToolbar />);
    expect(getByRole('button', { name: /canvas settings/i })).toBeInTheDocument();
    expect(queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });

  it('renders only Canvas button when studio has no state', () => {
    useStudioOptional.mockReturnValue({
      state: null,
      loading: false,
      error: null,
      undo: mockUndo,
      redo: mockRedo,
      save: mockSave,
      canUndo: false,
      canRedo: false,
      isDirty: false,
      hasUnpushedCommits: false,
      unpushedCommitCount: 0,
      lastPushedAt: null,
      serverHeadRevision: null,
      serverHasNewChanges: false,
      checkServerForUpdates: mockCheckServerForUpdates,
      loadFromServer: mockLoadFromServer,
      peekPullIfNoneMatch: mockPeekPullIfNoneMatch,
      push: mockPush,
      merge: mockMerge,
      pushConflict409: false,
      clearPushConflict409: mockClearPushConflict409,
    });
    const { getByRole, queryByRole } = render(<StudioToolbar />);
    expect(getByRole('button', { name: /canvas settings/i })).toBeInTheDocument();
    expect(queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });

  it('renders Undo, Redo, Commit, Reset, Push, Pull, Merge when studio has state', () => {
    useStudioOptional.mockReturnValue({
      state: studioState,
      loading: false,
      error: null,
      undo: mockUndo,
      redo: mockRedo,
      save: mockSave,
      canUndo: false,
      canRedo: false,
      isDirty: false,
      hasUnpushedCommits: false,
      unpushedCommitCount: 0,
      lastPushedAt: null,
      serverHeadRevision: 1,
      serverHasNewChanges: false,
      checkServerForUpdates: mockCheckServerForUpdates,
      loadFromServer: mockLoadFromServer,
      peekPullIfNoneMatch: mockPeekPullIfNoneMatch,
      push: mockPush,
      merge: mockMerge,
      pushConflict409: false,
      clearPushConflict409: mockClearPushConflict409,
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reset to last committed state/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /push to another version/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /pull from server/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /merge from another version/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /version history/i })
    ).toBeInTheDocument();
  });

  it('opens version history dialog when History is clicked', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    mockListVersionSnapshotsMetadata.mockResolvedValueOnce({
      items: [
        {
          id: 'snap-1',
          version_id: 'v1',
          project_id: 'p1',
          committed_by: null,
          revision: 1,
          label: 'Initial',
          description: null,
          created_at: '2026-03-01T12:00:00Z',
        },
      ],
      total: 1,
      latest_revision: 1,
    });
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /version history/i })
    );
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /version history/i })).toBeInTheDocument();
    });
    expect(mockListVersionSnapshotsMetadata).toHaveBeenCalledWith(
      'v1',
      {},
      expect.objectContaining({ limit: 25, offset: 0 })
    );
  });

  it('version history Load to edit calls loadFromServer with revision and readOnly false', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    mockListVersionSnapshotsMetadata.mockResolvedValueOnce({
      items: [
        {
          id: 'snap-1',
          version_id: 'v1',
          project_id: 'p1',
          committed_by: null,
          revision: 1,
          label: 'Initial',
          description: null,
          created_at: '2026-03-01T12:00:00Z',
        },
      ],
      total: 1,
      latest_revision: 1,
    });
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /version history/i })
    );
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /version history/i })).toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByRole('button', { name: /load revision 1 to edit/i })
    );
    expect(mockLoadFromServer).toHaveBeenCalledWith('v1', {}, {
      revision: 1,
      readOnly: false,
      tenantId: 't1',
      projectId: 'p1',
    });
  });

  it('shows Load latest and read-only indicator when state.readOnly is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      state: { ...studioState, readOnly: true },
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('button', { name: /load latest/i })).toBeInTheDocument();
    expect(screen.getByText(/revision 1 \(read-only\)/i)).toBeInTheDocument();
  });

  it('shows ? as fallback in read-only indicator when revision is null', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      state: { ...studioState, revision: null, readOnly: true },
    });
    render(<StudioToolbar />);
    expect(screen.getByText(/revision \? \(read-only\)/i)).toBeInTheDocument();
  });

  const defaultStudioWithState = {
    state: studioState,
    loading: false,
    error: null,
    undo: mockUndo,
    redo: mockRedo,
    save: mockSave,
    canUndo: false,
    canRedo: false,
    isDirty: false,
    hasUnpushedCommits: false,
    unpushedCommitCount: 0,
    lastPushedAt: null,
    serverHeadRevision: 1,
    serverHasNewChanges: false,
    checkServerForUpdates: mockCheckServerForUpdates,
    loadFromServer: mockLoadFromServer,
    peekPullIfNoneMatch: mockPeekPullIfNoneMatch,
    push: mockPush,
    merge: mockMerge,
    pushConflict409: false,
    clearPushConflict409: mockClearPushConflict409,
    mutationAudit: {
      addedClassCount: 0,
      removedClassCount: 0,
      modifiedClassCount: 0,
      modifiedGroupCount: 0,
      projectPropertiesChanged: false,
      canvasMetadataChanged: false,
    },
    pendingChangesSummary: null,
    suggestedCommitMessage: null,
    lastCommitInfo: null,
  };

  it('shows past revision banner when loaded revision is behind server head', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      state: { ...studioState, revision: 2 },
      serverHeadRevision: 5,
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('alert')).toHaveTextContent(/viewing a past revision/i);
    expect(screen.getByRole('button', { name: /load latest to edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /compare with current/i })).toBeInTheDocument();
  });

  it('calls undo when Undo is clicked', async () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canUndo: true,
    });
    render(<StudioToolbar />);
    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(mockUndo).toHaveBeenCalledTimes(1);
  });

  it('calls redo when Redo is clicked', async () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canRedo: true,
    });
    render(<StudioToolbar />);
    await userEvent.click(screen.getByRole('button', { name: /redo/i }));
    expect(mockRedo).toHaveBeenCalledTimes(1);
  });

  it('opens commit dialog when Commit is clicked', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    expect(screen.getByRole('dialog', { name: /commit/i })).toBeInTheDocument();
  });

  it('submitting commit dialog calls studio.save with the typed message', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    const input = screen.getByRole('textbox', { name: /commit message/i });
    await userEvent.type(input, 'my commit message');
    await userEvent.click(screen.getByRole('button', { name: /^commit$/i }));
    expect(mockSave).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'my commit message' })
    );
  });

  it('submitting commit dialog with external id adds traceability text and passes external id', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    await userEvent.type(screen.getByRole('textbox', { name: /commit message/i }), 'my commit message');
    await userEvent.type(screen.getByRole('textbox', { name: /commit external id/i }), 'ticket-212');
    await userEvent.click(screen.getByRole('button', { name: /^commit$/i }));
    expect(mockSave).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: 'my commit message [external:ticket-212]',
        externalId: 'ticket-212',
      })
    );
  });

  it('requires commit message when requirement toggle is enabled', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /require commit message/i }));
    const commitButton = screen.getByRole('button', { name: /^commit$/i });
    expect(commitButton).toBeDisabled();
    expect(screen.getByText(/commit message is required/i)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: /commit message/i }), 'required message');
    expect(screen.getByRole('button', { name: /^commit$/i })).toBeEnabled();
  });

  it('shows pending changes summary and pre-fills suggested commit message', async () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      pendingChangesSummary: '3 classes modified',
      suggestedCommitMessage: 'Update studio: 3 classes modified',
    });
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    expect(screen.getByText(/pending changes: 3 classes modified/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /commit message/i })).toHaveValue(
      'Update studio: 3 classes modified'
    );
  });

  it('shows pre-commit validation summary with commit-anyway option when warnings exist', async () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      state: {
        ...studioState,
        classes: [
          { name: 'User', properties: [] },
          { name: 'user', properties: [] },
        ],
      },
    });
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    expect(screen.getByText(/pre-commit validation summary/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /commit anyway/i })).toBeInTheDocument();
  });

  it('commit dialog submit button is disabled while loading', async () => {
    // Render with loading=false so dialog can be opened
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    const { rerender } = render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    expect(screen.getByRole('dialog', { name: /commit/i })).toBeInTheDocument();
    // Switch to loading=true while dialog is open
    useStudioOptional.mockReturnValue({ ...defaultStudioWithState, loading: true });
    rerender(<StudioToolbar />);
    // When loading, button label changes to "Committing…" and is disabled
    expect(screen.getByRole('button', { name: /committing/i })).toBeDisabled();
    // The commit message input is also disabled
    expect(screen.getByRole('textbox', { name: /commit message/i })).toBeDisabled();
  });

  it('shows error when studio has error', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      error: 'Save failed',
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
  });

  it('disables Undo, Redo, and Commit when loading', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      loading: true,
      canUndo: true,
      canRedo: true,
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    ).toBeDisabled();
  });

  it('shows Dirty indicator when isDirty is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      isDirty: true,
    });
    render(<StudioToolbar />);
    expect(screen.getByText('Dirty')).toBeInTheDocument();
  });

  it('shows server has new changes indicator when serverHasNewChanges is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      serverHasNewChanges: true,
    });
    render(<StudioToolbar />);
    expect(screen.getByText('Server has new changes')).toBeInTheDocument();
  });

  it('shows unpushed count when hasUnpushedCommits is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      hasUnpushedCommits: true,
      unpushedCommitCount: 2,
    });
    render(<StudioToolbar />);
    expect(screen.getByText('2 unpushed')).toBeInTheDocument();
  });

  it('shows last commit message and revision indicator when available', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      lastCommitInfo: {
        revision: 7,
        committedAt: '2026-03-22T11:00:00Z',
        message: 'Ship it',
        externalId: 'ticket-212',
      },
    });
    render(<StudioToolbar />);
    expect(screen.getByText(/last commit r7: ship it/i)).toBeInTheDocument();
  });

  it('Pull when not dirty calls loadFromServer without confirm', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    const user = userEvent.setup();
    render(<StudioToolbar />);
    await user.click(screen.getByRole('button', { name: /pull from server/i }));
    expect(mockConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(mockLoadFromServer).toHaveBeenCalledTimes(1));
  });

  it('Pull when dirty opens stash/discard dialog; Discard and pull calls loadFromServer', async () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      isDirty: true,
    });
    const user = userEvent.setup();
    render(<StudioToolbar />);
    await user.click(screen.getByRole('button', { name: /pull from server/i }));
    expect(screen.getByText(/unsaved local changes/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^discard and pull$/i }));
    await waitFor(() => expect(mockLoadFromServer).toHaveBeenCalledTimes(1));
  });

  it('Pull when dirty and user cancels dialog does not call loadFromServer', async () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      isDirty: true,
    });
    const user = userEvent.setup();
    render(<StudioToolbar />);
    await user.click(screen.getByRole('button', { name: /pull from server/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(mockLoadFromServer).not.toHaveBeenCalled();
  });

  it('Undo button tooltip includes keyboard shortcut hint', () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    const undoBtn = screen.getByRole('button', { name: /undo/i });
    expect(undoBtn.getAttribute('title')).toMatch(/\+Z/);
  });

  it('Redo button tooltip includes keyboard shortcut hint', () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    const redoBtn = screen.getByRole('button', { name: /redo/i });
    expect(redoBtn.getAttribute('title')).toMatch(/\+Shift\+Z/);
  });

  it('Ctrl+Z keyboard shortcut calls undo when canUndo is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canUndo: true,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    expect(mockUndo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+Z keyboard shortcut calls redo when canRedo is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canRedo: true,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockRedo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Y keyboard shortcut calls redo when canRedo is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canRedo: true,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'y', ctrlKey: true });
    expect(mockRedo).toHaveBeenCalledTimes(1);
  });

  it('keyboard shortcut does not call undo when canUndo is false', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canUndo: false,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('keyboard shortcut does not call redo when canRedo is false', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canRedo: false,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockRedo).not.toHaveBeenCalled();
  });

  it('keyboard shortcuts are disabled when loading', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      loading: true,
      canUndo: true,
      canRedo: true,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockUndo).not.toHaveBeenCalled();
    expect(mockRedo).not.toHaveBeenCalled();
  });

  it('Ctrl+S keyboard shortcut opens commit dialog', () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: /commit/i })).toBeInTheDocument();
  });

  it('Ctrl+S always calls preventDefault even when commit is disabled', () => {
    useTenantPermissions.mockReturnValue({
      loading: false,
      permissions: { is_tenant_admin: false },
      has: () => false,
    });
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    document.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /commit/i })).not.toBeInTheDocument();
  });

  it('Ctrl+Shift+P always calls preventDefault even when push is disabled', () => {
    useTenantPermissions.mockReturnValue({
      loading: false,
      permissions: { is_tenant_admin: false },
      has: () => false,
    });
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    const event = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
    document.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('Ctrl+Shift+P keyboard shortcut opens push dialog', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'p', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('dialog', { name: /push to version/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/select target version/i)).toBeInTheDocument();
    });
  });

  it('disables commit, push, pull, and merge when user lacks schema permissions', () => {
    useTenantPermissions.mockReturnValue({
      loading: false,
      permissions: { is_tenant_admin: false },
      has: () => false,
    });
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    expect(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /push to another version/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /pull from server/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /merge from another version/i })).toBeDisabled();
  });

  it('shows "Checking permissions…" tooltip while tenant permissions are loading', () => {
    useTenantPermissions.mockReturnValue({
      loading: true,
      permissions: null,
      has: () => false,
    });
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    expect(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    ).toHaveAttribute('title', 'Checking permissions…');
    expect(
      screen.getByRole('button', { name: /push to another version/i })
    ).toHaveAttribute('title', 'Checking permissions…');
    expect(
      screen.getByRole('button', { name: /pull from server/i })
    ).toHaveAttribute('title', 'Checking permissions…');
    expect(
      screen.getByRole('button', { name: /merge from another version/i })
    ).toHaveAttribute('title', 'Checking permissions…');
  });

  it('shows committing progress indicator while commit request is in flight', async () => {
    let resolveSave: (() => void) | null = null;
    mockSave.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    await userEvent.click(screen.getByRole('button', { name: /^commit$/i }));
    expect(screen.getByText(/committing\.\.\./i)).toBeInTheDocument();
    resolveSave?.();
    await waitFor(() => {
      expect(screen.queryByText(/committing\.\.\./i)).not.toBeInTheDocument();
    });
  });

  it('disables Merge button when tenantId or projectId are empty', () => {
    const { useWorkspaceOptional } = require('@/app/contexts/WorkspaceContext') as {
      useWorkspaceOptional: jest.Mock;
    };
    useWorkspaceOptional.mockReturnValueOnce({
      tenant: { id: '' },
      project: { id: '' },
      version: { id: 'v1' },
    });
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    expect(
      screen.getByRole('button', { name: /merge from another version/i })
    ).toBeDisabled();
  });

  // ── Published read-only tests ────────────────────────────────────────────

  describe('published read-only mode (workspace.version.published === true)', () => {
    const { useWorkspaceOptional } = require('@/app/contexts/WorkspaceContext') as {
      useWorkspaceOptional: jest.Mock;
    };

    beforeEach(() => {
      useWorkspaceOptional.mockReturnValue({
        tenant: { id: 't1' },
        project: { id: 'p1' },
        version: { id: 'v1', published: true },
      });
      useStudioOptional.mockReturnValue({
        ...defaultStudioWithState,
        canUndo: true,
        canRedo: true,
      });
    });

    it('shows "Published (read-only)" indicator when version is published', () => {
      render(<StudioToolbar />);
      expect(screen.getByText(/published \(read-only\)/i)).toBeInTheDocument();
    });

    it('does not show "Published (read-only)" indicator when not published', () => {
      useWorkspaceOptional.mockReturnValue({
        tenant: { id: 't1' },
        project: { id: 'p1' },
        version: { id: 'v1', published: false },
      });
      useStudioOptional.mockReturnValue(defaultStudioWithState);
      render(<StudioToolbar />);
      expect(screen.queryByText(/published \(read-only\)/i)).not.toBeInTheDocument();
    });

    it('disables Undo button when version is published', () => {
      render(<StudioToolbar />);
      expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    });

    it('disables Redo button when version is published', () => {
      render(<StudioToolbar />);
      expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
    });

    it('disables Commit button when version is published', () => {
      render(<StudioToolbar />);
      expect(
        screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
      ).toBeDisabled();
    });

    it('disables Reset button when version is published', () => {
      render(<StudioToolbar />);
      expect(
        screen.getByRole('button', { name: /reset to last committed state/i })
      ).toBeDisabled();
    });

    it('disables Push button when version is published', () => {
      render(<StudioToolbar />);
      expect(
        screen.getByRole('button', { name: /push to another version/i })
      ).toBeDisabled();
    });

    it('disables Merge button when version is published', () => {
      render(<StudioToolbar />);
      expect(
        screen.getByRole('button', { name: /merge from another version/i })
      ).toBeDisabled();
    });

    it('Ctrl+Z keyboard shortcut does not trigger undo when version is published', () => {
      render(<StudioToolbar />);
      fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
      expect(mockUndo).not.toHaveBeenCalled();
    });

    it('Ctrl+Shift+Z keyboard shortcut does not trigger redo when version is published', () => {
      render(<StudioToolbar />);
      fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true });
      expect(mockRedo).not.toHaveBeenCalled();
    });

    it('Ctrl+Y keyboard shortcut does not trigger redo when version is published', () => {
      render(<StudioToolbar />);
      fireEvent.keyDown(document, { key: 'y', ctrlKey: true });
      expect(mockRedo).not.toHaveBeenCalled();
    });

    it('auto-closes commit dialog when version becomes published', async () => {
      const { useWorkspaceOptional: uwo } = require('@/app/contexts/WorkspaceContext') as {
        useWorkspaceOptional: jest.Mock;
      };
      // Start with non-published version so commit button is enabled
      uwo.mockReturnValue({
        tenant: { id: 't1' },
        project: { id: 'p1' },
        version: { id: 'v1', published: false },
      });
      useStudioOptional.mockReturnValue(defaultStudioWithState);
      const { rerender } = render(<StudioToolbar />);
      // Open the commit dialog
      await userEvent.click(
        screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
      );
      expect(screen.getByRole('dialog', { name: /commit/i })).toBeInTheDocument();
      // Simulate version becoming published
      uwo.mockReturnValue({
        tenant: { id: 't1' },
        project: { id: 'p1' },
        version: { id: 'v1', published: true },
      });
      rerender(<StudioToolbar />);
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /commit/i })).not.toBeInTheDocument();
      });
    });
  });

  it('toggles code preview panel when CodeGenerationPanelProvider wraps toolbar', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(
      <CodeGenerationPanelProvider>
        <StudioToolbar />
      </CodeGenerationPanelProvider>
    );
    const toggle = screen.getByRole('button', { name: /toggle code preview panel/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});
