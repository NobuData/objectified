import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DashboardSideNav from '../../src/app/dashboard/components/DashboardSideNav';

let mockPathname = '/dashboard';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('DashboardSideNav', () => {
  beforeEach(() => {
    mockPathname = '/dashboard';
  });

  it('renders navigation with sidebar links label', () => {
    render(<DashboardSideNav />);
    expect(screen.getByLabelText('Sidebar links')).toBeInTheDocument();
  });

  it('renders Navigation heading', () => {
    render(<DashboardSideNav />);
    expect(screen.getByText('Navigation')).toBeInTheDocument();
  });

  it('renders Dashboard, Projects, Versions, Publish, Published, Tenants, and Profile links by default', () => {
    render(<DashboardSideNav />);
    expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /Projects/i })).toHaveAttribute('href', '/dashboard/projects');
    expect(screen.getByRole('link', { name: /Versions/i })).toHaveAttribute('href', '/dashboard/versions');
    expect(screen.getByRole('link', { name: 'Publish' })).toHaveAttribute('href', '/dashboard/publish');
    expect(screen.getByRole('link', { name: 'Published' })).toHaveAttribute('href', '/dashboard/published');
    expect(screen.getByRole('link', { name: /Tenants/i })).toHaveAttribute('href', '/dashboard/tenants');
    expect(screen.getByRole('link', { name: /Profile/i })).toHaveAttribute('href', '/dashboard/profile');
  });

  it('does not render Users link when isAdministrator is false', () => {
    render(<DashboardSideNav isAdministrator={false} />);
    expect(screen.queryByRole('link', { name: /Users/i })).not.toBeInTheDocument();
  });

  it('renders Users link when isAdministrator is true', () => {
    render(<DashboardSideNav isAdministrator={true} />);
    expect(screen.getByRole('link', { name: /Users/i })).toHaveAttribute('href', '/dashboard/users');
  });

  it('highlights Dashboard link when on /dashboard', () => {
    mockPathname = '/dashboard';
    render(<DashboardSideNav />);
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    expect(dashboardLink.className).toContain('border-indigo-500');
  });

  it('highlights Projects link when on /dashboard/projects', () => {
    mockPathname = '/dashboard/projects';
    render(<DashboardSideNav />);
    const projectsLink = screen.getByRole('link', { name: /Projects/i });
    expect(projectsLink.className).toContain('border-indigo-500');
  });

  it('does not highlight Dashboard when on a sub-route', () => {
    mockPathname = '/dashboard/projects';
    render(<DashboardSideNav />);
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    expect(dashboardLink.className).not.toContain('border-indigo-500');
  });

  it('highlights only Publish (not Published) when on /dashboard/publish', () => {
    mockPathname = '/dashboard/publish';
    render(<DashboardSideNav />);
    expect(screen.getByRole('link', { name: 'Publish' }).className).toContain('border-indigo-500');
    expect(screen.getByRole('link', { name: 'Published' }).className).not.toContain('border-indigo-500');
  });

  it('highlights only Published (not Publish) when on /dashboard/published', () => {
    mockPathname = '/dashboard/published';
    render(<DashboardSideNav />);
    expect(screen.getByRole('link', { name: 'Published' }).className).toContain('border-indigo-500');
    expect(screen.getByRole('link', { name: 'Publish' }).className).not.toContain('border-indigo-500');
  });

  it('calls onNavigate when a link is clicked', () => {
    const onNavigate = jest.fn();
    render(<DashboardSideNav onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('link', { name: /Projects/i }));
    expect(onNavigate).toHaveBeenCalled();
  });

  it('hides link labels when collapsed=true', () => {
    render(<DashboardSideNav collapsed />);
    expect(screen.queryByText('Navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
  });

  it('navigation links have aria-label when collapsed=true for screen-reader accessibility', () => {
    render(<DashboardSideNav collapsed />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/dashboard/projects');
    expect(screen.getByRole('link', { name: 'Tenants' })).toHaveAttribute('href', '/dashboard/tenants');
  });

  it('navigation links do not have aria-label when collapsed=false', () => {
    render(<DashboardSideNav collapsed={false} />);
    // In non-collapsed mode, text labels are visible so aria-label is not needed
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    const projectsLink = screen.getByRole('link', { name: /Projects/i });
    const tenantsLink = screen.getByRole('link', { name: /Tenants/i });
    expect(dashboardLink).not.toHaveAttribute('aria-label');
    expect(projectsLink).not.toHaveAttribute('aria-label');
    expect(tenantsLink).not.toHaveAttribute('aria-label');
  });
});


