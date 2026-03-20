import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeSelector from '../../src/app/components/theme/ThemeSelector';
import { MotionPreferenceProvider } from '../../src/app/contexts/MotionPreferenceContext';

const mockSetTheme = jest.fn();

jest.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: mockSetTheme,
    resolvedTheme: 'light',
    systemTheme: 'light',
  }),
}));

function renderWithMotion(ui: React.ReactElement) {
  return render(<MotionPreferenceProvider>{ui}</MotionPreferenceProvider>);
}

describe('ThemeSelector', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    localStorage.clear();
    document.documentElement.classList.remove('reduce-motion');
  });

  it('does not render dialog content when closed', () => {
    renderWithMotion(<ThemeSelector isOpen={false} onClose={jest.fn()} />);
    expect(screen.queryByText('Select Theme')).not.toBeInTheDocument();
  });

  it('renders dialog with title when open', () => {
    renderWithMotion(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText('Select Theme')).toBeInTheDocument();
    expect(screen.getByText('Choose your preferred color theme for the application')).toBeInTheDocument();
  });

  it('renders all available themes', () => {
    renderWithMotion(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText('Follow System')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });

  it('renders theme descriptions', () => {
    renderWithMotion(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText('Automatically matches your system light/dark preference')).toBeInTheDocument();
    expect(screen.getByText('Clean and bright default theme')).toBeInTheDocument();
    expect(screen.getByText('Easy on the eyes for low-light environments')).toBeInTheDocument();
  });

  it('calls setTheme and onClose when a theme is selected', () => {
    const onClose = jest.fn();
    renderWithMotion(<ThemeSelector isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByText('Light'));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls setTheme with dark when Dark theme is selected', () => {
    const onClose = jest.fn();
    renderWithMotion(<ThemeSelector isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByText('Dark'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('shows system preference indicator when system theme is active', () => {
    renderWithMotion(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText('Currently: Light')).toBeInTheDocument();
  });

  it('has a close button', () => {
    renderWithMotion(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    expect(closeButtons.length).toBeGreaterThan(0);
  });

  it('renders motion preference options', () => {
    renderWithMotion(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText('Motion')).toBeInTheDocument();
    expect(screen.getByText('Reduce motion')).toBeInTheDocument();
    expect(screen.getByText('Full motion')).toBeInTheDocument();
  });

  it('persists reduce motion preference to localStorage', () => {
    renderWithMotion(<ThemeSelector isOpen={true} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Reduce motion'));
    expect(localStorage.getItem('objectified:motionPreference')).toBe('reduce');
  });
});

