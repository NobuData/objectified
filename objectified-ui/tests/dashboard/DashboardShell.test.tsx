import React from 'react';
import { render, screen, within } from '@testing-library/react';
import DashboardShell from '../../src/app/dashboard/components/DashboardShell';

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
  useSession: jest.fn(() => ({ data: { user: { name: 'Test User', email: 'test@example.com' } } })),
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/profile',
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

describe('DashboardShell', () => {
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

  it('renders dashboard sidebar with Dashboard home, Projects, Versions, Publish, Tenants, Profile', () => {
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
    expect(within(sidebar).getByRole('link', { name: /Publish/i })).toHaveAttribute('href', '/dashboard/publish');
    expect(within(sidebar).getByRole('link', { name: /Tenants/i })).toHaveAttribute('href', '/dashboard/tenants');
    expect(within(sidebar).getByRole('link', { name: /Profile/i })).toHaveAttribute('href', '/dashboard/profile');
  });

  it('shows Users link in sidebar when user is administrator', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
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
});
