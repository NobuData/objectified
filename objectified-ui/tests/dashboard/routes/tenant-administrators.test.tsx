import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TenantAdministratorsPage from '../../../src/app/dashboard/tenants/[tenantId]/administrators/TenantAdministratorsPageClient';

const SESSION_DEFAULT = {
  status: 'authenticated' as const,
  data: {
    user: { name: 'User', email: 'user@example.com', is_administrator: true },
    accessToken: 'token',
  },
};

const SESSION_AS_PRIMARY = {
  status: 'authenticated' as const,
  data: {
    user: { id: 'primary-admin-id', name: 'Primary', email: 'primary@example.com', is_administrator: true },
    accessToken: 'token',
  },
};

const SESSION_AS_CURRENT_USER = {
  status: 'authenticated' as const,
  data: {
    user: { id: 'current-user-id', name: 'Me', email: 'me@example.com', is_administrator: true },
    accessToken: 'token',
  },
};

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => SESSION_DEFAULT),
}));

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ tenantId: 'tenant-123' })),
}));

const mockGetTenant = jest.fn();
const mockListTenantAdministrators = jest.fn();
const mockListUsers = jest.fn();
const mockRemoveTenantAdministrator = jest.fn();
const mockUpdateTenantMember = jest.fn();
const mockListTenantAdministratorAuditEvents = jest.fn();
const mockTransferTenantPrimaryAdministrator = jest.fn();

jest.mock('@lib/api/rest-client', () => ({
  getTenant: (...args: unknown[]) => mockGetTenant(...args),
  listTenantAdministrators: (...args: unknown[]) =>
    mockListTenantAdministrators(...args),
  addTenantAdministrator: jest.fn(),
  removeTenantAdministrator: (...args: unknown[]) =>
    mockRemoveTenantAdministrator(...args),
  updateTenantMember: (...args: unknown[]) => mockUpdateTenantMember(...args),
  listUsers: (...args: unknown[]) => mockListUsers(...args),
  listTenantAdministratorAuditEvents: (...args: unknown[]) =>
    mockListTenantAdministratorAuditEvents(...args),
  transferTenantPrimaryAdministrator: (...args: unknown[]) =>
    mockTransferTenantPrimaryAdministrator(...args),
  getRestClientOptions: jest.fn(() => ({})),
  isForbiddenError: (e: unknown) =>
    Boolean(
      e &&
        typeof e === 'object' &&
        'statusCode' in e &&
        (e as { statusCode: number }).statusCode === 403
    ),
  isConflictError: (e: unknown) =>
    Boolean(
      e &&
        typeof e === 'object' &&
        'statusCode' in e &&
        (e as { statusCode: number }).statusCode === 409
    ),
}));

const mockConfirm = jest.fn(() => Promise.resolve(false));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: (...args: unknown[]) => mockConfirm(...args),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

