import React from 'react';
import { render, screen } from '@testing-library/react';
import VersionsPage from '../../../src/app/dashboard/versions/page';

describe('VersionsPage', () => {
  it('renders versions heading', () => {
    render(<VersionsPage />);
    expect(screen.getByRole('heading', { name: /versions/i })).toBeInTheDocument();
  });

  it('renders placeholder description', () => {
    render(<VersionsPage />);
    expect(screen.getByText(/manage specification versions/i)).toBeInTheDocument();
  });
});

