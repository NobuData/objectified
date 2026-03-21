import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TenantsPage from '../../../src/app/dashboard/tenants/TenantsPageClient';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    status: 'authenticated',
    data: {
      user: { name: 'User', email: 'user@example.com' },
      accessToken: 'token',
    },
  })),
}));

jest.mock('@lib/api/rest-client', () => ({
  listMyTenants: jest.fn(),
  createTenant: jest.fn(),
  updateTenant: jest.fn(),
  deleteTenant: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

const _TENANT = {
  id: 'tenant-123',
  name: 'Acme Corp',
  slug: 'acme-corp',
  description: '',
  enabled: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: null,
  deleted_at: null,
};

describe('TenantsPage', () => {
  beforeEach(() => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { name: 'User', email: 'user@example.com' },
        accessToken: 'token',
      },
    });
    const { listMyTenants } = require('@lib/api/rest-client');
    listMyTenants.mockResolvedValue([]);
  });

  it('renders tenants heading', async () => {
    render(<TenantsPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /tenants/i })).toBeInTheDocument();
    });
  });

  it('renders Create tenant button when authenticated', async () => {
    render(<TenantsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create tenant/i })).toBeInTheDocument();
    });
  });

  it('shows empty state when user has no tenants', async () => {
    render(<TenantsPage />);
    await waitFor(() => {
      expect(screen.getByText(/you are not a member of any tenants yet/i)).toBeInTheDocument();
    });
  });

  it('shows sign-in message when unauthenticated', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({ status: 'unauthenticated', data: null });
    render(<TenantsPage />);
    await waitFor(() => {
      expect(screen.getByText(/you must be signed in/i)).toBeInTheDocument();
    });
  });

  it('shows SSO link for each tenant when user is an administrator', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { name: 'Admin', email: 'admin@example.com', is_administrator: true },
        accessToken: 'token',
      },
    });
    const { listMyTenants } = require('@lib/api/rest-client');
    listMyTenants.mockResolvedValue([_TENANT]);
    render(<TenantsPage />);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /configure sso for acme corp/i })).toBeInTheDocument();
    });
  });

  it('hides SSO link when user is not an administrator', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { name: 'Member', email: 'member@example.com', is_administrator: false },
        accessToken: 'token',
      },
    });
    const { listMyTenants } = require('@lib/api/rest-client');
    listMyTenants.mockResolvedValue([_TENANT]);
    render(<TenantsPage />);
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /configure sso/i })).not.toBeInTheDocument();
  });
});
