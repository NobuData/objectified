import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TenantAdministratorsPage from '../../../src/app/dashboard/tenants/[tenantId]/administrators/page';

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
const mockListTenantAdministrators = jest.fn();
const mockListUsers = jest.fn();

jest.mock('@lib/api/rest-client', () => ({
  getTenant: (...args: unknown[]) => mockGetTenant(...args),
  listTenantAdministrators: (...args: unknown[]) =>
    mockListTenantAdministrators(...args),
  addTenantAdministrator: jest.fn(),
  removeTenantAdministrator: jest.fn(),
  listUsers: (...args: unknown[]) => mockListUsers(...args),
  getRestClientOptions: jest.fn(() => ({})),
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

describe('TenantAdministratorsPage', () => {
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
    mockListTenantAdministrators.mockResolvedValue([]);
    mockListUsers.mockResolvedValue([]);
  });

  it('renders administrators heading with tenant name', async () => {
    render(<TenantAdministratorsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /acme corp — administrators/i,
        })
      ).toBeInTheDocument();
    });
  });

  it('renders Back to Tenants link', async () => {
    render(<TenantAdministratorsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /back to tenants/i })
      ).toBeInTheDocument();
    });
  });

  it('renders Add administrator button', async () => {
    render(<TenantAdministratorsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /add administrator/i })
      ).toBeInTheDocument();
    });
  });

  it('shows empty state when no administrators', async () => {
    render(<TenantAdministratorsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(
          /no administrators yet. add an administrator by user id or email/i
        )
      ).toBeInTheDocument();
    });
  });

  it('shows tenant not found when getTenant fails', async () => {
    mockGetTenant.mockRejectedValue(new Error('Not found'));
    render(<TenantAdministratorsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/tenant not found or you do not have access/i)
      ).toBeInTheDocument();
    });
  });

  it('shows forbidden message when list returns 403', async () => {
    mockListTenantAdministrators.mockRejectedValue(new Error('403 Forbidden'));
    render(<TenantAdministratorsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/only tenant administrators can view this page/i)
      ).toBeInTheDocument();
    });
  });

  it('shows You and no Remove button for current user in administrators list', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { id: 'current-user-id', name: 'Me', email: 'me@example.com' },
        accessToken: 'token',
      },
    });
    mockListTenantAdministrators.mockResolvedValue([
      {
        id: 'ta1',
        tenant_id: 'tenant-123',
        account_id: 'current-user-id',
        access_level: 'administrator',
        enabled: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
        deleted_at: null,
      },
      {
        id: 'ta2',
        tenant_id: 'tenant-123',
        account_id: 'other-admin-id',
        access_level: 'administrator',
        enabled: true,
        created_at: '2024-01-02T00:00:00Z',
        updated_at: null,
        deleted_at: null,
      },
    ]);
    mockListUsers.mockResolvedValue([]);
    render(<TenantAdministratorsPage />);
    await waitFor(() => {
      expect(screen.getByText('You')).toBeInTheDocument();
    });
    const removeButtons = screen.getAllByRole('button', { name: /remove administrator/i });
    expect(removeButtons).toHaveLength(1);
  });
});
