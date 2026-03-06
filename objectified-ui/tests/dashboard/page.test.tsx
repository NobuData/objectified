import React from 'react';
import { render, screen } from '@testing-library/react';
import DashboardPage from '../../src/app/dashboard/page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Test User', email: 'test@example.com' } } }),
  signOut: jest.fn(),
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

describe('DashboardPage', () => {
  it('renders design canvas layout with header, project/version bar, sidebar and canvas', () => {
    render(<DashboardPage />);

    expect(screen.getByLabelText(/main navigation/i)).toBeInTheDocument();
    expect(screen.getByText(/Design Canvas/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Select project/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Select version/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Classes/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Properties/i })).toBeInTheDocument();
    expect(screen.getByTestId('react-flow-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('react-flow-controls')).toBeInTheDocument();
    expect(screen.getByTestId('react-flow-minimap')).toBeInTheDocument();
  });

  it('renders tenant and profile in header', () => {
    render(<DashboardPage />);

    expect(screen.getByText(/Default Tenant/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Profile menu/i)).toBeInTheDocument();
  });

  it('renders Classes tab content with search and placeholder list', () => {
    render(<DashboardPage />);

    expect(screen.getByLabelText(/Search list/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search/i)).toBeInTheDocument();
    expect(screen.getByText(/Account/)).toBeInTheDocument();
    expect(screen.getByText(/Add class/)).toBeInTheDocument();
  });
});
