import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TenantMembersPage from '../../../src/app/dashboard/tenants/[tenantId]/members/page';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    status: 'authenticated',
    data: {
      user: { name: 'User', email: 'user@example.com', is_administrator: true },
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
const mockAddTenantMember = jest.fn();
const mockAddTenantAdministrator = jest.fn();

jest.mock('@lib/api/rest-client', () => ({
  getTenant: (...args: unknown[]) => mockGetTenant(...args),
  listTenantMembers: (...args: unknown[]) => mockListTenantMembers(...args),
  addTenantMember: (...args: unknown[]) => mockAddTenantMember(...args),
  addTenantAdministrator: (...args: unknown[]) => mockAddTenantAdministrator(...args),
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
    mockAddTenantMember.mockReset();
    mockAddTenantAdministrator.mockReset();
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

  it('filters out administrator entries from the members table', async () => {
    mockListTenantMembers.mockResolvedValue([
      {
        id: 'tm1',
        tenant_id: 'tenant-123',
        account_id: 'member-id',
        access_level: 'member',
        enabled: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
        deleted_at: null,
      },
      {
        id: 'tm2',
        tenant_id: 'tenant-123',
        account_id: 'admin-id',
        access_level: 'administrator',
        enabled: true,
        created_at: '2024-01-02T00:00:00Z',
        updated_at: null,
        deleted_at: null,
      },
    ]);
    mockListUsers.mockResolvedValue([
      { id: 'member-id', name: 'Alice Member', email: 'alice@example.com' },
      { id: 'admin-id', name: 'Bob Admin', email: 'bob@example.com' },
    ]);
    render(<TenantMembersPage />);
    await waitFor(() => {
      expect(screen.getByText('Alice Member')).toBeInTheDocument();
    });
    expect(screen.queryByText('Bob Admin')).not.toBeInTheDocument();
  });

  it('calls addTenantAdministrator when role is set to Administrator', async () => {
    const user = userEvent.setup();
    mockAddTenantAdministrator.mockResolvedValue({
      id: 'new-admin',
      tenant_id: 'tenant-123',
      account_id: 'new-admin-id',
      access_level: 'administrator',
      enabled: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    });
    render(<TenantMembersPage />);
    const addBtn = await screen.findByRole('button', { name: /add member/i });
    await user.click(addBtn);
    const roleSelect = await screen.findByRole('combobox', { name: /role/i });
    await user.selectOptions(roleSelect, 'administrator');
    const accountIdInput = screen.getByPlaceholderText(/uuid/i);
    await user.type(accountIdInput, 'new-admin-id');
    const submitBtn = screen.getByRole('button', { name: /add member/i });
    await user.click(submitBtn);
    await waitFor(() => {
      expect(mockAddTenantAdministrator).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({ account_id: 'new-admin-id', tenant_id: 'tenant-123' }),
        expect.anything()
      );
    });
    expect(mockAddTenantMember).not.toHaveBeenCalled();
  });

  it('calls addTenantMember when role is set to Member', async () => {
    const user = userEvent.setup();
    mockAddTenantMember.mockResolvedValue({
      id: 'new-member',
      tenant_id: 'tenant-123',
      account_id: 'new-member-id',
      access_level: 'member',
      enabled: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    });
    render(<TenantMembersPage />);
    const addBtn = await screen.findByRole('button', { name: /add member/i });
    await user.click(addBtn);
    const accountIdInput = screen.getByPlaceholderText(/uuid/i);
    await user.type(accountIdInput, 'new-member-id');
    const submitBtn = screen.getByRole('button', { name: /add member/i });
    await user.click(submitBtn);
    await waitFor(() => {
      expect(mockAddTenantMember).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({ account_id: 'new-member-id', tenant_id: 'tenant-123', access_level: 'member' }),
        expect.anything()
      );
    });
    expect(mockAddTenantAdministrator).not.toHaveBeenCalled();
  });
});
