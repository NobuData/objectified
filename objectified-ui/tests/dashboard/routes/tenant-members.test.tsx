import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TenantMembersPage from '../../../src/app/dashboard/tenants/[tenantId]/members/page';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    status: 'authenticated',
    data: {
      user: { name: 'User', email: 'user@example.com' },
      accessToken: 'token',
    },
  })),
}));

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ tenantId: 'tenant-123' })),
}));

const mockGetTenant = jest.fn();
const mockListTenantMembers = jest.fn();
const mockListUsers = jest.fn();

jest.mock('@lib/api/rest-client', () => ({
  getTenant: (...args: unknown[]) => mockGetTenant(...args),
  listTenantMembers: (...args: unknown[]) => mockListTenantMembers(...args),
  addTenantMember: jest.fn(),
  removeTenantMember: jest.fn(),
  updateTenantMember: jest.fn(),
  listUsers: (...args: unknown[]) => mockListUsers(...args),
  getRestClientOptions: jest.fn(() => ({})),
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

describe('TenantMembersPage', () => {
  beforeEach(() => {
    mockGetTenant.mockResolvedValue({
      id: 'tenant-123',
      name: 'Acme Corp',
      slug: 'acme-corp',
      description: '',
      enabled: true,
      created_at: '',
      updated_at: null,
      deleted_at: null,
    });
    mockListTenantMembers.mockResolvedValue([]);
    mockListUsers.mockResolvedValue([]);
  });

  it('renders members heading with tenant name', async () => {
    render(<TenantMembersPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /acme corp — members/i })
      ).toBeInTheDocument();
    });
  });

  it('renders Back to Tenants link', async () => {
    render(<TenantMembersPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /back to tenants/i })
      ).toBeInTheDocument();
    });
  });

  it('renders Add member button', async () => {
    render(<TenantMembersPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /add member/i })
      ).toBeInTheDocument();
    });
  });

  it('shows empty state when no members', async () => {
    render(<TenantMembersPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/no members yet. add a member by user id or email/i)
      ).toBeInTheDocument();
    });
  });

  it('shows tenant not found when getTenant fails', async () => {
    mockGetTenant.mockRejectedValue(new Error('Not found'));
    render(<TenantMembersPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/tenant not found or you do not have access/i)
      ).toBeInTheDocument();
    });
  });
});
