/**
 * Unit tests for PropertyFormFields.
 * Reference: GitHub #104
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropertyFormFields from '@/app/dashboard/components/PropertyFormFields';
import type { PropertyFormData } from '@/app/dashboard/utils/propertySchemaUtils';
import { FORMAT_OPTIONS } from '@/app/dashboard/utils/propertySchemaUtils';

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  jest.clearAllMocks();
});

describe('PropertyFormFields', () => {
  const mockOnChange = jest.fn();

  const defaultProps = {
    baseType: 'string' as string,
    isArray: false,
    data: {} as PropertyFormData,
    onChange: mockOnChange,
  };

  it('renders the form fields container', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByTestId('property-form-fields')).toBeInTheDocument();
  });

  it('renders the Basic Info section by default (open)', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByText('Basic Info')).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('renders the Property Flags section header', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByText('Property Flags')).toBeInTheDocument();
  });

  it('renders Enum / Const Values section header', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByText('Enum / Const Values')).toBeInTheDocument();
  });

  it('renders Advanced section header', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('renders External Docs & XML section header', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByText('External Docs & XML')).toBeInTheDocument();
  });

  // String type sections
  it('shows String Constraints section for string type', () => {
    render(<PropertyFormFields {...defaultProps} baseType="string" />);
    expect(screen.getByText('String Constraints')).toBeInTheDocument();
  });

  it('does not show String Constraints for non-string types', () => {
    render(<PropertyFormFields {...defaultProps} baseType="number" />);
    expect(screen.queryByText('String Constraints')).toBeNull();
  });

  // Number type sections
  it('shows Number Constraints section for number type', () => {
    render(<PropertyFormFields {...defaultProps} baseType="number" />);
    expect(screen.getByText('Number Constraints')).toBeInTheDocument();
  });

  it('shows Number Constraints section for integer type', () => {
    render(<PropertyFormFields {...defaultProps} baseType="integer" />);
    expect(screen.getByText('Number Constraints')).toBeInTheDocument();
  });

  it('does not show Number Constraints for string type', () => {
    render(<PropertyFormFields {...defaultProps} baseType="string" />);
    expect(screen.queryByText('Number Constraints')).toBeNull();
  });

  // Array type sections
  it('shows Array Constraints section when isArray is true', () => {
    render(<PropertyFormFields {...defaultProps} isArray={true} />);
    expect(screen.getByText('Array Constraints')).toBeInTheDocument();
  });

  it('does not show Array Constraints when isArray is false', () => {
    render(<PropertyFormFields {...defaultProps} isArray={false} />);
    expect(screen.queryByText('Array Constraints')).toBeNull();
  });

  // Object type sections
  it('shows Object Constraints section for object type', () => {
    render(<PropertyFormFields {...defaultProps} baseType="object" />);
    expect(screen.getByText('Object Constraints')).toBeInTheDocument();
  });

  it('does not show Object Constraints for string type', () => {
    render(<PropertyFormFields {...defaultProps} baseType="string" />);
    expect(screen.queryByText('Object Constraints')).toBeNull();
  });

  // Boolean type - no string/number/array/object sections
  it('does not show type-specific constraint sections for boolean', () => {
    render(<PropertyFormFields {...defaultProps} baseType="boolean" />);
    expect(screen.queryByText('String Constraints')).toBeNull();
    expect(screen.queryByText('Number Constraints')).toBeNull();
    expect(screen.queryByText('Object Constraints')).toBeNull();
  });

  // Null type - no type-specific sections
  it('does not show type-specific constraint sections for null', () => {
    render(<PropertyFormFields {...defaultProps} baseType="null" />);
    expect(screen.queryByText('String Constraints')).toBeNull();
    expect(screen.queryByText('Number Constraints')).toBeNull();
    expect(screen.queryByText('Object Constraints')).toBeNull();
  });

  // Title visibility
  it('shows title field when showTitle is true (default)', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });

  it('does not show title field when showTitle is false', () => {
    render(<PropertyFormFields {...defaultProps} showTitle={false} />);
    expect(screen.queryByLabelText(/^title/i)).toBeNull();
  });

  // Basic info interactions
  it('calls onChange when description is typed', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    const descField = screen.getByPlaceholderText(/describe this property/i);
    await user.type(descField, 'A');
    expect(mockOnChange).toHaveBeenCalledWith('description', expect.stringContaining('A'));
  });

  it('calls onChange when default value is typed', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    const defaultField = screen.getByPlaceholderText(/default value/i);
    await user.type(defaultField, 'x');
    expect(mockOnChange).toHaveBeenCalledWith('default', expect.stringContaining('x'));
  });

  // Property flags
  it('shows flag checkboxes when Property Flags section is expanded', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    await user.click(screen.getByText('Property Flags'));
    expect(screen.getByLabelText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Nullable')).toBeInTheDocument();
    expect(screen.getByLabelText('Read Only')).toBeInTheDocument();
    expect(screen.getByLabelText('Write Only')).toBeInTheDocument();
    expect(screen.getByLabelText('Deprecated')).toBeInTheDocument();
  });

  it('calls onChange when Required checkbox is toggled', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    await user.click(screen.getByText('Property Flags'));
    await user.click(screen.getByLabelText('Required'));
    expect(mockOnChange).toHaveBeenCalledWith('required', true);
  });

  it('shows deprecation message input when deprecated is checked', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ deprecated: true }}
      />,
    );
    await user.click(screen.getByText('Property Flags'));
    expect(screen.getByPlaceholderText(/reason for deprecation/i)).toBeInTheDocument();
  });

  it('does not show deprecation message when deprecated is false', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ deprecated: false }}
      />,
    );
    await user.click(screen.getByText('Property Flags'));
    expect(screen.queryByPlaceholderText(/reason for deprecation/i)).toBeNull();
  });

  // String constraints interaction
  it('shows pattern input when String Constraints section is expanded', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="string" data={{ format: '' }} />);
    await user.click(screen.getByText('String Constraints'));
    expect(screen.getByPlaceholderText('^[a-zA-Z]+$')).toBeInTheDocument();
  });

  it('shows min/max length inputs for string type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="string" data={{ format: '' }} />);
    await user.click(screen.getByText('String Constraints'));
    expect(screen.getByLabelText(/min length/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max length/i)).toBeInTheDocument();
  });

  // Number constraints interaction
  it('shows min/max/multipleOf inputs for number type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="number" data={{ format: '' }} />);
    await user.click(screen.getByText('Number Constraints'));
    expect(screen.getByLabelText(/^minimum/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^maximum/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/multiple of/i)).toBeInTheDocument();
  });

  // Array constraints interaction
  it('shows min/max items and unique items for array type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} isArray={true} />);
    await user.click(screen.getByText('Array Constraints'));
    expect(screen.getByLabelText(/min items/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max items/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/unique items/i)).toBeInTheDocument();
  });

  it('shows tuple mode checkbox for array type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} isArray={true} />);
    await user.click(screen.getByText('Array Constraints'));
    expect(screen.getByLabelText(/tuple mode/i)).toBeInTheDocument();
  });

  it('shows items schema input when tuple mode is checked', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        isArray={true}
        data={{ tupleMode: true }}
      />,
    );
    await user.click(screen.getByText('Array Constraints'));
    expect(screen.getByLabelText(/items schema/i)).toBeInTheDocument();
  });

  // Object constraints interaction
  it('shows additional properties selector for object type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="object" />);
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByLabelText(/additional properties/i)).toBeInTheDocument();
  });

  it('shows min/max properties for object type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="object" />);
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByLabelText(/min properties/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max properties/i)).toBeInTheDocument();
  });

  it('shows property names pattern for object type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="object" />);
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByLabelText(/property names pattern/i)).toBeInTheDocument();
  });

  // Enum / Const interaction
  it('shows const input when Enum / Const section is expanded', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    await user.click(screen.getByText('Enum / Const Values'));
    expect(screen.getByPlaceholderText(/constant value/i)).toBeInTheDocument();
  });

  it('shows enum input and add button', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    await user.click(screen.getByText('Enum / Const Values'));
    expect(screen.getByPlaceholderText(/add enum value/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add enum value/i)).toBeInTheDocument();
  });

  it('shows const warning when const value is set', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ const: '"hello"' }}
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    expect(screen.getByText(/const is mutually exclusive with enum/i)).toBeInTheDocument();
  });

  it('renders existing enum values', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ enum: ['alpha', 'beta'] }}
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('calls onChange to add an enum value', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ enum: ['a'] }}
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    const enumInput = screen.getByPlaceholderText(/add enum value/i);
    await user.type(enumInput, 'b');
    await user.click(screen.getByLabelText(/add enum value/i));
    expect(mockOnChange).toHaveBeenCalledWith('enum', ['a', 'b']);
  });

  it('shows error when adding empty enum value', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    await user.click(screen.getByText('Enum / Const Values'));
    await user.click(screen.getByLabelText(/add enum value/i));
    expect(screen.getByText(/enum value cannot be empty/i)).toBeInTheDocument();
  });

  it('shows error when adding duplicate enum value', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ enum: ['existing'] }}
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    const enumInput = screen.getByPlaceholderText(/add enum value/i);
    await user.type(enumInput, 'existing');
    await user.click(screen.getByLabelText(/add enum value/i));
    expect(screen.getByText(/this value already exists/i)).toBeInTheDocument();
  });

  it('shows error when adding non-number enum for number type', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="number"
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    const enumInput = screen.getByPlaceholderText(/add enum value/i);
    await user.type(enumInput, 'abc');
    await user.click(screen.getByLabelText(/add enum value/i));
    expect(screen.getByText(/value must be a valid number/i)).toBeInTheDocument();
  });

  it('shows error when adding decimal for integer type', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="integer"
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    const enumInput = screen.getByPlaceholderText(/add enum value/i);
    await user.type(enumInput, '1.5');
    await user.click(screen.getByLabelText(/add enum value/i));
    expect(screen.getByText(/value must be an integer/i)).toBeInTheDocument();
  });

  it('calls onChange to remove an enum value', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ enum: ['x', 'y'] }}
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    await user.click(screen.getByLabelText('Remove enum x'));
    expect(mockOnChange).toHaveBeenCalledWith('enum', ['y']);
  });

  // Advanced section
  it('shows NOT schema field when Advanced section is expanded', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    await user.click(screen.getByText('Advanced'));
    expect(screen.getByLabelText(/not schema/i)).toBeInTheDocument();
  });

  it('shows $comment field when Advanced section is expanded', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    await user.click(screen.getByText('Advanced'));
    expect(screen.getByPlaceholderText(/internal comment/i)).toBeInTheDocument();
  });

  it('shows content media type field when Advanced section is expanded', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    await user.click(screen.getByText('Advanced'));
    expect(screen.getByPlaceholderText(/application\/octet-stream/i)).toBeInTheDocument();
  });

  // External Docs & XML section
  it('shows external docs URL when section is expanded', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    await user.click(screen.getByText('External Docs & XML'));
    expect(screen.getByPlaceholderText(/https:\/\/docs\.example\.com/i)).toBeInTheDocument();
  });

  it('shows XML serialization fields when section is expanded', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} />);
    await user.click(screen.getByText('External Docs & XML'));
    expect(screen.getByText(/xml serialization/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Attribute')).toBeInTheDocument();
    expect(screen.getByLabelText('Wrapped')).toBeInTheDocument();
  });

  // Examples
  it('renders existing examples', () => {
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ examples: ['"hello"', '42'] }}
      />,
    );
    expect(screen.getByText('"hello"')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('calls onChange to add an example', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ examples: [] }}
      />,
    );
    const input = screen.getByPlaceholderText(/add example value/i);
    await user.type(input, '"test"');
    await user.click(screen.getByLabelText(/add example/i));
    expect(mockOnChange).toHaveBeenCalledWith('examples', ['"test"']);
  });

  it('calls onChange to remove an example', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ examples: ['a', 'b'] }}
      />,
    );
    await user.click(screen.getByLabelText('Remove example 0'));
    expect(mockOnChange).toHaveBeenCalledWith('examples', ['b']);
  });

  // Data pre-population
  it('pre-fills all string constraint fields from data', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="string"
        data={{
          format: '',
          pattern: '^[a-z]+$',
          minLength: '3',
          maxLength: '50',
        }}
      />,
    );
    await user.click(screen.getByText('String Constraints'));
    expect(screen.getByDisplayValue('^[a-z]+$')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('pre-fills number constraint fields from data', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="number"
        data={{
          format: '',
          minimum: '10',
          maximum: '99',
          multipleOf: '0.5',
        }}
      />,
    );
    await user.click(screen.getByText('Number Constraints'));
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('99')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.5')).toBeInTheDocument();
  });

  it('pre-fills array constraint fields from data', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        isArray={true}
        data={{
          minItems: '1',
          maxItems: '20',
          uniqueItems: true,
        }}
      />,
    );
    await user.click(screen.getByText('Array Constraints'));
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
  });

  it('pre-fills object constraint fields from data', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="object"
        data={{
          minProperties: '2',
          maxProperties: '8',
          propertyNamesPattern: '^[a-z]',
        }}
      />,
    );
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('8')).toBeInTheDocument();
    expect(screen.getByDisplayValue('^[a-z]')).toBeInTheDocument();
  });

  // Contains conditional fields
  it('shows minContains/maxContains when contains is set', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        isArray={true}
        data={{ contains: '{ "type": "string" }' }}
      />,
    );
    await user.click(screen.getByText('Array Constraints'));
    expect(screen.getByLabelText(/min contains/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max contains/i)).toBeInTheDocument();
  });

  it('does not show minContains/maxContains when contains is empty', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        isArray={true}
        data={{ contains: '' }}
      />,
    );
    await user.click(screen.getByText('Array Constraints'));
    expect(screen.queryByLabelText(/min contains/i)).toBeNull();
    expect(screen.queryByLabelText(/max contains/i)).toBeNull();
  });

  // Unevaluated items schema visibility
  it('shows unevaluatedItemsSchema when unevaluatedItems is schema', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        isArray={true}
        data={{ unevaluatedItems: 'schema' }}
      />,
    );
    await user.click(screen.getByText('Array Constraints'));
    expect(screen.getByLabelText(/unevaluated items schema/i)).toBeInTheDocument();
  });

  it('does not show unevaluatedItemsSchema when unevaluatedItems is not schema', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        isArray={true}
        data={{ unevaluatedItems: 'allow' }}
      />,
    );
    await user.click(screen.getByText('Array Constraints'));
    expect(screen.queryByLabelText(/unevaluated items schema/i)).toBeNull();
  });

  // Additional properties conditional fields
  it('shows type selector when additionalProperties is type', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="object"
        data={{ additionalProperties: 'type' }}
      />,
    );
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByLabelText(/^type/i)).toBeInTheDocument();
  });

  it('shows schema input when additionalProperties is schema', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="object"
        data={{ additionalProperties: 'schema' }}
      />,
    );
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByPlaceholderText(/classname or json schema/i)).toBeInTheDocument();
  });

  // Unevaluated properties schema visibility
  it('shows unevaluatedPropertiesSchema when unevaluatedProperties is schema', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="object"
        data={{ unevaluatedProperties: 'schema' }}
      />,
    );
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByLabelText(/unevaluated properties schema/i)).toBeInTheDocument();
  });

  // Number badge labels
  it('shows Integer badge for integer type', () => {
    render(<PropertyFormFields {...defaultProps} baseType="integer" />);
    expect(screen.getByText('Integer')).toBeInTheDocument();
  });

  it('shows Number badge for number type', () => {
    render(<PropertyFormFields {...defaultProps} baseType="number" />);
    expect(screen.getByText('Number')).toBeInTheDocument();
  });

  it('shows String badge for string type', () => {
    render(<PropertyFormFields {...defaultProps} baseType="string" />);
    expect(screen.getByText('String')).toBeInTheDocument();
  });

  it('shows Array badge when isArray is true', () => {
    render(<PropertyFormFields {...defaultProps} isArray={true} />);
    expect(screen.getByText('Array')).toBeInTheDocument();
  });

  it('shows Object badge for object type', () => {
    render(<PropertyFormFields {...defaultProps} baseType="object" />);
    expect(screen.getByText('Object')).toBeInTheDocument();
  });

  it('shows 2020-12 badge on Advanced section', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByText('2020-12')).toBeInTheDocument();
  });

  it('shows OpenAPI badge on External Docs & XML section', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByText('OpenAPI')).toBeInTheDocument();
  });

  // Extensions section
  it('renders Extensions section header', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByText('Extensions')).toBeInTheDocument();
  });

  it('renders x- badge on Extensions section', () => {
    render(<PropertyFormFields {...defaultProps} />);
    expect(screen.getByText('x-')).toBeInTheDocument();
  });

  it('renders existing extensions', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ extensions: { 'x-custom': 'hello', 'x-version': '2' } }}
      />,
    );
    await user.click(screen.getByText('Extensions'));
    expect(screen.getByText('x-custom')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('x-version')).toBeInTheDocument();
  });

  it('calls onChange to add an extension', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} data={{}} />);
    await user.click(screen.getByText('Extensions'));
    const keyInput = screen.getByPlaceholderText(/x-custom-field/i);
    const valueInput = screen.getByPlaceholderText(/value \(json or string\)/i);
    await user.type(keyInput, 'x-foo');
    await user.type(valueInput, 'bar');
    await user.click(screen.getByLabelText('Add extension'));
    expect(mockOnChange).toHaveBeenCalledWith('extensions', { 'x-foo': 'bar' });
  });

  it('auto-prefixes x- when adding extension without it', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} data={{}} />);
    await user.click(screen.getByText('Extensions'));
    const keyInput = screen.getByPlaceholderText(/x-custom-field/i);
    const valueInput = screen.getByPlaceholderText(/value \(json or string\)/i);
    await user.type(keyInput, 'mykey');
    await user.type(valueInput, 'myval');
    await user.click(screen.getByLabelText('Add extension'));
    expect(mockOnChange).toHaveBeenCalledWith('extensions', { 'x-mykey': 'myval' });
  });

  it('shows validation error for extension key with empty suffix (x- only)', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} data={{}} />);
    await user.click(screen.getByText('Extensions'));
    const keyInput = screen.getByPlaceholderText(/x-custom-field/i);
    await user.type(keyInput, 'x-');
    await user.click(screen.getByLabelText('Add extension'));
    expect(mockOnChange).not.toHaveBeenCalled();
    expect(screen.getByText(/extension key must start with "x-"/i)).toBeInTheDocument();
  });

  it('shows validation error for extension key with invalid characters', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} data={{}} />);
    await user.click(screen.getByText('Extensions'));
    const keyInput = screen.getByPlaceholderText(/x-custom-field/i);
    await user.type(keyInput, 'x-bad key!');
    await user.click(screen.getByLabelText('Add extension'));
    expect(mockOnChange).not.toHaveBeenCalled();
    expect(screen.getByText(/extension key must start with "x-"/i)).toBeInTheDocument();
  });

  it('clears extension key error when key input changes', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} data={{}} />);
    await user.click(screen.getByText('Extensions'));
    const keyInput = screen.getByPlaceholderText(/x-custom-field/i);
    await user.type(keyInput, 'x-');
    await user.click(screen.getByLabelText('Add extension'));
    expect(screen.getByText(/extension key must start with "x-"/i)).toBeInTheDocument();
    await user.clear(keyInput);
    await user.type(keyInput, 'x-valid');
    expect(screen.queryByText(/extension key must start with "x-"/i)).toBeNull();
  });

  it('calls onChange to delete an extension', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ extensions: { 'x-foo': 'bar', 'x-baz': 'qux' } }}
      />,
    );
    await user.click(screen.getByText('Extensions'));
    await user.click(screen.getByLabelText('Remove extension x-foo'));
    expect(mockOnChange).toHaveBeenCalledWith('extensions', { 'x-baz': 'qux' });
  });

  // Pattern Properties
  it('shows Pattern Properties section for object type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="object" data={{}} />);
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByText('Pattern Properties')).toBeInTheDocument();
  });

  it('renders existing pattern properties', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="object"
        data={{ patternProperties: { '^env_': { type: 'string' } } }}
      />,
    );
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByText('^env_')).toBeInTheDocument();
  });

  it('calls onChange to add a pattern property', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="object" data={{}} />);
    await user.click(screen.getByText('Object Constraints'));
    const patternInput = screen.getByPlaceholderText('^env_|^flag_');
    await user.type(patternInput, '^test_');
    await user.click(screen.getByLabelText('Add pattern property'));
    expect(mockOnChange).toHaveBeenCalledWith('patternProperties', {
      '^test_': { type: 'string' },
    });
  });

  it('calls onChange to delete a pattern property', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="object"
        data={{ patternProperties: { '^env_': { type: 'string' }, '^flag_': { type: 'boolean' } } }}
      />,
    );
    await user.click(screen.getByText('Object Constraints'));
    await user.click(screen.getByLabelText('Remove pattern ^env_'));
    expect(mockOnChange).toHaveBeenCalledWith('patternProperties', {
      '^flag_': { type: 'boolean' },
    });
  });

  // Dependent Schemas
  it('shows Dependent Schemas section for object type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="object" data={{}} />);
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByText('Dependent Schemas')).toBeInTheDocument();
  });

  it('renders existing dependent schemas', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="object"
        data={{
          dependentSchemas: {
            status: {
              if: { properties: { status: {} } },
              then: { required: ['reason'] },
              else: { required: [] },
            },
          },
        }}
      />,
    );
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByText('status')).toBeInTheDocument();
  });

  it('calls onChange to add a dependent schema', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="object" data={{}} />);
    await user.click(screen.getByText('Object Constraints'));
    const input = screen.getByPlaceholderText('Enter trigger property name');
    await user.type(input, 'myProp');
    await user.click(screen.getByLabelText('Add dependent schema'));
    expect(mockOnChange).toHaveBeenCalledWith('dependentSchemas', {
      myProp: {
        if: { properties: { myProp: {} } },
        then: { required: [] },
        else: { required: [] },
      },
    });
  });

  it('calls onChange to delete a dependent schema', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="object"
        data={{
          dependentSchemas: {
            a: { if: { properties: { a: {} } }, then: { required: [] }, else: { required: [] } },
            b: { if: { properties: { b: {} } }, then: { required: [] }, else: { required: [] } },
          },
        }}
      />,
    );
    await user.click(screen.getByText('Object Constraints'));
    await user.click(screen.getByLabelText('Remove dependent schema a'));
    expect(mockOnChange).toHaveBeenCalledWith('dependentSchemas', {
      b: { if: { properties: { b: {} } }, then: { required: [] }, else: { required: [] } },
    });
  });

  // readOnly / writeOnly mutual exclusivity
  it('unsets writeOnly when readOnly is toggled on', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ writeOnly: true }}
      />,
    );
    await user.click(screen.getByText('Property Flags'));
    const readOnlyCheckbox = screen.getByLabelText('Read Only');
    await user.click(readOnlyCheckbox);
    expect(mockOnChange).toHaveBeenCalledWith('readOnly', true);
    expect(mockOnChange).toHaveBeenCalledWith('writeOnly', false);
  });

  it('unsets readOnly when writeOnly is toggled on', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ readOnly: true }}
      />,
    );
    await user.click(screen.getByText('Property Flags'));
    const writeOnlyCheckbox = screen.getByLabelText('Write Only');
    await user.click(writeOnlyCheckbox);
    expect(mockOnChange).toHaveBeenCalledWith('writeOnly', true);
    expect(mockOnChange).toHaveBeenCalledWith('readOnly', false);
  });

  // Enum sorting
  it('shows enum sort buttons when more than 1 enum value', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ enum: ['banana', 'apple', 'cherry'] }}
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    expect(screen.getByLabelText('Sort enum A-Z')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort enum Z-A')).toBeInTheDocument();
  });

  it('does not show enum sort buttons with fewer than 2 enum values', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ enum: ['one'] }}
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    expect(screen.queryByLabelText('Sort enum A-Z')).not.toBeInTheDocument();
  });

  it('sorts enum values A-Z when sort button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ enum: ['cherry', 'apple', 'banana'] }}
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    await user.click(screen.getByLabelText('Sort enum A-Z'));
    expect(mockOnChange).toHaveBeenCalledWith('enum', ['apple', 'banana', 'cherry']);
  });

  it('sorts enum values Z-A when sort button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ enum: ['apple', 'cherry', 'banana'] }}
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    await user.click(screen.getByLabelText('Sort enum Z-A'));
    expect(mockOnChange).toHaveBeenCalledWith('enum', ['cherry', 'banana', 'apple']);
  });

  it('sorts numeric enum values numerically', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="number"
        data={{ enum: ['10', '2', '30'] }}
      />,
    );
    await user.click(screen.getByText('Enum / Const Values'));
    await user.click(screen.getByLabelText('Sort enum A-Z'));
    expect(mockOnChange).toHaveBeenCalledWith('enum', ['2', '10', '30']);
  });

  // Example JSON validation
  it('shows error when adding non-JSON example', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ examples: [] }}
      />,
    );
    const input = screen.getByPlaceholderText(/add example value/i);
    await user.type(input, 'not valid json');
    await user.click(screen.getByLabelText(/add example/i));
    expect(screen.getByText('Example must be valid JSON')).toBeInTheDocument();
    expect(mockOnChange).not.toHaveBeenCalledWith('examples', expect.anything());
  });

  it('shows error when adding empty example', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ examples: [] }}
      />,
    );
    await user.click(screen.getByLabelText(/add example/i));
    expect(screen.getByText('Example value cannot be empty')).toBeInTheDocument();
  });

  // Generate example button
  it('shows generate example button', () => {
    render(<PropertyFormFields {...defaultProps} data={{}} />);
    expect(screen.getByLabelText('Generate example')).toBeInTheDocument();
  });

  it('generates a string example when clicked', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} data={{}} />);
    await user.click(screen.getByLabelText('Generate example'));
    expect(mockOnChange).toHaveBeenCalledWith('examples', expect.any(Array));
    const call = mockOnChange.mock.calls.find(
      (c: any[]) => c[0] === 'examples',
    );
    expect(call).toBeTruthy();
    expect(call![1].length).toBe(1);
    // Should be valid JSON
    expect(() => JSON.parse(call![1][0])).not.toThrow();
  });

  it('generates an email example for string with email format', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ format: 'email' }}
      />,
    );
    await user.click(screen.getByLabelText('Generate example'));
    const call = mockOnChange.mock.calls.find(
      (c: any[]) => c[0] === 'examples',
    );
    expect(call![1][0]).toContain('@');
  });

  // Property names format/description
  it('shows property names format selector for object type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="object" data={{}} />);
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByText('Prop Names Format')).toBeInTheDocument();
  });

  it('prop names format selector includes all string formats from FORMAT_OPTIONS', async () => {
    const user = userEvent.setup();
    // Verify the select renders and accepts formats from FORMAT_OPTIONS.string
    // that were not in the previous hard-coded list (e.g. 'iri', 'uri-reference').
    render(
      <PropertyFormFields
        {...defaultProps}
        baseType="object"
        data={{ propertyNamesFormat: 'iri' }}
      />,
    );
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByText('Prop Names Format')).toBeInTheDocument();
    // FORMAT_OPTIONS.string should include all standard string formats
    expect(FORMAT_OPTIONS.string.length).toBeGreaterThan(8);
    expect(FORMAT_OPTIONS.string.some((f) => f.value === 'iri')).toBe(true);
    expect(FORMAT_OPTIONS.string.some((f) => f.value === 'uri-reference')).toBe(true);
    expect(FORMAT_OPTIONS.string.some((f) => f.value === 'idn-email')).toBe(true);
  });

  it('shows property names description for object type', async () => {
    const user = userEvent.setup();
    render(<PropertyFormFields {...defaultProps} baseType="object" data={{}} />);
    await user.click(screen.getByText('Object Constraints'));
    expect(screen.getByText('Prop Names Description')).toBeInTheDocument();
  });

  // Content media type inline for binary/byte
  it('shows inline content media type fields when format is binary', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ format: 'binary' }}
      />,
    );
    await user.click(screen.getByText('String Constraints'));
    expect(screen.getByText('Binary Content Settings')).toBeInTheDocument();
  });

  it('shows inline content media type fields when format is byte', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ format: 'byte' }}
      />,
    );
    await user.click(screen.getByText('String Constraints'));
    expect(screen.getByText('Binary Content Settings')).toBeInTheDocument();
  });

  it('does not show inline content media type fields for non-binary formats', async () => {
    const user = userEvent.setup();
    render(
      <PropertyFormFields
        {...defaultProps}
        data={{ format: 'email' }}
      />,
    );
    await user.click(screen.getByText('String Constraints'));
    expect(screen.queryByText('Binary Content Settings')).not.toBeInTheDocument();
  });
});
