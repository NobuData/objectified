import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../../src/app/login/page';

const mockGetProviders = jest.fn(() =>
  Promise.resolve({
    credentials: { id: 'credentials', name: 'Credentials', signinUrl: '', callbackUrl: '' },
    github: { id: 'github', name: 'GitHub', signinUrl: '', callbackUrl: '' },
  })
);
jest.mock('next-auth/react', () => ({
  getProviders: () => mockGetProviders(),
  signIn: jest.fn(() => Promise.resolve({ ok: true, error: null })),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

describe('LoginPage', () => {
  it('renders login form with email, password and sign in button', async () => {
    render(<LoginPage />);
    await screen.findByLabelText(/email/i);
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /sign in with github/i })).toBeInTheDocument();
  });

  it('shows Welcome Back heading', async () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    await screen.findByRole('button', { name: /sign in with github/i }); // wait for providers to load
  });

  it('submits credentials when sign in is clicked', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await screen.findByRole('button', { name: /sign in with github/i }); // wait for providers to load
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'test@example.com');
    await user.type(screen.getByPlaceholderText(/••••••••/), 'password123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    const { signIn } = await import('next-auth/react');
    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        callbackUrl: '/dashboard',
        redirect: true,
      });
    });
  });

  it('triggers GitHub SSO when Sign in with GitHub is clicked', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const githubButton = await screen.findByRole('button', { name: /sign in with github/i });
    await user.click(githubButton);
    const { signIn } = await import('next-auth/react');
    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('github', { callbackUrl: '/dashboard' });
    });
  });

  it('does not render GitHub button when GitHub provider is not configured', async () => {
    mockGetProviders.mockResolvedValueOnce({ credentials: { id: 'credentials', name: 'Credentials', signinUrl: '', callbackUrl: '' } });
    render(<LoginPage />);
    await screen.findByRole('button', { name: /^sign in$/i });
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGetProviders).toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /sign in with github/i })).not.toBeInTheDocument();
    });
  });
});
