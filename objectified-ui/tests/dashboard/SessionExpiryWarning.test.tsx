import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionExpiryWarning from '../../src/app/dashboard/components/SessionExpiryWarning';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

describe('SessionExpiryWarning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders nothing when session expiry is outside the warning window', () => {
    const { useSession } = require('next-auth/react');
    const later = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    useSession.mockReturnValue({
      status: 'authenticated',
      data: { expires: later, user: {} },
    });

    const { container } = render(<SessionExpiryWarning />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a status banner when the session is about to expire', () => {
    const { useSession } = require('next-auth/react');
    const soon = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    useSession.mockReturnValue({
      status: 'authenticated',
      data: { expires: soon, user: {} },
    });

    render(<SessionExpiryWarning />);
    expect(screen.getByRole('status')).toHaveTextContent(/session expires/i);
  });

  it('dismiss hides the banner until the next expiry', async () => {
    const user = userEvent.setup();
    const { useSession } = require('next-auth/react');
    const soon = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    useSession.mockReturnValue({
      status: 'authenticated',
      data: { expires: soon, user: {} },
    });

    const { unmount } = render(<SessionExpiryWarning />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();

    render(<SessionExpiryWarning />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
