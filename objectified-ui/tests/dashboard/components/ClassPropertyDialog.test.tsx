/**
 * Unit tests for ClassPropertyDialog.
 * Reference: GitHub #63 — canvas mutations
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

  const defaultProps = {
    availableClassNamesForRef: [] as string[],
    onSave: mockOnSave,
    onClose: mockOnClose,
  };

  it('renders nothing when closed', () => {
    render(
      <ClassPropertyDialog
        open={false}
        mode="add"
        availableProperties={[]}
        {...defaultProps}
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
        {...defaultProps}
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
        {...defaultProps}
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
        {...defaultProps}
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
        {...defaultProps}
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
        {...defaultProps}
      />
    );
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), '  myField  ');
    await user.type(screen.getByPlaceholderText(/optional description/i), 'A field');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'myField',
      description: 'A field',
      propertyId: undefined,
      referenceClass: undefined,
      refType: undefined,
      overrideRequired: false,
      order: undefined,
      parentId: null,
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        {...defaultProps}
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
        {...defaultProps}
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
        {...defaultProps}
      />
    );
    expect(screen.queryByText('Link to Project Property')).toBeNull();
  });

  // Reference class tests — GitHub #98

  it('shows reference to class section when availableClassNamesForRef is non-empty', () => {
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        availableClassNamesForRef={['Order', 'Product']}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    expect(screen.getByText('Reference to class')).toBeInTheDocument();
  });

  it('does not show reference section when availableClassNamesForRef is empty', () => {
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        availableClassNamesForRef={[]}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    expect(screen.queryByText('Reference to class')).toBeNull();
  });

  it('includes referenceClass and refType in onSave when initial values are set', async () => {
    const user = userEvent.setup();
    render(
      <ClassPropertyDialog
        open
        mode="edit"
        availableProperties={[]}
        availableClassNamesForRef={['Order', 'Product']}
        initial={{ name: 'customer', description: '', referenceClass: 'Order', refType: 'optional' }}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'customer',
      description: '',
      propertyId: undefined,
      referenceClass: 'Order',
      refType: 'optional',
      overrideRequired: false,
      order: undefined,
      parentId: null,
    });
  });

  it('includes referenceClass with default direct refType in onSave when refType is not set', async () => {
    const user = userEvent.setup();
    render(
      <ClassPropertyDialog
        open
        mode="edit"
        availableProperties={[]}
        availableClassNamesForRef={['Order', 'Product']}
        initial={{ name: 'product', description: '', referenceClass: 'Product' }}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'product',
      description: '',
      propertyId: undefined,
      referenceClass: 'Product',
      refType: 'direct',
      overrideRequired: false,
      order: undefined,
      parentId: null,
    });
  });

  it('includes bidirectional refType in onSave when initial refType is bidirectional', async () => {
    const user = userEvent.setup();
    render(
      <ClassPropertyDialog
        open
        mode="edit"
        availableProperties={[]}
        availableClassNamesForRef={['Order', 'Product']}
        initial={{ name: 'link', description: '', referenceClass: 'Order', refType: 'bidirectional' }}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'link',
      description: '',
      propertyId: undefined,
      referenceClass: 'Order',
      refType: 'bidirectional',
      overrideRequired: false,
      order: undefined,
      parentId: null,
    });
  });

  it('omits referenceClass and refType in onSave when no reference class is selected', async () => {
    const user = userEvent.setup();
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        availableClassNamesForRef={['Order', 'Product']}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'myField');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'myField',
      description: '',
      propertyId: undefined,
      referenceClass: undefined,
      refType: undefined,
      overrideRequired: false,
      order: undefined,
      parentId: null,
    });
  });

  it('shows reference type selector only when a reference class is selected', () => {
    render(
      <ClassPropertyDialog
        open
        mode="edit"
        availableProperties={[]}
        availableClassNamesForRef={['Order', 'Product']}
        initial={{ name: 'customer', description: '', referenceClass: 'Order', refType: 'direct' }}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    expect(screen.getByText('Reference type')).toBeInTheDocument();
  });

  it('does not show reference type selector when no reference class is selected', () => {
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        availableClassNamesForRef={['Order', 'Product']}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );
    expect(screen.queryByText('Reference type')).toBeNull();
  });

  // GitHub #113 — override required, order, nested parent_id

  it('shows Required (override) checkbox', () => {
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        {...defaultProps}
      />
    );
    expect(screen.getByLabelText('Required (override)')).toBeInTheDocument();
  });

  it('shows Order field', () => {
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        {...defaultProps}
      />
    );
    expect(screen.getByLabelText('Display order')).toBeInTheDocument();
  });

  it('includes overrideRequired true in onSave when Required is checked', async () => {
    const user = userEvent.setup();
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        {...defaultProps}
      />
    );
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'id');
    await user.click(screen.getByLabelText('Required (override)'));
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({ overrideRequired: true })
    );
  });

  it('includes order in onSave when Order is set', async () => {
    const user = userEvent.setup();
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        {...defaultProps}
      />
    );
    await user.type(screen.getByPlaceholderText(/e\.g\. id/i), 'id');
    await user.type(screen.getByLabelText('Display order'), '2');
    await user.click(screen.getByRole('button', { name: /add property/i }));
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({ order: 2 })
    );
  });

  it('shows Nested under dropdown when availableParentProperties is non-empty', () => {
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        availableParentProperties={[{ id: 'pid1', name: 'parentProp' }]}
        {...defaultProps}
      />
    );
    expect(screen.getByText('Nested under')).toBeInTheDocument();
  });

  it('does not show Nested under when availableParentProperties is empty', () => {
    render(
      <ClassPropertyDialog
        open
        mode="add"
        availableProperties={[]}
        availableParentProperties={[]}
        {...defaultProps}
      />
    );
    expect(screen.queryByText('Nested under')).toBeNull();
  });

  it('pre-fills overrideRequired, order, and parentId in edit mode', () => {
    render(
      <ClassPropertyDialog
        open
        mode="edit"
        availableProperties={[]}
        availableParentProperties={[{ id: 'pid1', name: 'parentProp' }]}
        initial={{
          name: 'child',
          description: '',
          overrideRequired: true,
          order: 1,
          parentId: 'pid1',
        }}
        {...defaultProps}
      />
    );
    expect(screen.getByDisplayValue('child')).toBeInTheDocument();
    const requiredCheckbox = screen.getByLabelText('Required (override)');
    expect(requiredCheckbox).toBeChecked();
    expect(screen.getByLabelText('Display order')).toHaveValue(1);
  });
});

