import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TenantsPage from '../../../src/app/dashboard/tenants/page';

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
});
