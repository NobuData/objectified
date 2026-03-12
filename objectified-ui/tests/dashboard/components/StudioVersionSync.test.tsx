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

describe('StudioVersionSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListProperties.mockResolvedValue([]);
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

    await userEvent.click(screen.getByRole('button', { name: /set version/i }));

    await waitFor(
      () => {
        expect(mockPullVersion).toHaveBeenCalledWith('v1', expect.any(Object));
      },
      { timeout: 2000 }
    );
  });
});
