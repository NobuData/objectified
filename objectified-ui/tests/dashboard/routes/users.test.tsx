import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import UsersPage from '../../../src/app/dashboard/users/UsersPageClient';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    status: 'authenticated',
    data: {
      user: { name: 'Admin', email: 'admin@example.com' },
      accessToken: 'token',
    },
  })),
}));

jest.mock('@lib/api/rest-client', () => ({
  listUsers: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deactivateUser: jest.fn(),
  getRestClientOptions: jest.fn(() => ({})),
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('@radix-ui/react-label', () => ({
  Root: ({ children, ...props }: React.ComponentProps<'label'>) => (
    <label {...props}>{children}</label>
  ),
}));

describe('UsersPage', () => {
  beforeEach(() => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { name: 'Admin', email: 'admin@example.com', is_administrator: true },
        accessToken: 'token',
      },
    });
    const { listUsers } = require('@lib/api/rest-client');
    listUsers.mockResolvedValue([]);
  });

  it('renders users heading', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /users/i })).toBeInTheDocument();
    });
  });

  it('renders Create user button when admin', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
    });
  });

  it('shows only administrators message when not admin', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { name: 'User', email: 'user@example.com', is_administrator: false },
        accessToken: 'token',
      },
    });
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /users/i })).toBeInTheDocument();
      expect(screen.getByText(/only administrators can list and manage users/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
  });

  it('shows sign-in message when unauthenticated', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({ status: 'unauthenticated', data: null });
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText(/you must be signed in/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when admin and no users', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText(/no users yet/i)).toBeInTheDocument();
    });
  });
});