describe('TenantAdministratorsPage', () => {
  beforeEach(() => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue(SESSION_DEFAULT);
    mockConfirm.mockReset();
    mockConfirm.mockResolvedValue(false);
    mockRemoveTenantAdministrator.mockReset();
    mockUpdateTenantMember.mockReset();
    mockListTenantAdministratorAuditEvents.mockReset();
    mockListTenantAdministratorAuditEvents.mockResolvedValue([]);
    mockTransferTenantPrimaryAdministrator.mockReset();
    mockGetTenant.mockResolvedValue({
      id: 'tenant-123',
      name: 'Acme Corp',
      slug: 'acme-corp',
      description: '',
      enabled: true,
      primary_admin_account_id: 'primary-admin-id',
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
    const err = Object.assign(new Error('Admin privileges required.'), {
      statusCode: 403,
    });
    mockListTenantAdministrators.mockRejectedValue(err);
    render(<TenantAdministratorsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(
          /you need tenant administrator or platform administrator access to view this page/i
        )
      ).toBeInTheDocument();
    });
  });

  it('shows You and no Remove button for current user in administrators list', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue(SESSION_AS_CURRENT_USER);
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
    const removeButtons = screen.queryAllByRole('button', { name: /remove/i });
    expect(removeButtons).toHaveLength(1);
  });

  it('shows forbidden message when list returns "Admin privileges required"', async () => {
    const err = Object.assign(new Error('Admin privileges required.'), {
      statusCode: 403,
    });
    mockListTenantAdministrators.mockRejectedValue(err);
    render(<TenantAdministratorsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(
          /you need tenant administrator or platform administrator access to view this page/i
        )
      ).toBeInTheDocument();
    });
  });

  it('calls removeTenantAdministrator and refreshes list when confirmed', async () => {
    const user = userEvent.setup();
    mockConfirm.mockResolvedValue(true);
    mockRemoveTenantAdministrator.mockResolvedValue(undefined);
    const adminEntry = {
      id: 'ta1',
      tenant_id: 'tenant-123',
      account_id: 'admin-to-remove',
      access_level: 'administrator',
      enabled: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    };
    mockListTenantAdministrators.mockResolvedValue([adminEntry]);
    render(<TenantAdministratorsPage />);
    const removeBtn = await screen.findByRole('button', { name: /remove administrator/i });
    mockListTenantAdministrators.mockResolvedValue([]);
    await user.click(removeBtn);
    await waitFor(() => {
      expect(mockRemoveTenantAdministrator).toHaveBeenCalledWith(
        'tenant-123',
        'admin-to-remove',
        expect.anything()
      );
    });
    await waitFor(() => {
      expect(
        screen.getByText(/no administrators yet/i)
      ).toBeInTheDocument();
    });
  });

  it('does not call removeTenantAdministrator when confirm is cancelled', async () => {
    const user = userEvent.setup();
    mockConfirm.mockResolvedValue(false);
    const adminEntry = {
      id: 'ta1',
      tenant_id: 'tenant-123',
      account_id: 'admin-to-remove',
      access_level: 'administrator',
      enabled: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    };
    mockListTenantAdministrators.mockResolvedValue([adminEntry]);
    render(<TenantAdministratorsPage />);
    const removeBtn = await screen.findByRole('button', { name: /remove administrator/i });
    await user.click(removeBtn);
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
    });
    expect(mockRemoveTenantAdministrator).not.toHaveBeenCalled();
  });

  it('calls updateTenantMember with access_level member and refreshes list when demote confirmed', async () => {
    const user = userEvent.setup();
    mockConfirm.mockResolvedValue(true);
    mockUpdateTenantMember.mockResolvedValue({});
    const adminEntry = {
      id: 'ta1',
      tenant_id: 'tenant-123',
      account_id: 'admin-to-demote',
      access_level: 'administrator',
      enabled: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    };
    mockListTenantAdministrators.mockResolvedValue([adminEntry]);
    render(<TenantAdministratorsPage />);
    const demoteBtn = await screen.findByRole('button', { name: /demote to member/i });
    mockListTenantAdministrators.mockResolvedValue([]);
    await user.click(demoteBtn);
    await waitFor(() => {
      expect(mockUpdateTenantMember).toHaveBeenCalledWith(
        'tenant-123',
        'admin-to-demote',
        { access_level: 'member' },
        expect.anything()
      );
    });
    await waitFor(() => {
      expect(
        screen.getByText(/no administrators yet/i)
      ).toBeInTheDocument();
    });
  });

  it('does not call updateTenantMember when demote is cancelled', async () => {
    const user = userEvent.setup();
    mockConfirm.mockResolvedValue(false);
    const adminEntry = {
      id: 'ta1',
      tenant_id: 'tenant-123',
      account_id: 'admin-to-demote',
      access_level: 'administrator',
      enabled: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    };
    mockListTenantAdministrators.mockResolvedValue([adminEntry]);
    render(<TenantAdministratorsPage />);
    const demoteBtn = await screen.findByRole('button', { name: /demote to member/i });
    await user.click(demoteBtn);
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
    });
    expect(mockUpdateTenantMember).not.toHaveBeenCalled();
  });

  it('opens the audit trail and calls listTenantAdministratorAuditEvents', async () => {
    const user = userEvent.setup();
    const auditEntry = {
      id: 'audit-1',
      tenant_id: 'tenant-123',
      event_type: 'admin_added',
      actor_account_id: 'actor-id',
      target_account_id: 'target-id',
      previous_primary_account_id: null,
      metadata: {},
      created_at: '2024-06-01T12:00:00Z',
    };
    mockListTenantAdministratorAuditEvents.mockResolvedValue([auditEntry]);
    render(<TenantAdministratorsPage />);
    await screen.findByRole('heading', { name: /acme corp — administrators/i });
    const auditTrigger = screen.getByRole('button', { name: /administrator audit trail/i });
    await user.click(auditTrigger);
    await waitFor(() => {
      expect(mockListTenantAdministratorAuditEvents).toHaveBeenCalledWith(
        'tenant-123',
        expect.anything()
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/administrator added/i)).toBeInTheDocument();
    });
  });

  it('calls transferTenantPrimaryAdministrator and refreshes on successful transfer', async () => {
    const user = userEvent.setup();
    mockTransferTenantPrimaryAdministrator.mockResolvedValue(undefined);
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue(SESSION_AS_PRIMARY);
    const nonPrimaryAdmin = {
      id: 'ta2',
      tenant_id: 'tenant-123',
      account_id: 'other-admin-id',
      access_level: 'administrator',
      enabled: true,
      created_at: '2024-01-02T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    };
    mockListTenantAdministrators.mockResolvedValue([nonPrimaryAdmin]);
    render(<TenantAdministratorsPage />);
    const transferBtn = await screen.findByRole('button', { name: /transfer primary role/i });
    await user.click(transferBtn);
    await screen.findByRole('heading', { name: /transfer primary administrator/i });
    const slugInput = screen.getByLabelText(/confirm tenant slug/i);
    await user.clear(slugInput);
    await user.type(slugInput, 'acme-corp');
    const initialGetTenantCallCount = mockGetTenant.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /confirm transfer/i }));
    await waitFor(() => {
      expect(mockTransferTenantPrimaryAdministrator).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          new_primary_account_id: 'other-admin-id',
          confirm_tenant_slug: 'acme-corp',
        }),
        expect.anything()
      );
    });
    await waitFor(() => {
      expect(mockGetTenant.mock.calls.length).toBeGreaterThan(initialGetTenantCallCount);
    });
  });

  it('shows 409 conflict message when transfer fails with conflict', async () => {
    const user = userEvent.setup();
    const conflictErr = Object.assign(new Error('Conflict'), { statusCode: 409 });
    mockTransferTenantPrimaryAdministrator.mockRejectedValue(conflictErr);
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue(SESSION_AS_PRIMARY);
    const nonPrimaryAdmin = {
      id: 'ta2',
      tenant_id: 'tenant-123',
      account_id: 'other-admin-id',
      access_level: 'administrator',
      enabled: true,
      created_at: '2024-01-02T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    };
    mockListTenantAdministrators.mockResolvedValue([nonPrimaryAdmin]);
    render(<TenantAdministratorsPage />);
    const transferBtn = await screen.findByRole('button', { name: /transfer primary role/i });
    await user.click(transferBtn);
    await screen.findByRole('heading', { name: /transfer primary administrator/i });
    const slugInput = screen.getByLabelText(/confirm tenant slug/i);
    await user.clear(slugInput);
    await user.type(slugInput, 'acme-corp');
    await user.click(screen.getByRole('button', { name: /confirm transfer/i }));
    await waitFor(() => {
      expect(mockTransferTenantPrimaryAdministrator).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
