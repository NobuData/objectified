import React from 'react';
import { render, screen } from '@testing-library/react';
import DashboardPage from '../../src/app/dashboard/page';

describe('DashboardPage', () => {
  it('renders dashboard home with welcome content', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/welcome/i)).toBeInTheDocument();
  });
});
