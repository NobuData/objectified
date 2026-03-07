import React from 'react';
import { render, screen } from '@testing-library/react';
import HomePageContent from '../../src/app/components/home/HomePageContent';

describe('HomePageContent', () => {
  it('renders platform title and welcome message with first name', () => {
    render(<HomePageContent firstName="Jane" />);

    expect(screen.getByRole('heading', { name: /Objectified Platform/i })).toBeInTheDocument();
    expect(screen.getByText(/Welcome back, Jane/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Select your application/i })).toBeInTheDocument();
  });

  it('renders Dashboard and Data Designer application cards', () => {
    render(<HomePageContent firstName="User" />);

    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    const dataDesignerLink = screen.getByRole('link', { name: /Data Designer/i });

    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    expect(dataDesignerLink).toBeInTheDocument();
    expect(dataDesignerLink).toHaveAttribute('href', '/data-designer');
  });

  it('renders disabled Coming Soon cards for Browser, Database, Migration, ETL, Data Explorer', () => {
    render(<HomePageContent firstName="User" />);

    expect(screen.getByText(/Browser/)).toBeInTheDocument();
    expect(screen.getByText(/Database/)).toBeInTheDocument();
    expect(screen.getByText(/Migration/)).toBeInTheDocument();
    expect(screen.getByText(/ETL/)).toBeInTheDocument();
    expect(screen.getByText(/Data Explorer/)).toBeInTheDocument();
    const badges = screen.getAllByText(/Coming soon/i);
    expect(badges.length).toBe(5);
  });

  it('renders footer links for Help, Community and GitHub', () => {
    render(<HomePageContent firstName="User" />);

    expect(screen.getByRole('link', { name: /Help/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Community/i })).toBeInTheDocument();
    const githubLink = screen.getByRole('link', { name: /GitHub/i });
    expect(githubLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute('href', 'https://github.com/NobuData/objectified');
  });

  it('renders version and copyright', () => {
    render(<HomePageContent firstName="User" />);

    expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/\(c\) 2026 NobuData, LLC/)).toBeInTheDocument();
  });
});
