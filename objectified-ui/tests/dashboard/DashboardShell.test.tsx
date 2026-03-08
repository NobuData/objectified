import React from 'react';
import { render, screen, within } from '@testing-library/react';
import DashboardShell from '../../src/app/dashboard/components/DashboardShell';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Test User', email: 'test@example.com' } } }),
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/profile',
}));

describe('DashboardShell', () => {
  it('renders header with Dashboard, Data Designer, and Account links', () => {
    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>
    );

    const nav = screen.getByLabelText(/main navigation/i);
    expect(within(nav).getByRole('link', { name: /Dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(within(nav).getByRole('link', { name: /Data Designer/i })).toHaveAttribute('href', '/data-designer');
    expect(within(nav).getByRole('link', { name: /Account/i })).toHaveAttribute('href', '/dashboard/profile');
  });

  it('renders ACCOUNT sidebar with Profile link', () => {
    render(
      <DashboardShell>
        <div>Content</div>
      </DashboardShell>
    );

    expect(screen.getByLabelText(/Account navigation/i)).toBeInTheDocument();
    expect(screen.getByText(/ACCOUNT/)).toBeInTheDocument();
    const profileLink = screen.getByRole('link', { name: /Profile/i });
    expect(profileLink).toHaveAttribute('href', '/dashboard/profile');
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
