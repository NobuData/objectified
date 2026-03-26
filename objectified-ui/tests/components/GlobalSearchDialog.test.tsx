/**
 * Unit tests for GlobalSearchDialog.
 * Covers: Cmd/Ctrl+K shortcut, input-guard, result rendering, and selection callbacks.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GlobalSearchDialog from '@/app/components/GlobalSearchDialog';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Stable session object so that useCallback([session, ...]) does not recreate on every render.
const mockSessionData = { accessToken: 'test-token' };
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: mockSessionData }),
}));

const mockListMyTenants = jest.fn();
const mockListProjects = jest.fn();
const mockListVersions = jest.fn();

jest.mock('@lib/api/rest-client', () => ({
  getRestClientOptions: () => ({}),
  listMyTenants: (...args: unknown[]) => mockListMyTenants(...args),
  listProjects: (...args: unknown[]) => mockListProjects(...args),
  listVersions: (...args: unknown[]) => mockListVersions(...args),
}));

jest.mock('@lib/studio/useUndoKeyboard', () => ({
  getModifierLabel: () => 'Ctrl',
}));

jest.mock('@lib/studio/types', () => ({
  getStableClassId: (cls: { id?: string; localId?: string }) => cls.id ?? cls.localId ?? '',
}));

const mockSetProject = jest.fn();
const mockSetVersion = jest.fn();

// ─── Mock context shapes (minimal subsets used by GlobalSearchDialog) ─────────

interface MockWorkspace {
  tenant: { id: string; name: string } | null;
  project: { id: string; name: string; slug: string } | null;
  version: null;
  setTenant: jest.Mock;
  setProject: jest.Mock;
  setVersion: jest.Mock;
}

interface MockStudio {
  state: {
    classes: Array<{ id: string; localId: string; name: string; properties: [] }>;
  };
}

interface MockCanvasSidebarActions {
  zoomToClass: jest.Mock;
  zoomToGroup: jest.Mock;
  registerZoomToClass: jest.Mock;
  registerZoomToGroup: jest.Mock;
}

interface MockFocusMode {
  enterFocusOnNode: jest.Mock;
}

// Default: no workspace context
let mockWorkspace: MockWorkspace | null = null;
let mockStudio: MockStudio | null = null;
let mockCanvasSidebarActions: MockCanvasSidebarActions | null = null;
let mockFocusMode: MockFocusMode | null = null;

jest.mock('@/app/contexts/WorkspaceContext', () => ({
  useWorkspaceOptional: () => mockWorkspace,
}));

jest.mock('@/app/contexts/StudioContext', () => ({
  useStudioOptional: () => mockStudio,
}));

jest.mock('@/app/contexts/CanvasSidebarActionsContext', () => ({
  useCanvasSidebarActionsOptional: () => mockCanvasSidebarActions,
}));

jest.mock('@/app/contexts/CanvasFocusModeContext', () => ({
  useCanvasFocusModeOptional: () => mockFocusMode,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sampleProjects = [
  { id: 'proj-1', name: 'Alpha Project', slug: 'alpha' },
  { id: 'proj-2', name: 'Beta Project', slug: 'beta' },
];

const sampleVersions = [
  { id: 'ver-1', name: 'v1.0.0', published: false },
  { id: 'ver-2', name: 'v2.0.0', published: true },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GlobalSearchDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspace = null;
    mockStudio = null;
    mockCanvasSidebarActions = null;
    mockFocusMode = null;

    mockListMyTenants.mockResolvedValue([{ id: 'tenant-1', name: 'Tenant One' }]);
    mockListProjects.mockResolvedValue(sampleProjects);
    mockListVersions.mockResolvedValue(sampleVersions);
  });

  it('renders the trigger button', () => {
    render(<GlobalSearchDialog />);
    expect(screen.getByRole('button', { name: /global search/i })).toBeInTheDocument();
  });

  it('does not show dialog content by default', () => {
    render(<GlobalSearchDialog />);
    // Dialog title is sr-only but only rendered when open; heading should not appear
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens dialog when trigger button is clicked', async () => {
    const user = userEvent.setup();
    render(<GlobalSearchDialog />);
    await user.click(screen.getByRole('button', { name: /global search/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens dialog with Ctrl+K keyboard shortcut', async () => {
    render(<GlobalSearchDialog />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    await screen.findByRole('dialog');
  });

  it('does not open dialog when Ctrl+K is pressed while focused on an input', () => {
    render(
      <div>
        <input data-testid="other-input" />
        <GlobalSearchDialog />
      </div>
    );
    const input = screen.getByTestId('other-input');
    input.focus();
    fireEvent.keyDown(input, { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not open dialog when Ctrl+K is pressed while focused on a textarea', () => {
    render(
      <div>
        <textarea data-testid="other-textarea" />
        <GlobalSearchDialog />
      </div>
    );
    const textarea = screen.getByTestId('other-textarea');
    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('loads and renders project results on open', async () => {
    const user = userEvent.setup();
    render(<GlobalSearchDialog />);
    await user.click(screen.getByRole('button', { name: /global search/i }));
    await screen.findByText('Alpha Project');
    expect(screen.getByText('Beta Project')).toBeInTheDocument();
  });

  it('loads and renders version results on open', async () => {
    const user = userEvent.setup();
    render(<GlobalSearchDialog />);
    await user.click(screen.getByRole('button', { name: /global search/i }));
    await screen.findByText('v1.0.0');
    expect(screen.getByText('v2.0.0')).toBeInTheDocument();
  });

  it('calls workspace.setProject when selecting a project with workspace context', async () => {
    mockWorkspace = {
      tenant: { id: 'tenant-1', name: 'Tenant One' },
      project: null,
      version: null,
      setTenant: jest.fn(),
      setProject: mockSetProject,
      setVersion: mockSetVersion,
    };
    mockListProjects.mockResolvedValue(sampleProjects);
    mockListVersions.mockResolvedValue([]);

    const user = userEvent.setup();
    render(<GlobalSearchDialog />);
    await user.click(screen.getByRole('button', { name: /global search/i }));
    await screen.findByText('Alpha Project');
    await user.click(screen.getByText('Alpha Project'));
    expect(mockSetProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj-1' }));
  });

  it('navigates to /dashboard/projects when selecting a project without workspace context', async () => {
    const user = userEvent.setup();
    render(<GlobalSearchDialog />);
    await user.click(screen.getByRole('button', { name: /global search/i }));
    await screen.findByText('Alpha Project');
    await user.click(screen.getByText('Alpha Project'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/projects');
  });

  it('calls workspace.setVersion when selecting a version with workspace context', async () => {
    mockWorkspace = {
      tenant: { id: 'tenant-1', name: 'Tenant One' },
      project: { id: 'proj-1', name: 'Alpha', slug: 'alpha' },
      version: null,
      setTenant: jest.fn(),
      setProject: mockSetProject,
      setVersion: mockSetVersion,
    };
    mockListProjects.mockResolvedValue(sampleProjects);
    mockListVersions.mockResolvedValue(sampleVersions);

    const user = userEvent.setup();
    render(<GlobalSearchDialog />);
    await user.click(screen.getByRole('button', { name: /global search/i }));
    await screen.findByText('v1.0.0');
    await user.click(screen.getByText('v1.0.0'));
    expect(mockSetVersion).toHaveBeenCalledWith(expect.objectContaining({ id: 'ver-1' }));
  });

  it('navigates to /dashboard/versions when selecting a version without workspace context', async () => {
    const user = userEvent.setup();
    render(<GlobalSearchDialog />);
    await user.click(screen.getByRole('button', { name: /global search/i }));
    await screen.findByText('v1.0.0');
    await user.click(screen.getByText('v1.0.0'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/versions');
  });

  it('renders class results when studio classes are available and query matches', async () => {
    mockStudio = {
      state: {
        classes: [
          { id: 'cls-1', localId: 'lcls-1', name: 'UserAccount', properties: [] },
          { id: 'cls-2', localId: 'lcls-2', name: 'OrderItem', properties: [] },
        ],
      },
    };

    const user = userEvent.setup();
    render(<GlobalSearchDialog />);
    await user.click(screen.getByRole('button', { name: /global search/i }));
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText('Search query'), 'user');
    await waitFor(() => {
      expect(screen.getByText('UserAccount')).toBeInTheDocument();
    });
    expect(screen.queryByText('OrderItem')).not.toBeInTheDocument();
  });

  it('invokes zoomToClass and enterFocusOnNode when selecting a class result', async () => {
    const mockZoomToClass = jest.fn();
    const mockEnterFocusOnNode = jest.fn();
    mockCanvasSidebarActions = {
      zoomToClass: mockZoomToClass,
      zoomToGroup: jest.fn(),
      registerZoomToClass: jest.fn(),
      registerZoomToGroup: jest.fn(),
    };
    mockFocusMode = { enterFocusOnNode: mockEnterFocusOnNode };
    mockStudio = {
      state: {
        classes: [
          { id: 'cls-1', localId: 'lcls-1', name: 'UserAccount', properties: [] },
        ],
      },
    };

    const user = userEvent.setup();
    render(<GlobalSearchDialog />);
    await user.click(screen.getByRole('button', { name: /global search/i }));
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText('Search query'), 'useraccount');
    await screen.findByText('UserAccount');
    await user.click(screen.getByText('UserAccount'));

    expect(mockZoomToClass).toHaveBeenCalledWith('cls-1');
    expect(mockEnterFocusOnNode).toHaveBeenCalledWith('cls-1');
  });
});
