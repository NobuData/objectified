/**
 * Unit tests for StudioVersionSync: render without crash; when workspace has version, load is triggered.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceProvider, useWorkspace } from '@/app/contexts/WorkspaceContext';
import { StudioProvider } from '@/app/contexts/StudioContext';
import StudioVersionSync from '@/app/dashboard/components/StudioVersionSync';
import { computeStateChecksum } from '@lib/studio/stateBackup';

const mockPullVersion = jest.fn();
const mockPullVersionWithEtag = jest.fn();
const mockListProperties = jest.fn();
const mockConfirm = jest.fn(() => Promise.resolve(true));

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { accessToken: 'token' } }),
}));

jest.mock('@lib/api/rest-client', () => ({
  getRestClientOptions: () => ({}),
  pullVersion: (...args: unknown[]) => mockPullVersion(...args),
  pullVersionWithEtag: (...args: unknown[]) => mockPullVersionWithEtag(...args),
  buildPullEtag: () => 'W/"m"',
  listProperties: (...args: unknown[]) => mockListProperties(...args),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: () => ({
    confirm: (...args: unknown[]) => mockConfirm(...args),
  }),
}));

function SetVersionButton() {
  const workspace = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => {
        workspace.setTenant({ id: 't1', name: 'T1' } as never);
        workspace.setProject({ id: 'p1', name: 'P1' } as never);
        workspace.setVersion({ id: 'v1', name: 'V1' } as never);
      }}
    >
      Set version
    </button>
  );
}

function SetVersionTwoButton() {
  const workspace = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => {
        workspace.setTenant({ id: 't1', name: 'T1' } as never);
        workspace.setProject({ id: 'p1', name: 'P1' } as never);
        workspace.setVersion({ id: 'v2', name: 'V2' } as never);
      }}
    >
      Set version two
    </button>
  );
}

describe('StudioVersionSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPullVersionWithEtag.mockImplementation(
      async (
        versionId: string,
        options: unknown,
        revision?: number | null,
        sinceRevision?: number | null
      ) => {
        const data = await mockPullVersion(versionId, options, revision, sinceRevision);
        return { notModified: false, data, etag: null };
      }
    );
    mockListProperties.mockResolvedValue([]);
    mockConfirm.mockResolvedValue(true);
    window.localStorage.clear();
    const { useSearchParams } = require('next/navigation');
    useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('renders without crashing when no version selected', () => {
    const { container } = render(
      <WorkspaceProvider>
        <StudioProvider>
          <StudioVersionSync />
        </StudioProvider>
      </WorkspaceProvider>
    );
    expect(container).toBeInTheDocument();
    expect(mockPullVersion).not.toHaveBeenCalled();
  });

  it('calls pullVersion when version is set via workspace', async () => {
    mockPullVersion.mockResolvedValue({
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });

    render(
      <WorkspaceProvider>
        <StudioProvider>
          <StudioVersionSync />
          <SetVersionButton />
        </StudioProvider>
      </WorkspaceProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /^set version$/i }));

    await waitFor(
      () => {
        expect(mockPullVersion).toHaveBeenCalledWith('v1', expect.any(Object), undefined, undefined);
      },
      { timeout: 2000 }
    );
  });

  it('forwards revision and readOnly to loadFromServer when URL params match workspace version', async () => {
    const { useSearchParams } = require('next/navigation');
    useSearchParams.mockReturnValue(new URLSearchParams('versionId=v1&revision=3&readOnly=1'));

    mockPullVersion.mockResolvedValue({
      version_id: 'v1',
      revision: 3,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });

    render(
      <WorkspaceProvider>
        <StudioProvider>
          <StudioVersionSync />
          <SetVersionButton />
        </StudioProvider>
      </WorkspaceProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /^set version$/i }));

    await waitFor(
      () => {
        expect(mockPullVersion).toHaveBeenCalledWith('v1', expect.any(Object), 3, undefined);
      },
      { timeout: 2000 }
    );
  });

  it('forwards revision to loadFromServer when no versionId is present in URL (missing = match)', async () => {
    const { useSearchParams } = require('next/navigation');
    useSearchParams.mockReturnValue(new URLSearchParams('revision=7'));

    mockPullVersion.mockResolvedValue({
      version_id: 'v1',
      revision: 7,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });

    render(
      <WorkspaceProvider>
        <StudioProvider>
          <StudioVersionSync />
          <SetVersionButton />
        </StudioProvider>
      </WorkspaceProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /^set version$/i }));

    await waitFor(
      () => {
        expect(mockPullVersion).toHaveBeenCalledWith('v1', expect.any(Object), 7, undefined);
      },
      { timeout: 2000 }
    );
  });

  it('clears previous version backup when switching versions', async () => {
    mockPullVersion
      .mockResolvedValueOnce({
        version_id: 'v1',
        revision: 1,
        classes: [],
        canvas_metadata: null,
        pulled_at: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        version_id: 'v2',
        revision: 1,
        classes: [],
        canvas_metadata: null,
        pulled_at: new Date().toISOString(),
      });
    const removeSpy = jest.spyOn(Storage.prototype, 'removeItem');

    render(
      <WorkspaceProvider>
        <StudioProvider>
          <StudioVersionSync />
          <SetVersionButton />
          <SetVersionTwoButton />
        </StudioProvider>
      </WorkspaceProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /^set version$/i }));
    await waitFor(() => {
      expect(mockPullVersion).toHaveBeenCalledWith('v1', expect.any(Object), undefined, undefined);
    });

    await userEvent.click(screen.getByRole('button', { name: /set version two/i }));
    await waitFor(() => {
      expect(mockPullVersion).toHaveBeenCalledWith('v2', expect.any(Object), undefined, undefined);
    });
    expect(removeSpy).toHaveBeenCalledWith('objectified:studio:backup:v1');
    removeSpy.mockRestore();
  });

  it('prompts to restore local draft when a newer draft exists', async () => {
    mockPullVersion.mockResolvedValue({
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });
    const backupState = {
      versionId: 'v1',
      revision: 1,
      classes: [],
      properties: [],
      canvas_metadata: null,
      groups: [],
    };
    window.localStorage.setItem(
      'objectified:studio:backup:v1',
      JSON.stringify({
        formatVersion: 2,
        checksum: computeStateChecksum(backupState),
        savedAt: new Date().toISOString(),
        state: backupState,
      })
    );

    render(
      <WorkspaceProvider>
        <StudioProvider>
          <StudioVersionSync />
          <SetVersionButton />
        </StudioProvider>
      </WorkspaceProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /^set version$/i }));

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/restore unsaved draft/i),
        })
      );
    });
  });

  it('does not call loadFromServer for old version when version changes while confirm is pending', async () => {
    // This test verifies the race condition fix: if the version changes while the
    // user is responding to the restore-draft confirm dialog, the old async flow
    // should abort instead of calling loadFromServer for the stale version.
    let resolveConfirm!: (v: boolean) => void;
    mockConfirm.mockReturnValueOnce(new Promise<boolean>((res) => { resolveConfirm = res; }));
    mockPullVersion.mockResolvedValue({
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });
    const backupState = {
      versionId: 'v1',
      revision: 1,
      classes: [],
      properties: [],
      canvas_metadata: null,
      groups: [],
    };
    window.localStorage.setItem(
      'objectified:studio:backup:v1',
      JSON.stringify({
        formatVersion: 2,
        checksum: computeStateChecksum(backupState),
        savedAt: new Date().toISOString(),
        state: backupState,
      })
    );

    render(
      <WorkspaceProvider>
        <StudioProvider>
          <StudioVersionSync />
          <SetVersionButton />
          <SetVersionTwoButton />
        </StudioProvider>
      </WorkspaceProvider>
    );

    // Set version v1 – this triggers the confirm prompt (which is pending)
    await userEvent.click(screen.getByRole('button', { name: /^set version$/i }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());

    const callsBefore = mockPullVersion.mock.calls.length;

    // Switch to v2 while the confirm for v1 is still pending
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v2',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });
    await userEvent.click(screen.getByRole('button', { name: /set version two/i }));

    // Resolve v1's confirm after v2 load started
    resolveConfirm(true);

    await waitFor(() => {
      // v2 should have been loaded
      expect(mockPullVersion).toHaveBeenCalledWith('v2', expect.any(Object), undefined, undefined);
    });

    // v1's loadFromServer must NOT have been called after the version changed
    const v1CallsAfterSwitch = mockPullVersion.mock.calls
      .slice(callsBefore)
      .filter((args: unknown[]) => args[0] === 'v1');
    expect(v1CallsAfterSwitch).toHaveLength(0);
  });

  it('discarding draft clears backup and loads server state', async () => {
    mockConfirm.mockResolvedValue(false);
    mockPullVersion.mockResolvedValue({
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });
    const backupState = {
      versionId: 'v1',
      revision: 1,
      classes: [],
      properties: [],
      canvas_metadata: null,
      groups: [],
    };
    window.localStorage.setItem(
      'objectified:studio:backup:v1',
      JSON.stringify({
        formatVersion: 2,
        checksum: computeStateChecksum(backupState),
        savedAt: new Date().toISOString(),
        state: backupState,
      })
    );
    const removeSpy = jest.spyOn(Storage.prototype, 'removeItem');

    render(
      <WorkspaceProvider>
        <StudioProvider>
          <StudioVersionSync />
          <SetVersionButton />
        </StudioProvider>
      </WorkspaceProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /^set version$/i }));

    await waitFor(() => {
      expect(mockPullVersion).toHaveBeenCalledWith('v1', expect.any(Object), undefined, undefined);
    });
    expect(removeSpy).toHaveBeenCalledWith('objectified:studio:backup:v1');
    removeSpy.mockRestore();
  });
});
