import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DataDesignerPage from '../../src/app/data-designer/page';
import { DialogProvider } from '../../src/app/components/providers/DialogProvider';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Test User', email: 'test@example.com' } } }),
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@lib/api/rest-client', () => ({
  getRestBaseUrl: () => 'http://test/v1',
  getRestClientOptions: () => ({}),
  listTenants: jest.fn().mockResolvedValue([]),
  listProjects: jest.fn().mockResolvedValue([]),
  listVersions: jest.fn().mockResolvedValue([]),
  listClassesWithPropertiesAndTags: jest.fn().mockResolvedValue([]),
  listProperties: jest.fn().mockResolvedValue([]),
  getTenant: jest.fn(),
  getProject: jest.fn(),
  getVersion: jest.fn(),
}));

jest.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="react-flow-canvas">{children}</div>
  ),
  Controls: () => <div data-testid="react-flow-controls">Controls</div>,
  MiniMap: () => <div data-testid="react-flow-minimap">MiniMap</div>,
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  useNodesState: () => [[], jest.fn(), jest.fn()],
  useEdgesState: () => [[], jest.fn(), jest.fn()],
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<DialogProvider>{ui}</DialogProvider>);
}

describe('DataDesignerPage', () => {
  it('renders design canvas layout with header, project/version bar, sidebar and canvas', async () => {
    renderWithProviders(<DataDesignerPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/main navigation/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Data Designer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Select tenant/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Select project/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Select version/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Classes/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Properties/i })).toBeInTheDocument();
    expect(screen.getByTestId('react-flow-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('react-flow-controls')).toBeInTheDocument();
    expect(screen.getByTestId('react-flow-minimap')).toBeInTheDocument();
  });

  it('renders tenant and profile in header', async () => {
    renderWithProviders(<DataDesignerPage />);

    await waitFor(() => {
      expect(screen.getByText(/Default Tenant/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Profile menu/i)).toBeInTheDocument();
  });

  it('renders Classes tab content with empty state when no version selected', async () => {
    renderWithProviders(<DataDesignerPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Select a tenant, project, and version to load classes/i)
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /Classes/i })).toBeInTheDocument();
  });
});
