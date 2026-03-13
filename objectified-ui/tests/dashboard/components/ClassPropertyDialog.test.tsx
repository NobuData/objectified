/**
 * Unit tests for ClassPropertyDialog.
 * Reference: GitHub #63 — canvas mutations
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassPropertyDialog from '@/app/dashboard/components/ClassPropertyDialog';
import type { StudioProperty } from '@lib/studio/types';

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  jest.clearAllMocks();
});

const mockProperties: StudioProperty[] = [
  { id: 'p1', name: 'email', description: 'Email address' },
  { id: 'p2', name: 'createdAt', description: 'Creation date' },
];

describe('ClassPropertyDialog', () => {
  const mockOnSave = jest.fn();
  const mockOnClose = jest.fn();

  it('renders nothing when closed', () => {
    render(
      <ClassPropertyDialog
        open={false}
        mode="add"
        availableProperties={[]}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows Add Property title in add mode', () => {
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    expect(screen.getByText('Add Property to Class')).toBeInTheDocument();
  });

  it('shows Edit Class Property title in edit mode', () => {
    render(
      <ClassPropertyDialog
        open
        mode="edit"
        availableProperties={[]}
        initial={{ name: 'email', description: '' }}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    expect(screen.getByText('Edit Class Property')).toBeInTheDocument();
  });

  it('pre-fills name and description in edit mode', () => {
    render(
      <ClassPropertyDialog
        open
        mode="edit"
        availableProperties={[]}
        initial={{ name: 'myProp', description: 'My prop desc' }}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    expect(screen.getByDisplayValue('myProp')).toBeInTheDocument();
    expect(screen.getByDisplayValue('My prop desc')).toBeInTheDocument();
  });

  it('shows validation error when saving with empty name', async () => {
    const user = userEvent.setup();
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(screen.getByText('Property name is required.')).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('calls onSave with trimmed name and description', async () => {
    const user = userEvent.setup();
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), '  myField  ');
    await user.type(screen.getByPlaceholderText(/optional description/i), 'A field');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'myField',
      description: 'A field',
      propertyId: undefined,
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows property selector when availableProperties is non-empty in add mode', () => {
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={mockProperties}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    expect(screen.getByText('Link to Project Property')).toBeInTheDocument();
  });

  it('does not show property selector when availableProperties is empty', () => {
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    expect(screen.queryByText('Link to Project Property')).toBeNull();
  });
});

