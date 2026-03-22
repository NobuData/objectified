/**
 * Unit tests for StudioVersionSync: render without crash; when workspace has version, load is triggered.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceProvider, useWorkspace } from '@/app/contexts/WorkspaceContext';
import { StudioProvider } from '@/app/contexts/StudioContext';
import StudioVersionSync from '@/app/dashboard/components/StudioVersionSync';

const mockPullVersion = jest.fn();
const mockListProperties = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { accessToken: 'token' } }),
}));

jest.mock('@lib/api/rest-client', () => ({
  getRestClientOptions: () => ({}),
  pullVersion: (...args: unknown[]) => mockPullVersion(...args),
  listProperties: (...args: unknown[]) => mockListProperties(...args),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => new URLSearchParams()),
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
    mockListProperties.mockResolvedValue([]);
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
        expect(mockPullVersion).toHaveBeenCalledWith('v1', expect.any(Object), undefined);
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
        expect(mockPullVersion).toHaveBeenCalledWith('v1', expect.any(Object), 3);
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
        expect(mockPullVersion).toHaveBeenCalledWith('v1', expect.any(Object), 7);
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
      expect(mockPullVersion).toHaveBeenCalledWith('v1', expect.any(Object), undefined);
    });

    await userEvent.click(screen.getByRole('button', { name: /set version two/i }));
    await waitFor(() => {
      expect(mockPullVersion).toHaveBeenCalledWith('v2', expect.any(Object), undefined);
    });
    expect(removeSpy).toHaveBeenCalledWith('objectified:studio:backup:v1');
    removeSpy.mockRestore();
  });
});
