import React from 'react';
import { render, screen } from '@testing-library/react';

const mockRedirect = jest.fn();
const mockGetServerSession = jest.fn();

jest.mock('next-auth', () => ({
  getServerSession: () => mockGetServerSession(),
}));

jest.mock('@lib/auth/authOptions', () => ({
  authOptions: {},
}));

jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error('NEXT_REDIRECT');
  },
}));

describe('Home page', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockGetServerSession.mockClear();
  });

  it('redirects to /login when there is no session', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const HomePage = (await import('../../src/app/page')).default;

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('renders home content when session exists', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Jane Doe', email: 'jane@example.com' },
    });

    const HomePage = (await import('../../src/app/page')).default;
    const result = await HomePage();

    render(result);

    expect(screen.getByRole('heading', { name: /Objectified Platform/i })).toBeInTheDocument();
    expect(screen.getByText(/Welcome back, Jane/)).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
