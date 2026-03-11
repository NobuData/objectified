import React from 'react';
import { render, screen } from '@testing-library/react';
import TenantsPage from '../../../src/app/dashboard/tenants/page';

describe('TenantsPage', () => {
  it('renders tenants heading', () => {
    render(<TenantsPage />);
    expect(screen.getByRole('heading', { name: /tenants/i })).toBeInTheDocument();
  });

  it('renders placeholder description', () => {
    render(<TenantsPage />);
    expect(screen.getByText(/manage tenants/i)).toBeInTheDocument();
  });
});

