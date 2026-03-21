import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardShell from '../../src/app/dashboard/components/DashboardShell';

// Stable session constants (must start with 'mock' to be accessible in jest.mock factories).
const mockDefaultSession = {
  status: 'authenticated' as const,
  data: { user: { name: 'Test User', email: 'test@example.com' } },
};
const mockSessionWithToken = {
  status: 'authenticated' as const,
  data: { user: { name: 'Test User', email: 'test@example.com' }, accessToken: 'test-token' },
};

// Mock window.matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => mockDefaultSession),
  signOut: jest.fn(),
}));

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/profile',
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: jest.fn(),
    resolvedTheme: 'light',
    systemTheme: 'light',
  }),
}));

jest.mock('@/app/components/theme/ThemeSelector', () => {
  return function MockThemeSelector() {
    return null;
  };
});

jest.mock('@lib/api/rest-client', () => ({
  getRestClientOptions: jest.fn(() => ({})),
  listMyTenants: jest.fn(async () => []),
  recordDashboardPageVisit: jest.fn(async () => undefined),
}));

jest.mock('@/app/hooks/useTenantPermissions', () => ({
  useTenantPermissions: jest.fn(() => ({
    permissions: null,
    loading: false,
    has: jest.fn(() => false),
  })),
}));

describe('DashboardShell', () => {
  beforeEach(() => {
    const { useSession } = require('next-auth/react');
    const { listMyTenants } = require('@lib/api/rest-client');
    useSession.mockReturnValue(mockDefaultSession);
    listMyTenants.mockResolvedValue([]);
    localStorage.clear();
    mockPush.mockClear();
  });

  it('renders header with Dashboard, Data Designer, and Account links', () => {
    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>
    );

    const nav = screen.getByLabelText(/main navigation/i);
    expect(within(nav).getByRole('link', { name: /Home/i })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: /Dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(within(nav).getByRole('link', { name: /Data Designer/i })).toHaveAttribute('href', '/data-designer');
    expect(within(nav).getByRole('link', { name: /Account/i })).toHaveAttribute('href', '/dashboard/profile');
  });

  it('renders dashboard sidebar with member-visible links', () => {
    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>
    );

    const sidebar = screen.getByLabelText(/dashboard navigation/i);
    expect(sidebar).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: /^Dashboard$/i })).toHaveAttribute('href', '/dashboard');
    expect(within(sidebar).getByRole('link', { name: /Projects/i })).toHaveAttribute('href', '/dashboard/projects');
    expect(within(sidebar).getByRole('link', { name: /Versions/i })).toHaveAttribute('href', '/dashboard/versions');
    expect(within(sidebar).getByRole('link', { name: /Profile/i })).toHaveAttribute('href', '/dashboard/profile');
    expect(within(sidebar).queryByRole('link', { name: /Users/i })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole('link', { name: /Publish/i })).not.toBeInTheDocument();
  });

  it('shows Users link in sidebar when user is administrator', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          name: 'Admin User',
          email: 'admin@example.com',
          is_administrator: true,
        },
      },
    });

    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>
    );

    const sidebar = screen.getByLabelText(/dashboard navigation/i);
    expect(within(sidebar).getByRole('link', { name: /Users/i })).toHaveAttribute('href', '/dashboard/users');
  });

  it('renders children in main content', () => {
    render(
      <DashboardShell>
        <div data-testid="dashboard-child">Content</div>
      </DashboardShell>
    );

    expect(screen.getByTestId('dashboard-child')).toHaveTextContent('Content');
  });

  it('renders skip link targeting the main landmark', () => {
    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>
    );

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute(
      'href',
      '#dashboard-main-content'
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'dashboard-main-content');
  });

  it('does not render tenant switcher when there is only one tenant', async () => {
    const { useSession } = require('next-auth/react');
    const { listMyTenants } = require('@lib/api/rest-client');
    useSession.mockReturnValue(mockSessionWithToken);
    listMyTenants.mockResolvedValue([{ id: 'tenant-1', name: 'Only Tenant' }]);

    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>
    );

    await waitFor(() => expect(listMyTenants).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /switch tenant/i })).not.toBeInTheDocument();
  });

  it('renders tenant switcher when multiple tenants are available', async () => {
    const { useSession } = require('next-auth/react');
    const { listMyTenants } = require('@lib/api/rest-client');
    useSession.mockReturnValue(mockSessionWithToken);
    listMyTenants.mockResolvedValue([
      { id: 'tenant-1', name: 'Tenant One' },
      { id: 'tenant-2', name: 'Tenant Two' },
    ]);

    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /switch tenant/i })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /switch tenant/i })).toHaveTextContent('Tenant One');
  });

  it('persists tenant selection to localStorage when tenant is switched', async () => {
    const { useSession } = require('next-auth/react');
    const { listMyTenants } = require('@lib/api/rest-client');
    const user = userEvent.setup();
    useSession.mockReturnValue(mockSessionWithToken);
    listMyTenants.mockResolvedValue([
      { id: 'tenant-1', name: 'Tenant One' },
      { id: 'tenant-2', name: 'Tenant Two' },
    ]);

    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /switch tenant/i })).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /switch tenant/i }));
    const tenantTwoOption = await screen.findByRole('menuitemradio', { name: 'Tenant Two' });
    await user.click(tenantTwoOption);

    await waitFor(() =>
      expect(localStorage.getItem('objectified:dashboard:selectedTenantId')).toBe('tenant-2')
    );
  });
});
