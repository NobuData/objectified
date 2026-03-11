import React from 'react';
import { render, screen } from '@testing-library/react';
import UsersPage from '../../../src/app/dashboard/users/page';

describe('UsersPage', () => {
  it('renders users heading', () => {
    render(<UsersPage />);
    expect(screen.getByRole('heading', { name: /users/i })).toBeInTheDocument();
  });

  it('renders placeholder description', () => {
    render(<UsersPage />);
    expect(screen.getByText(/manage user accounts/i)).toBeInTheDocument();
  });
});

