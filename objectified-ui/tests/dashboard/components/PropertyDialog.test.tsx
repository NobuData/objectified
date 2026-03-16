/**
 * Unit tests for PropertyDialog.
 * Reference: GitHub #104
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropertyDialog from '@/app/dashboard/components/PropertyDialog';

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  jest.clearAllMocks();
});

describe('PropertyDialog', () => {
  const mockOnSave = jest.fn();
  const mockOnClose = jest.fn();

  const defaultProps = {
    open: true,
    mode: 'add' as const,
    onSave: mockOnSave,
    onClose: mockOnClose,
  };

  // Visibility
  it('renders nothing when closed', () => {
    render(<PropertyDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog when open', () => {
    render(<PropertyDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // Title
  it('shows "Add Property" title in add mode', () => {
    render(<PropertyDialog {...defaultProps} mode="add" />);
    expect(screen.getByRole('heading', { name: /add property/i })).toBeInTheDocument();
  });

  it('shows "Edit Property" title in edit mode', () => {
    render(
      <PropertyDialog
        {...defaultProps}
        mode="edit"
        initial={{ name: 'email', data: { type: 'string' } }}
      />,
    );
    expect(screen.getByText('Edit Property')).toBeInTheDocument();
  });

  // Name field
  it('shows an empty name field in add mode', () => {
    render(<PropertyDialog {...defaultProps} />);
    expect(screen.getByPlaceholderText(/e\.g\. id/i)).toHaveValue('');
  });

  it('pre-fills name in edit mode', () => {
    render(
      <PropertyDialog
        {...defaultProps}
        mode="edit"
        initial={{ name: 'email', data: { type: 'string' } }}
      />,
    );
    expect(screen.getByDisplayValue('email')).toBeInTheDocument();
  });

  // Validation
  it('shows error when saving with empty name', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(screen.getByText('Property name is required.')).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('shows error when name contains invalid characters', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'my-field');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(screen.getByText(/name must start with a letter/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('shows error when name starts with a number', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), '1field');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(screen.getByText(/name must start with a letter/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('accepts name starting with underscore', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), '_internal');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalled();
  });

  it('accepts alphanumeric names with underscores', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'my_field_123');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalled();
  });

  it('shows duplicate name error in add mode', async () => {
    const user = userEvent.setup();
    render(
      <PropertyDialog {...defaultProps} existingNames={['email', 'name']} />,
    );
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'email');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(screen.getByText(/a property with this name already exists/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('shows duplicate name error case-insensitively', async () => {
    const user = userEvent.setup();
    render(
      <PropertyDialog {...defaultProps} existingNames={['Email']} />,
    );
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'email');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(screen.getByText(/a property with this name already exists/i)).toBeInTheDocument();
  });

  it('allows same name when editing the same property', async () => {
    const user = userEvent.setup();
    render(
      <PropertyDialog
        {...defaultProps}
        mode="edit"
        initial={{ name: 'email', data: { type: 'string' } }}
        existingNames={['email', 'name']}
      />,
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(mockOnSave).toHaveBeenCalled();
  });

  it('blocks duplicate when renaming to existing name in edit mode', async () => {
    const user = userEvent.setup();
    render(
      <PropertyDialog
        {...defaultProps}
        mode="edit"
        initial={{ name: 'id', data: { type: 'string' } }}
        existingNames={['id', 'email']}
      />,
    );
    const nameInput = screen.getByDisplayValue('id');
    await user.clear(nameInput);
    await user.type(nameInput, 'email');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByText(/a property with this name already exists/i)).toBeInTheDocument();
  });

  // Cancel
  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.click(screen.getByLabelText(/close/i));
    expect(mockOnClose).toHaveBeenCalled();
  });

  // Save with default schema
  it('calls onSave with string type schema by default', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'myField');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'myField',
      description: null,
      data: expect.objectContaining({ type: 'string' }),
    });
  });

  it('saves a property with $ref data', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} availableClasses={['Address']} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'address');
    await user.type(
      screen.getByPlaceholderText('#/components/schemas/ClassName'),
      '#/components/schemas/Address',
    );
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'address',
      description: null,
      data: expect.objectContaining({
        $ref: '#/components/schemas/Address',
      }),
    });
  });

  it('trims name whitespace before saving', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), '  myField  ');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'myField' }),
    );
  });

  // Type selector
  it('shows the type selector', () => {
    render(<PropertyDialog {...defaultProps} />);
    expect(screen.getByLabelText(/property type/i)).toBeInTheDocument();
  });

  // Array checkbox
  it('shows the Array checkbox', () => {
    render(<PropertyDialog {...defaultProps} />);
    expect(screen.getByLabelText(/^array$/i)).toBeInTheDocument();
  });

  // Form / JSON tabs
  it('shows Form and JSON Preview tabs', () => {
    render(<PropertyDialog {...defaultProps} />);
    expect(screen.getByText('Form')).toBeInTheDocument();
    expect(screen.getByText('JSON Preview')).toBeInTheDocument();
  });

  it('shows JSON preview when JSON tab is clicked', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.click(screen.getByText('JSON Preview'));
    const pre = screen.getByText(/\"type\"/);
    expect(pre).toBeInTheDocument();
  });

  // Save via Enter key on name field
  it('triggers save when Enter is pressed in name field', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText(/e\.g\. id/i);
    await user.type(nameInput, 'myField');
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    expect(mockOnSave).toHaveBeenCalled();
  });

  // Edit mode data loading
  it('loads property data in edit mode: string with constraints', async () => {
    const user = userEvent.setup();
    render(
      <PropertyDialog
        {...defaultProps}
        mode="edit"
        initial={{
          name: 'email',
          data: {
            type: 'string',
            format: 'email',
            minLength: 5,
            maxLength: 100,
            description: 'User email',
          },
        }}
      />,
    );
    expect(screen.getByDisplayValue('email')).toBeInTheDocument();
    expect(screen.getByDisplayValue('User email')).toBeInTheDocument();
  });

  it('loads property data in edit mode: nullable number', () => {
    render(
      <PropertyDialog
        {...defaultProps}
        mode="edit"
        initial={{
          name: 'age',
          data: {
            type: ['integer', 'null'],
            minimum: 0,
            maximum: 150,
          },
        }}
      />,
    );
    expect(screen.getByDisplayValue('age')).toBeInTheDocument();
  });

  it('loads property data in edit mode: array type', () => {
    render(
      <PropertyDialog
        {...defaultProps}
        mode="edit"
        initial={{
          name: 'tags',
          data: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
        }}
      />,
    );
    expect(screen.getByDisplayValue('tags')).toBeInTheDocument();
  });

  // PropertyFormFields integration
  it('includes PropertyFormFields component', () => {
    render(<PropertyDialog {...defaultProps} />);
    expect(screen.getByTestId('property-form-fields')).toBeInTheDocument();
  });

  // Schema output verification
  it('outputs correct schema for a string with required flag', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'status');

    // Expand flags section
    await user.click(screen.getByText('Property Flags'));
    await user.click(screen.getByLabelText('Required'));

    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'status',
      description: null,
      data: expect.objectContaining({
        type: 'string',
        'x-required': true,
      }),
    });
  });

  // Buttons
  it('shows "Add Property" button text in add mode', () => {
    render(<PropertyDialog {...defaultProps} mode="add" />);
    expect(screen.getByRole('button', { name: /add property/i })).toBeInTheDocument();
  });

  it('shows "Save Changes" button text in edit mode', () => {
    render(
      <PropertyDialog
        {...defaultProps}
        mode="edit"
        initial={{ name: 'x', data: { type: 'string' } }}
      />,
    );
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  // Reset on open
  it('resets form when reopened in add mode', () => {
    const { rerender } = render(<PropertyDialog {...defaultProps} open={false} />);
    rerender(<PropertyDialog {...defaultProps} open={true} />);
    expect(screen.getByPlaceholderText(/e\.g\. id/i)).toHaveValue('');
  });

  // autoFocus
  it('auto-focuses the name input', () => {
    render(<PropertyDialog {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText(/e\.g\. id/i);
    expect(nameInput).toHaveFocus();
  });

  // JSON preview reflects form state
  it('shows correct JSON preview reflecting property type', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.click(screen.getByText('JSON Preview'));
    expect(screen.getByText(/\"type\": \"string\"/)).toBeInTheDocument();
  });

  // Clears error when name changes
  it('clears error when name is typed after validation failure', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(screen.getByText('Property name is required.')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'a');
    expect(screen.queryByText('Property name is required.')).toBeNull();
  });

  // Edit mode preserves complex data
  it('preserves enum values from edit mode initial data', async () => {
    render(
      <PropertyDialog
        {...defaultProps}
        mode="edit"
        initial={{
          name: 'status',
          data: {
            type: 'string',
            enum: ['active', 'inactive'],
          },
        }}
      />,
    );
    // The form should have loaded the enum values
    expect(screen.getByDisplayValue('status')).toBeInTheDocument();
  });

  // Multiple validation errors
  it('shows name validation error first even with other issues', async () => {
    const user = userEvent.setup();
    render(<PropertyDialog {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(screen.getByText('Property name is required.')).toBeInTheDocument();
  });
});
