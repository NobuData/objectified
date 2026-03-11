import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeSelector from '../../src/app/components/theme/ThemeSelector';

const mockSetTheme = jest.fn();

jest.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: mockSetTheme,
    resolvedTheme: 'light',
    systemTheme: 'light',
  }),
}));

describe('ThemeSelector', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
  });

  it('does not render dialog content when closed', () => {
    render(<ThemeSelector isOpen={false} onClose={jest.fn()} />);
    expect(screen.queryByText('Select Theme')).not.toBeInTheDocument();
  });

  it('renders dialog with title when open', () => {
    render(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText('Select Theme')).toBeInTheDocument();
    expect(screen.getByText('Choose your preferred color theme for the application')).toBeInTheDocument();
  });

  it('renders all available themes', () => {
    render(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText('Follow System')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });

  it('renders theme descriptions', () => {
    render(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText('Automatically matches your system light/dark preference')).toBeInTheDocument();
    expect(screen.getByText('Clean and bright default theme')).toBeInTheDocument();
    expect(screen.getByText('Easy on the eyes for low-light environments')).toBeInTheDocument();
  });

  it('calls setTheme and onClose when a theme is selected', () => {
    const onClose = jest.fn();
    render(<ThemeSelector isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByText('Light'));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls setTheme with dark when Dark theme is selected', () => {
    const onClose = jest.fn();
    render(<ThemeSelector isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByText('Dark'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('shows system preference indicator when system theme is active', () => {
    render(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText('Currently: Light')).toBeInTheDocument();
  });

  it('has a close button', () => {
    render(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    expect(closeButtons.length).toBeGreaterThan(0);
  });
});

