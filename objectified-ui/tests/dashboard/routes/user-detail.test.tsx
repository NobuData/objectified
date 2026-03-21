import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserDetailPageClient from '../../../src/app/dashboard/users/[userId]/UserDetailPageClient';

jest.mock('next/navigation', () => ({
  useParams: () => ({ userId: '00000000-0000-0000-0000-000000000001' }),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('@lib/api/rest-client', () => ({
  getUser: jest.fn(),
  listUserTenantMemberships: jest.fn(),
  listUserLifecycleEvents: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
  isForbiddenError: jest.fn(() => false),
  isNotFoundError: jest.fn(() => false),
}));

describe('UserDetailPageClient', () => {
  const account = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Alice',
    email: 'alice@example.com',
    verified: true,
    enabled: true,
    metadata: {},
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: null,
    deleted_at: null,
    last_login_at: null,
  };

  beforeEach(() => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { name: 'Admin', email: 'admin@example.com', is_administrator: true },
        accessToken: 'token',
      },
    });
    const {
      getUser,
      listUserTenantMemberships,
      listUserLifecycleEvents,
      isNotFoundError,
    } = require('@lib/api/rest-client');
    getUser.mockResolvedValue(account);
    listUserTenantMemberships.mockResolvedValue([
      {
        tenant_id: '00000000-0000-0000-0000-000000000002',
        tenant_name: 'Acme',
        access_level: 'member',
        membership_enabled: true,
        roles: [{ role_id: 'r1', key: 'viewer', name: 'Viewer' }],
      },
    ]);
    listUserLifecycleEvents.mockResolvedValue([
      {
        id: 'e1',
        account_id: account.id,
        event_type: 'deactivated',
        reason: 'Left org',
        actor_id: '00000000-0000-0000-0000-000000000099',
        created_at: '2025-02-01T00:00:00.000Z',
      },
    ]);
    isNotFoundError.mockReturnValue(false);
  });

  it('renders profile and tenant roles for admin', async () => {
    render(<UserDetailPageClient />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^profile$/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute(
      'href',
      '/dashboard/tenants/00000000-0000-0000-0000-000000000002/members'
    );
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('loads lifecycle audit when expanded', async () => {
    const user = userEvent.setup();
    render(<UserDetailPageClient />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^profile$/i })).toBeInTheDocument();
    });
    const { listUserLifecycleEvents } = require('@lib/api/rest-client');
    expect(listUserLifecycleEvents).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /optional audit trail/i }));
    await waitFor(() => {
      expect(listUserLifecycleEvents).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('deactivated')).toBeInTheDocument();
    });
  });

  it('shows non-admin message when not administrator', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { name: 'U', email: 'u@example.com', is_administrator: false },
        accessToken: 'token',
      },
    });
    render(<UserDetailPageClient />);
    await waitFor(() => {
      expect(
        screen.getByText(/only administrators can view user profiles/i)
      ).toBeInTheDocument();
    });
  });
});
