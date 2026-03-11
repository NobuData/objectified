import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ProfilePage from '../../../src/app/dashboard/profile/page';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    status: 'unauthenticated',
    data: null,
  })),
}));

jest.mock('@lib/api/rest-client', () => ({
  getMe: jest.fn(),
  updateMe: jest.fn(),
}));

jest.mock('@radix-ui/react-label', () => ({
  Root: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
}));

jest.mock('@radix-ui/themes', () => ({
  Flex: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  Text: ({ children, ...props }: React.ComponentProps<'span'>) => <span {...props}>{children}</span>,
}));

describe('ProfilePage', () => {
  it('shows sign-in message when unauthenticated', async () => {
    render(<ProfilePage />);
    await waitFor(() => {
      expect(screen.getByText(/you must be signed in/i)).toBeInTheDocument();
    });
  });

  it('shows loading spinner when session is loading', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({ status: 'loading', data: null });

    render(<ProfilePage />);
    // The loader should be present (Loader2 icon renders with aria-hidden)
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders profile heading when authenticated with profile data', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { name: 'Test User', email: 'test@example.com' } },
    });

    const { getMe } = require('@lib/api/rest-client');
    getMe.mockResolvedValue({
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
      metadata: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(<ProfilePage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /profile/i })).toBeInTheDocument();
    });
  });
});

