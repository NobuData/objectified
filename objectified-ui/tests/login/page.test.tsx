import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../../src/app/login/page';

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(() => Promise.resolve({ ok: true, error: null })),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

describe('LoginPage', () => {
  it('renders login form with email, password and sign in button', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows Welcome Back heading', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('submits credentials when sign in is clicked', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'test@example.com');
    await user.type(screen.getByPlaceholderText(/••••••••/), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    const { signIn } = await import('next-auth/react');
    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false,
      });
    });
  });
});
