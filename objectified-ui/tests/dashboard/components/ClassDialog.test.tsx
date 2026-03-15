/**
 * Unit tests for ClassDialog.
 * Reference: GitHub #63 - canvas mutations
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassDialog from '@/app/dashboard/components/ClassDialog';

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  jest.clearAllMocks();
});

describe('ClassDialog', () => {
  const mockOnSave = jest.fn();
  const mockOnClose = jest.fn();

  it('renders nothing when closed', () => {
    render(<ClassDialog open={false} mode="add" onSave={mockOnSave} onClose={mockOnClose} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows Add Class title in add mode', () => {
    render(<ClassDialog open mode="add" onSave={mockOnSave} onClose={mockOnClose} />);
    expect(screen.getByRole('heading', { name: 'Add Class' })).toBeInTheDocument();
  });

  it('shows Edit Class title in edit mode', () => {
    render(
      <ClassDialog open mode="edit" initial={{ name: 'User', description: '' }}
        onSave={mockOnSave} onClose={mockOnClose} />
    );
    expect(screen.getByRole('heading', { name: 'Edit Class' })).toBeInTheDocument();
  });

  it('pre-fills name and description in edit mode', () => {
    render(
      <ClassDialog open mode="edit"
        initial={{ name: 'Product', description: 'A product' }}
        onSave={mockOnSave} onClose={mockOnClose} />
    );
    expect(screen.getByDisplayValue('Product')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A product')).toBeInTheDocument();
  });

  it('shows validation error when saving with empty name', async () => {
    const user = userEvent.setup();
    render(<ClassDialog open mode="add" onSave={mockOnSave} onClose={mockOnClose} />);
    await user.click(screen.getByRole('button', { name: /add class/i }));
    expect(screen.getByText('Class name is required.')).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('calls onSave with trimmed name and description', async () => {
    const user = userEvent.setup();
    render(<ClassDialog open mode="add" onSave={mockOnSave} onClose={mockOnClose} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. User/i), '  MyClass  ');
    await user.type(screen.getByPlaceholderText(/optional description/i), 'Desc');
    await user.click(screen.getByRole('button', { name: /add class/i }));
    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'MyClass', description: 'Desc' }));
  });

  it('calls onSave when Enter pressed in name field', async () => {
    const user = userEvent.setup();
    render(<ClassDialog open mode="add" onSave={mockOnSave} onClose={mockOnClose} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. User/i), 'Order{Enter}');
    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Order', description: '' }));
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<ClassDialog open mode="add" onSave={mockOnSave} onClose={mockOnClose} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when X button is clicked', async () => {
    const user = userEvent.setup();
    render(<ClassDialog open mode="add" onSave={mockOnSave} onClose={mockOnClose} />);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });
});
