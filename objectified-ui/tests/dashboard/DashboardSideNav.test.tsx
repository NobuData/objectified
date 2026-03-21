import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DashboardSideNav from '../../src/app/dashboard/components/DashboardSideNav';

let mockPathname = '/dashboard';
const mockPrefetch = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ prefetch: mockPrefetch }),
}));

describe('DashboardSideNav', () => {
  beforeEach(() => {
    mockPathname = '/dashboard';
    mockPrefetch.mockClear();
  });

  it('renders navigation with sidebar links label', () => {
    render(<DashboardSideNav />);
    expect(screen.getByLabelText('Sidebar links')).toBeInTheDocument();
  });

  it('renders Navigation heading', () => {
    render(<DashboardSideNav />);
    expect(screen.getByText('Navigation')).toBeInTheDocument();
  });

  it('renders member navigation links by default', () => {
    render(<DashboardSideNav role="member" />);
    expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /Projects/i })).toHaveAttribute('href', '/dashboard/projects');
    expect(screen.getByRole('link', { name: /Versions/i })).toHaveAttribute('href', '/dashboard/versions');
    expect(screen.getByRole('link', { name: /Profile/i })).toHaveAttribute('href', '/dashboard/profile');
    expect(screen.queryByRole('link', { name: /Users/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Publish/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tenants/i })).not.toBeInTheDocument();
  });

  it('renders Users and tenant links when role is admin', () => {
    render(<DashboardSideNav role="admin" />);
    expect(screen.getByRole('link', { name: /Users/i })).toHaveAttribute('href', '/dashboard/users');
    expect(screen.getByRole('link', { name: /Tenants/i })).toHaveAttribute('href', '/dashboard/tenants');
    expect(screen.getByRole('link', { name: 'Publish' })).toHaveAttribute('href', '/dashboard/publish');
  });

  it('renders Members link for tenant-admin with selected tenant', () => {
    render(<DashboardSideNav role="tenant-admin" selectedTenantId="tenant-123" />);
    expect(screen.getByRole('link', { name: /Members/i })).toHaveAttribute(
      'href',
      '/dashboard/tenants/tenant-123/members'
    );
    expect(screen.queryByRole('link', { name: /Users/i })).not.toBeInTheDocument();
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
    render(<DashboardSideNav role="admin" />);
    expect(screen.getByRole('link', { name: 'Publish' }).className).toContain('border-indigo-500');
    expect(screen.getByRole('link', { name: 'Published' }).className).not.toContain('border-indigo-500');
  });

  it('highlights only Published (not Publish) when on /dashboard/published', () => {
    mockPathname = '/dashboard/published';
    render(<DashboardSideNav role="admin" />);
    expect(screen.getByRole('link', { name: 'Published' }).className).toContain('border-indigo-500');
    expect(screen.getByRole('link', { name: 'Publish' }).className).not.toContain('border-indigo-500');
  });

  it('prefetches a route on sidebar link hover and focus', () => {
    render(<DashboardSideNav role="member" />);
    const projectsLink = screen.getByRole('link', { name: /Projects/i });
    expect(projectsLink).toHaveAttribute('href', '/dashboard/projects');
    fireEvent.mouseEnter(projectsLink);
    expect(mockPrefetch).toHaveBeenCalledWith('/dashboard/projects');
    mockPrefetch.mockClear();
    fireEvent.focus(projectsLink);
    expect(mockPrefetch).toHaveBeenCalledWith('/dashboard/projects');
  });

  it('calls onNavigate when a link is clicked', () => {
    const onNavigate = jest.fn();
    render(<DashboardSideNav onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('link', { name: /Projects/i }));
    expect(onNavigate).toHaveBeenCalled();
  });

  it('hides link labels when collapsed=true', () => {
    render(<DashboardSideNav collapsed role="admin" />);
    expect(screen.queryByText('Navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
  });

  it('navigation links have aria-label when collapsed=true for screen-reader accessibility', () => {
    render(<DashboardSideNav collapsed role="admin" />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/dashboard/projects');
    expect(screen.getByRole('link', { name: 'Tenants' })).toHaveAttribute('href', '/dashboard/tenants');
  });

  it('navigation links do not have aria-label when collapsed=false', () => {
    render(<DashboardSideNav collapsed={false} role="admin" />);
    // In non-collapsed mode, text labels are visible so aria-label is not needed
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    const projectsLink = screen.getByRole('link', { name: /Projects/i });
    const tenantsLink = screen.getByRole('link', { name: /Tenants/i });
    expect(dashboardLink).not.toHaveAttribute('aria-label');
    expect(projectsLink).not.toHaveAttribute('aria-label');
    expect(tenantsLink).not.toHaveAttribute('aria-label');
  });
});


