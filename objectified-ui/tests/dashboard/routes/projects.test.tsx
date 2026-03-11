import React from 'react';
import { render, screen } from '@testing-library/react';
import ProjectsPage from '../../../src/app/dashboard/projects/page';

describe('ProjectsPage', () => {
  it('renders projects heading', () => {
    render(<ProjectsPage />);
    expect(screen.getByRole('heading', { name: /projects/i })).toBeInTheDocument();
  });

  it('renders placeholder description', () => {
    render(<ProjectsPage />);
    expect(screen.getByText(/manage specification projects/i)).toBeInTheDocument();
  });
});

