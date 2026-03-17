'use client';

/**
 * Reusable form fields for property creation/editing with full
 * JSON Schema 2020-12 / OpenAPI 3.2.0 support.
 * Reference: GitHub #104, #106 (stringConstraints), #107 (numberConstraints), #108 (arrayConstraints, tupleMode), #109 (objectConstraints).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Select from '@radix-ui/react-select';
import {
  ChevronDown,
  ChevronRight,
  Check,
  Plus,
  Trash2,
  FileText,
  Hash,
  List,
  Box,
  Settings,
  Code,
  ToggleLeft,
  ArrowUpAZ,
  ArrowDownAZ,
  Puzzle,
  Braces,
  Sparkles,
} from 'lucide-react';
import type { PropertyFormData } from '../utils/propertySchemaUtils';
import { FORMAT_OPTIONS } from '../utils/propertySchemaUtils';

export interface PropertyFormFieldsProps {
  baseType: string;
  isArray: boolean;
  data: PropertyFormData;
  onChange: (field: keyof PropertyFormData, value: any) => void;
  showTitle?: boolean;
  size?: 'small' | 'medium';
  availableClasses?: string[];
  availableProperties?: string[];
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, icon, badge, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="flex items-center gap-2 w-full py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group">
        <span className="p-1 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
          {icon}
        </span>
        <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200">
          {title}
        </span>
        {badge && (
          <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
            {badge}
          </span>
        )}
        {open
          ? <ChevronDown className="h-4 w-4 text-slate-400" />
          : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </Collapsible.Trigger>
      <Collapsible.Content className="px-3 pb-3 pt-1 space-y-3">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function FieldLabel({ htmlFor, children, optional }: { htmlFor?: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
    >
      {children}
      {optional && <span className="ml-1 text-slate-400 dark:text-slate-500">(optional)</span>}
    </label>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
    />
  );
}

function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
  onBlur,
  className: classNameProp,
  'aria-label': ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  onBlur?: () => void;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={rows}
      aria-label={ariaLabel}
      className={`w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono ${classNameProp ?? ''}`.trim()}
    />
  );
}

function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(val) => onChange(val === true)}
        className="h-4 w-4 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
      >
        <Checkbox.Indicator>
          <Check className="h-3 w-3 text-white" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label htmlFor={id} className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
        {label}
      </label>
    </div>
  );
}

const NONE_VALUE = '__none__';

/** Validates the suffix of an OpenAPI/JSON Schema extension key (after "x-"). */
const EXTENSION_KEY_SUFFIX_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function SelectField({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string }[];
  placeholder?: string;
}) {
  const normalised = options.map((opt) => ({
    ...opt,
    value: opt.value === '' ? NONE_VALUE : opt.value,
  }));
  const selectValue = value === '' ? NONE_VALUE : value;

  return (
    <Select.Root
      value={selectValue || undefined}
      onValueChange={(v) => onChange(v === NONE_VALUE ? '' : v)}
    >
      <Select.Trigger
        id={id}
        className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      >
        <Select.Value placeholder={placeholder || 'Select...'} />
        <Select.Icon>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="z-[10005] bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="p-1 max-h-48">
            {normalised.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="flex items-center px-3 py-1.5 rounded text-sm text-slate-900 dark:text-slate-100 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-700"
              >
                <Select.ItemText>
                  {opt.label}
                  {opt.description && (
                    <span className="ml-2 text-xs text-slate-400">{opt.description}</span>
                  )}
                </Select.ItemText>
                <Select.ItemIndicator className="ml-auto">
                  <Check className="h-4 w-4" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export const PropertyFormFields: React.FC<PropertyFormFieldsProps> = ({
  baseType,
  isArray,
  data,
  onChange,
  showTitle = true,
  availableClasses = [],
  availableProperties = [],
}) => {
  const [enumInput, setEnumInput] = useState('');
  const [enumError, setEnumError] = useState('');
  const [exampleInput, setExampleInput] = useState('');
  const [exampleError, setExampleError] = useState('');

  // Pattern properties local state
  const [newPatternKey, setNewPatternKey] = useState('');
  const [newPatternSchema, setNewPatternSchema] = useState('{ "type": "string" }');

  // Dependent schemas local state
  const [newDepPropName, setNewDepPropName] = useState('');

  // Extensions local state
  const [newExtKey, setNewExtKey] = useState('');
  const [newExtValue, setNewExtValue] = useState('');
  const [extKeyError, setExtKeyError] = useState('');

  // Prefix items (tuple) draft per index while editing invalid JSON
  const [prefixItemDrafts, setPrefixItemDrafts] = useState<Record<number, string>>({});

  // Object constraints: properties JSON draft, required property name input
  const [propertiesDraft, setPropertiesDraft] = useState('');
  const [objectRequiredInput, setObjectRequiredInput] = useState('');
  const [objectRequiredError, setObjectRequiredError] = useState('');

  const handleAddEnum = () => {
    if (!enumInput.trim()) {
      setEnumError('Enum value cannot be empty');
      return;
    }
    const trimmed = enumInput.trim();
    if (baseType === 'number' || baseType === 'integer') {
      const numValue = Number(trimmed);
      if (isNaN(numValue)) {
        setEnumError(`Value must be a valid ${baseType}`);
        return;
      }
      if (baseType === 'integer' && !Number.isInteger(numValue)) {
        setEnumError('Value must be an integer');
        return;
      }
    }
    if (data.enum?.includes(trimmed)) {
      setEnumError('This value already exists');
      return;
    }
    if (data.const) {
      onChange('const', undefined);
    }
    onChange('enum', [...(data.enum || []), trimmed]);
    setEnumInput('');
    setEnumError('');
  };

  const handleDeleteEnum = (value: string) => {
    onChange('enum', (data.enum || []).filter((v) => v !== value));
  };

  const handleAddExample = () => {
    if (!exampleInput.trim()) {
      setExampleError('Example value cannot be empty');
      return;
    }
    try {
      JSON.parse(exampleInput.trim());
    } catch {
      setExampleError('Example must be valid JSON');
      return;
    }
    onChange('examples', [...(data.examples || []), exampleInput.trim()]);
    setExampleInput('');
    setExampleError('');
  };

  const handleDeleteExample = (index: number) => {
    onChange('examples', (data.examples || []).filter((_, i) => i !== index));
  };

  const handleSortEnumAZ = () => {
    if (!data.enum || data.enum.length === 0) return;
    const sorted = [...data.enum].sort((a, b) => {
      if (baseType === 'number' || baseType === 'integer') {
        return Number(a) - Number(b);
      }
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    onChange('enum', sorted);
  };

  const handleSortEnumZA = () => {
    if (!data.enum || data.enum.length === 0) return;
    const sorted = [...data.enum].sort((a, b) => {
      if (baseType === 'number' || baseType === 'integer') {
        return Number(b) - Number(a);
      }
      return b.toLowerCase().localeCompare(a.toLowerCase());
    });
    onChange('enum', sorted);
  };

  const generateExample = () => {
    let exampleValue: any;
    if (data.enum && data.enum.length > 0) {
      exampleValue = data.enum[0];
      if (baseType === 'number' || baseType === 'integer') {
        const numValue = Number(exampleValue);
        if (!isNaN(numValue)) exampleValue = numValue;
      }
    } else {
      switch (baseType) {
        case 'string':
          if (data.format === 'email') exampleValue = 'user@example.com';
          else if (data.format === 'uri') exampleValue = 'https://example.com';
          else if (data.format === 'date') exampleValue = '2025-11-30';
          else if (data.format === 'date-time') exampleValue = '2025-11-30T12:00:00Z';
          else if (data.format === 'time') exampleValue = '12:00:00';
          else if (data.format === 'uuid') exampleValue = '123e4567-e89b-12d3-a456-426614174000';
          else exampleValue = data.description || 'example string';
          break;
        case 'number':
          exampleValue = data.minimum ? parseFloat(data.minimum) + (data.minimumType === 'exclusive' ? 0.1 : 0) : 42.5;
          break;
        case 'integer':
          exampleValue = data.minimum ? Math.ceil(parseFloat(data.minimum) + (data.minimumType === 'exclusive' ? 1 : 0)) : 42;
          break;
        case 'boolean':
          exampleValue = true;
          break;
        case 'object':
          exampleValue = { property: 'value' };
          break;
        default:
          exampleValue = null;
          break;
      }
    }
    if (isArray) exampleValue = [exampleValue];
    const jsonString = JSON.stringify(exampleValue, null, 2);
    onChange('examples', [...(data.examples || []), jsonString]);
  };

  const handleAddPatternProperty = () => {
    if (!newPatternKey.trim()) return;
    let schemaObj: any;
    try {
      schemaObj = JSON.parse(newPatternSchema.trim());
    } catch {
      return; // Invalid JSON, don't add
    }
    const updated = { ...(data.patternProperties || {}), [newPatternKey.trim()]: schemaObj };
    onChange('patternProperties', updated);
    setNewPatternKey('');
    setNewPatternSchema('{ "type": "string" }');
  };

  const handleDeletePatternProperty = (pattern: string) => {
    const updated = { ...(data.patternProperties || {}) };
    delete updated[pattern];
    onChange('patternProperties', Object.keys(updated).length > 0 ? updated : undefined);
  };

  const handleAddDependentSchema = () => {
    if (!newDepPropName.trim()) return;
    const newSchemas = {
      ...(data.dependentSchemas || {}),
      [newDepPropName.trim()]: {
        if: { properties: { [newDepPropName.trim()]: {} } },
        then: { required: [] },
        else: { required: [] },
      },
    };
    onChange('dependentSchemas', newSchemas);
    setNewDepPropName('');
  };

  const handleDeleteDependentSchema = (key: string) => {
    const updated = { ...(data.dependentSchemas || {}) };
    delete updated[key];
    onChange('dependentSchemas', Object.keys(updated).length > 0 ? updated : undefined);
  };

  const showObjectConstraints = baseType === 'object';
  useEffect(() => {
    if (showObjectConstraints) {
      setPropertiesDraft(JSON.stringify(data.properties || {}, null, 2));
    }
  }, [showObjectConstraints, data.properties]);

  const handlePropertiesBlur = () => {
    const raw = propertiesDraft.trim();
    if (!raw) {
      onChange('properties', undefined);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        onChange('properties', parsed);
      }
    } catch {
      // Invalid JSON; leave form data unchanged
    }
  };

  const handlePropertiesChange = (value: string) => {
    setPropertiesDraft(value);
    const raw = value.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        onChange('properties', parsed);
      }
    } catch {
      // Invalid JSON; don't update form data
    }
  };

  const handleAddObjectRequired = () => {
    const trimmed = objectRequiredInput.trim();
    if (!trimmed) {
      setObjectRequiredError('Property name cannot be empty');
      return;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
      setObjectRequiredError('Name must start with a letter or underscore and contain only letters, numbers, and underscores.');
      return;
    }
    if (data.objectRequired?.includes(trimmed)) {
      setObjectRequiredError('This property is already in the required list');
      return;
    }
    onChange('objectRequired', [...(data.objectRequired || []), trimmed]);
    setObjectRequiredInput('');
    setObjectRequiredError('');
  };

  const handleDeleteObjectRequired = (name: string) => {
    onChange('objectRequired', (data.objectRequired || []).filter((n) => n !== name));
  };

  const handleAddExtension = () => {
    const trimmedKey = newExtKey.trim();
    if (!trimmedKey) return;
    const key = trimmedKey.startsWith('x-') ? trimmedKey : `x-${trimmedKey}`;
    const suffix = key.slice(2);
    if (!suffix || !EXTENSION_KEY_SUFFIX_PATTERN.test(suffix)) {
      setExtKeyError('Extension key must start with "x-" followed by a name using letters, digits, hyphens, or underscores (e.g. x-my-field).');
      return;
    }
    setExtKeyError('');
    let parsedValue: any;
    try {
      parsedValue = JSON.parse(newExtValue.trim());
    } catch {
      parsedValue = newExtValue.trim();
    }
    const updated = { ...(data.extensions || {}), [key]: parsedValue };
    onChange('extensions', updated);
    setNewExtKey('');
    setNewExtValue('');
  };

  const handleDeleteExtension = (key: string) => {
    const updated = { ...(data.extensions || {}) };
    delete updated[key];
    onChange('extensions', Object.keys(updated).length > 0 ? updated : undefined);
  };

  const showStringConstraints = baseType === 'string';
  const showNumberConstraints = baseType === 'number' || baseType === 'integer';
  const showArrayConstraints = isArray;

  const formatOptions = FORMAT_OPTIONS[baseType] || [];
  const classRefOptions = availableClasses.map((className) => ({
    value: `#/components/schemas/${className}`,
    label: className,
    description: 'Class',
  }));
  const propertyRefOptions = availableProperties
    .map((propertyName) => ({
      value: `#/components/schemas/${propertyName}`,
      label: propertyName,
      description: 'Project property',
    }))
    .filter((opt) => !classRefOptions.some((classOpt) => classOpt.value === opt.value));
  const refOptions = [
    { value: '', label: 'None' },
    ...classRefOptions,
    ...propertyRefOptions,
  ];

  return (
    <div className="space-y-1" data-testid="property-form-fields">
      {/* Basic Info */}
      <Section
        title="Basic Info"
        icon={<FileText className="h-3.5 w-3.5" />}
        defaultOpen
      >
        {showTitle && (
          <div>
            <FieldLabel htmlFor="pff-title" optional>Title</FieldLabel>
            <TextInput
              id="pff-title"
              value={data.title || ''}
              onChange={(v) => onChange('title', v)}
              placeholder="Display title for the property"
            />
          </div>
        )}
        <div>
          <FieldLabel htmlFor="pff-description" optional>Description</FieldLabel>
          <TextArea
            id="pff-description"
            value={data.description || ''}
            onChange={(v) => onChange('description', v)}
            placeholder="Describe this property"
            rows={2}
          />
        </div>
        {baseType !== 'string' && !showNumberConstraints && (
          <div>
            <FieldLabel htmlFor="pff-default" optional>Default value</FieldLabel>
            <TextInput
              id="pff-default"
              value={data.default || ''}
              onChange={(v) => onChange('default', v)}
              placeholder="Default value"
            />
          </div>
        )}
        <div>
          <FieldLabel htmlFor="pff-ref" optional>$ref target</FieldLabel>
          <div className="space-y-2">
            {refOptions.length > 1 && (
              <SelectField
                id="pff-ref-select"
                aria-label="Select $ref target from available classes or project properties"
                value={data.$ref || ''}
                onChange={(v) => onChange('$ref', v)}
                options={refOptions}
                placeholder="Select class or project property"
              />
            )}
            <TextInput
              id="pff-ref"
              value={data.$ref || ''}
              onChange={(v) => onChange('$ref', v)}
              placeholder="#/components/schemas/ClassName"
            />
          </div>
        </div>
        {/* Examples */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FieldLabel optional>Examples</FieldLabel>
            <button
              type="button"
              onClick={generateExample}
              className="p-1 rounded-md text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
              aria-label="Generate example"
              title="Generate example based on schema"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                id="pff-example-input"
                value={exampleInput}
                onChange={(v) => { setExampleInput(v); setExampleError(''); }}
                placeholder="Add example value (JSON)"
              />
            </div>
            <button
              type="button"
              onClick={handleAddExample}
              className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm transition-colors"
              aria-label="Add example"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {exampleError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{exampleError}</p>}
          {(data.examples || []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {data.examples!.map((ex, i) => (
                <li key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 text-sm font-mono">
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{ex}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteExample(i)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    aria-label={`Remove example ${i}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* Property Flags */}
      <Section
        title="Property Flags"
        icon={<ToggleLeft className="h-3.5 w-3.5" />}
      >
        <div className="grid grid-cols-2 gap-2">
          <CheckboxField
            id="pff-required"
            label="Required"
            checked={data.required || false}
            onChange={(v) => onChange('required', v)}
          />
          <CheckboxField
            id="pff-nullable"
            label="Nullable"
            checked={data.nullable || false}
            onChange={(v) => onChange('nullable', v)}
          />
          <CheckboxField
            id="pff-readonly"
            label="Read Only"
            checked={data.readOnly || false}
            onChange={(v) => {
              onChange('readOnly', v);
              if (v) onChange('writeOnly', false);
            }}
          />
          <CheckboxField
            id="pff-writeonly"
            label="Write Only"
            checked={data.writeOnly || false}
            onChange={(v) => {
              onChange('writeOnly', v);
              if (v) onChange('readOnly', false);
            }}
          />
        </div>
        <CheckboxField
          id="pff-deprecated"
          label="Deprecated"
          checked={data.deprecated || false}
          onChange={(v) => onChange('deprecated', v)}
        />
        {data.deprecated && (
          <div>
            <FieldLabel htmlFor="pff-deprecation-msg" optional>Deprecation message</FieldLabel>
            <TextInput
              id="pff-deprecation-msg"
              value={data.deprecationMessage || ''}
              onChange={(v) => onChange('deprecationMessage', v)}
              placeholder="Reason for deprecation"
            />
          </div>
        )}
      </Section>

      {/* String Constraints (GitHub #106: format, pattern, minLength, maxLength, enum, default, example) */}
      {showStringConstraints && (
        <Section
          title="String Constraints"
          icon={<FileText className="h-3.5 w-3.5" />}
          badge="String"
        >
          {formatOptions.length > 0 && (
            <div>
              <FieldLabel htmlFor="pff-format" optional>Format</FieldLabel>
              <SelectField
                id="pff-format"
                value={data.format || ''}
                onChange={(v) => onChange('format', v)}
                options={[
                  { value: '', label: 'None' },
                  ...formatOptions,
                ]}
                placeholder="Select format"
              />
            </div>
          )}
          <div>
            <FieldLabel htmlFor="pff-pattern" optional>Pattern (regex)</FieldLabel>
            <TextInput
              id="pff-pattern"
              value={data.pattern || ''}
              onChange={(v) => onChange('pattern', v)}
              placeholder="^[a-zA-Z]+$"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="pff-minlength" optional>Min Length</FieldLabel>
              <TextInput
                id="pff-minlength"
                value={data.minLength || ''}
                onChange={(v) => onChange('minLength', v)}
                placeholder="0"
                type="number"
              />
            </div>
            <div>
              <FieldLabel htmlFor="pff-maxlength" optional>Max Length</FieldLabel>
              <TextInput
                id="pff-maxlength"
                value={data.maxLength || ''}
                onChange={(v) => onChange('maxLength', v)}
                placeholder="∞"
                type="number"
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="pff-string-default" optional>Default</FieldLabel>
            <TextInput
              id="pff-string-default"
              value={data.default || ''}
              onChange={(v) => onChange('default', v)}
              placeholder="Default string value"
            />
          </div>
          <div>
            <FieldLabel htmlFor="pff-string-example" optional>Example</FieldLabel>
            <TextInput
              id="pff-string-example"
              value={data.examples?.[0] ?? ''}
              onChange={(v) => onChange('examples', v ? [v, ...(data.examples?.slice(1) || [])] : (data.examples?.slice(1) || []))}
              placeholder="Example string value"
            />
          </div>
          {/* Inline Content Media Type for binary/byte formats */}
          {(data.format === 'binary' || data.format === 'byte') && (
            <div className="mt-3 p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">Binary Content Settings</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel htmlFor="pff-inline-contentmedia" optional>Content Media Type</FieldLabel>
                  <TextInput
                    id="pff-inline-contentmedia"
                    value={data.contentMediaType || ''}
                    onChange={(v) => onChange('contentMediaType', v)}
                    placeholder="image/png"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="pff-inline-contentencoding" optional>Content Encoding</FieldLabel>
                  <TextInput
                    id="pff-inline-contentencoding"
                    value={data.contentEncoding || ''}
                    onChange={(v) => onChange('contentEncoding', v)}
                    placeholder="base64"
                  />
                </div>
              </div>
              <div className="mt-2">
                <FieldLabel htmlFor="pff-inline-contentschema" optional>Content Schema</FieldLabel>
                <TextArea
                  id="pff-inline-contentschema"
                  value={data.contentSchema || ''}
                  onChange={(v) => onChange('contentSchema', v)}
                  placeholder='{ "type": "object" }'
                  rows={2}
                />
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Number Constraints */}
      {showNumberConstraints && (
        <Section
          title="Number Constraints"
          icon={<Hash className="h-3.5 w-3.5" />}
          badge={baseType === 'integer' ? 'Integer' : 'Number'}
        >
          {formatOptions.length > 0 && (
            <div>
              <FieldLabel htmlFor="pff-num-format" optional>Format</FieldLabel>
              <SelectField
                id="pff-num-format"
                value={data.format || ''}
                onChange={(v) => onChange('format', v)}
                options={[
                  { value: '', label: 'None' },
                  ...formatOptions,
                ]}
                placeholder="Select format"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="pff-minimum" optional>Minimum</FieldLabel>
              <TextInput
                id="pff-minimum"
                value={data.minimum || ''}
                onChange={(v) => onChange('minimum', v)}
                placeholder="Min"
                type="number"
              />
            </div>
            <div>
              <FieldLabel htmlFor="pff-min-type" optional>Min Type</FieldLabel>
              <SelectField
                id="pff-min-type"
                value={data.minimumType || 'inclusive'}
                onChange={(v) => onChange('minimumType', v as 'inclusive' | 'exclusive')}
                options={[
                  { value: 'inclusive', label: 'Inclusive (≥)' },
                  { value: 'exclusive', label: 'Exclusive (>)' },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="pff-maximum" optional>Maximum</FieldLabel>
              <TextInput
                id="pff-maximum"
                value={data.maximum || ''}
                onChange={(v) => onChange('maximum', v)}
                placeholder="Max"
                type="number"
              />
            </div>
            <div>
              <FieldLabel htmlFor="pff-max-type" optional>Max Type</FieldLabel>
              <SelectField
                id="pff-max-type"
                value={data.maximumType || 'inclusive'}
                onChange={(v) => onChange('maximumType', v as 'inclusive' | 'exclusive')}
                options={[
                  { value: 'inclusive', label: 'Inclusive (≤)' },
                  { value: 'exclusive', label: 'Exclusive (<)' },
                ]}
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="pff-multipleof" optional>Multiple Of</FieldLabel>
            <TextInput
              id="pff-multipleof"
              value={data.multipleOf || ''}
              onChange={(v) => onChange('multipleOf', v)}
              placeholder="e.g. 0.01"
              type="number"
            />
          </div>
          <div>
            <FieldLabel htmlFor="pff-num-default" optional>Default</FieldLabel>
            <TextInput
              id="pff-num-default"
              value={data.default || ''}
              onChange={(v) => onChange('default', v)}
              placeholder={baseType === 'integer' ? 'e.g. 0 or 42' : 'e.g. 0 or 42.5'}
              type="text"
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Enum values can be added in the &quot;Enum / Const Values&quot; section below.
          </p>
        </Section>
      )}

      {/* Array Constraints */}
      {showArrayConstraints && (
        <Section
          title="Array Constraints"
          icon={<List className="h-3.5 w-3.5" />}
          badge="Array"
        >
          {!data.tupleMode && (
            <div>
              <FieldLabel htmlFor="pff-itemsschemaoverride" optional>Items Schema (optional JSON)</FieldLabel>
              <TextArea
                id="pff-itemsschemaoverride"
                value={data.itemsSchemaOverride || ''}
                onChange={(v) => onChange('itemsSchemaOverride', v)}
                placeholder='e.g. { "type": "string" } or leave empty to use type below'
                rows={2}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="pff-minitems" optional>Min Items</FieldLabel>
              <TextInput
                id="pff-minitems"
                value={data.minItems || ''}
                onChange={(v) => onChange('minItems', v)}
                placeholder="0"
                type="number"
              />
            </div>
            <div>
              <FieldLabel htmlFor="pff-maxitems" optional>Max Items</FieldLabel>
              <TextInput
                id="pff-maxitems"
                value={data.maxItems || ''}
                onChange={(v) => onChange('maxItems', v)}
                placeholder="∞"
                type="number"
              />
            </div>
          </div>
          <CheckboxField
            id="pff-uniqueitems"
            label="Unique Items"
            checked={data.uniqueItems || false}
            onChange={(v) => onChange('uniqueItems', v)}
          />
          <div>
            <FieldLabel htmlFor="pff-contains" optional>Contains (JSON Schema)</FieldLabel>
            <TextArea
              id="pff-contains"
              value={data.contains || ''}
              onChange={(v) => onChange('contains', v)}
              placeholder='{ "type": "string" }'
              rows={2}
            />
          </div>
          {data.contains && data.contains.trim() && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel htmlFor="pff-mincontains" optional>Min Contains</FieldLabel>
                <TextInput
                  id="pff-mincontains"
                  value={data.minContains || ''}
                  onChange={(v) => onChange('minContains', v)}
                  placeholder="1"
                  type="number"
                />
              </div>
              <div>
                <FieldLabel htmlFor="pff-maxcontains" optional>Max Contains</FieldLabel>
                <TextInput
                  id="pff-maxcontains"
                  value={data.maxContains || ''}
                  onChange={(v) => onChange('maxContains', v)}
                  placeholder="∞"
                  type="number"
                />
              </div>
            </div>
          )}
          <CheckboxField
            id="pff-tuplemode"
            label="Tuple Mode (prefixItems)"
            checked={data.tupleMode || false}
            onChange={(v) => onChange('tupleMode', v)}
          />
          {data.tupleMode && (
            <>
              <div>
                <FieldLabel optional>Prefix Items (tuple slots)</FieldLabel>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Each slot is a JSON Schema. Order defines the tuple.
                </p>
                {(data.prefixItems || []).map((item, index) => {
                  const stringified = typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item);
                  const value = prefixItemDrafts[index] ?? stringified;
                  return (
                  <div key={index} className="flex gap-2 items-start mb-2">
                    <TextArea
                      aria-label={`Prefix item ${index + 1}`}
                      value={value}
                      onChange={(v) => {
                        setPrefixItemDrafts((prev) => ({ ...prev, [index]: v }));
                        try {
                          const parsed = JSON.parse(v.trim() || '{}');
                          const next = [...(data.prefixItems || [])];
                          next[index] = parsed;
                          onChange('prefixItems', next);
                          setPrefixItemDrafts((prev) => {
                            const u = { ...prev };
                            delete u[index];
                            return u;
                          });
                        } catch {
                          // Invalid JSON while typing; keep draft
                        }
                      }}
                      onBlur={() => {
                        if (prefixItemDrafts[index] !== undefined) {
                          try {
                            JSON.parse(prefixItemDrafts[index].trim() || '{}');
                          } catch {
                            setPrefixItemDrafts((prev) => {
                              const u = { ...prev };
                              delete u[index];
                              return u;
                            });
                          }
                        }
                      }}
                      placeholder='{ "type": "string" }'
                      rows={2}
                      className="flex-1 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = (data.prefixItems || []).filter((_, i) => i !== index);
                        onChange('prefixItems', next.length ? next : undefined);
                        setPrefixItemDrafts({});
                      }}
                      className="p-2 rounded border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
                      aria-label={`Remove prefix item ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onChange('prefixItems', [...(data.prefixItems || []), { type: 'string' }])}
                  className="flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add slot
                </button>
              </div>
              <div>
                <FieldLabel htmlFor="pff-itemsschema" optional>Items Schema (beyond prefix)</FieldLabel>
                <TextArea
                  id="pff-itemsschema"
                  value={data.itemsSchema || ''}
                  onChange={(v) => onChange('itemsSchema', v)}
                  placeholder='{ "type": "string" } or true/false'
                  rows={2}
                />
              </div>
            </>
          )}
          <div>
            <FieldLabel htmlFor="pff-unevaluateditems" optional>Unevaluated Items</FieldLabel>
            <SelectField
              id="pff-unevaluateditems"
              value={data.unevaluatedItems || 'default'}
              onChange={(v) => onChange('unevaluatedItems', v)}
              options={[
                { value: 'default', label: 'Default' },
                { value: 'allow', label: 'Allow (true)' },
                { value: 'disallow', label: 'Disallow (false)' },
                { value: 'schema', label: 'Schema' },
              ]}
            />
          </div>
          {data.unevaluatedItems === 'schema' && (
            <div>
              <FieldLabel htmlFor="pff-unevaluateditemsschema" optional>Unevaluated Items Schema</FieldLabel>
              <TextArea
                id="pff-unevaluateditemsschema"
                value={data.unevaluatedItemsSchema || ''}
                onChange={(v) => onChange('unevaluatedItemsSchema', v)}
                placeholder='{ "type": "string" }'
                rows={2}
              />
            </div>
          )}
        </Section>
      )}

      {/* Object Constraints */}
      {showObjectConstraints && (
        <Section
          title="Object Constraints"
          icon={<Box className="h-3.5 w-3.5" />}
          badge="Object"
        >
          <div>
            <FieldLabel htmlFor="pff-object-properties" optional>Properties</FieldLabel>
            <TextArea
              id="pff-object-properties"
              value={propertiesDraft}
              onChange={(v) => handlePropertiesChange(v)}
              onBlur={handlePropertiesBlur}
              placeholder='{ "name": { "type": "string" }, "age": { "type": "integer" } }'
              rows={4}
              aria-label="Object properties (JSON)"
            />
          </div>
          <div>
            <FieldLabel htmlFor="pff-object-required" optional>Required (property names)</FieldLabel>
            <div className="flex gap-2">
              <TextInput
                id="pff-object-required"
                value={objectRequiredInput}
                onChange={(v) => { setObjectRequiredInput(v); setObjectRequiredError(''); }}
                placeholder="Property name"
              />
              <button
                type="button"
                onClick={handleAddObjectRequired}
                disabled={!objectRequiredInput.trim()}
                className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                aria-label="Add required property"
              >
                <Plus className="h-4 w-3.5" />
              </button>
            </div>
            {objectRequiredError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">{objectRequiredError}</p>
            )}
            {(data.objectRequired || []).length > 0 && (
              <ul className="mt-2 space-y-1">
                {(data.objectRequired || []).map((name) => (
                  <li key={name} className="flex items-center gap-2 py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="flex-1 font-mono text-sm text-slate-800 dark:text-slate-200">{name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteObjectRequired(name)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      aria-label={`Remove required ${name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <FieldLabel htmlFor="pff-additionalprops" optional>Additional Properties</FieldLabel>
            <SelectField
              id="pff-additionalprops"
              value={data.additionalProperties || 'default'}
              onChange={(v) => onChange('additionalProperties', v)}
              options={[
                { value: 'default', label: 'Default (unset)' },
                { value: 'true', label: 'Allow (true)' },
                { value: 'false', label: 'Disallow (false)' },
                { value: 'type', label: 'Typed' },
                { value: 'schema', label: 'Schema / $ref' },
              ]}
            />
          </div>
          {data.additionalProperties === 'type' && (
            <div>
              <FieldLabel htmlFor="pff-additionalpropstype" optional>Type</FieldLabel>
              <SelectField
                id="pff-additionalpropstype"
                value={data.additionalPropertiesType || 'string'}
                onChange={(v) => onChange('additionalPropertiesType', v)}
                options={[
                  { value: 'string', label: 'string' },
                  { value: 'number', label: 'number' },
                  { value: 'integer', label: 'integer' },
                  { value: 'boolean', label: 'boolean' },
                  { value: 'object', label: 'object' },
                  { value: 'array', label: 'array' },
                ]}
              />
            </div>
          )}
          {data.additionalProperties === 'schema' && (
            <div>
              <FieldLabel htmlFor="pff-additionalpropsschema" optional>Schema / Class name</FieldLabel>
              <TextInput
                id="pff-additionalpropsschema"
                value={data.additionalPropertiesSchema || ''}
                onChange={(v) => onChange('additionalPropertiesSchema', v)}
                placeholder="ClassName or JSON schema"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="pff-minprops" optional>Min Properties</FieldLabel>
              <TextInput
                id="pff-minprops"
                value={data.minProperties || ''}
                onChange={(v) => onChange('minProperties', v)}
                placeholder="0"
                type="number"
              />
            </div>
            <div>
              <FieldLabel htmlFor="pff-maxprops" optional>Max Properties</FieldLabel>
              <TextInput
                id="pff-maxprops"
                value={data.maxProperties || ''}
                onChange={(v) => onChange('maxProperties', v)}
                placeholder="∞"
                type="number"
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="pff-propnamespattern" optional>Property Names Pattern</FieldLabel>
            <TextInput
              id="pff-propnamespattern"
              value={data.propertyNamesPattern || ''}
              onChange={(v) => onChange('propertyNamesPattern', v)}
              placeholder="^[a-z_]+$"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="pff-propnamesmin" optional>Prop Names Min Length</FieldLabel>
              <TextInput
                id="pff-propnamesmin"
                value={data.propertyNamesMinLength || ''}
                onChange={(v) => onChange('propertyNamesMinLength', v)}
                type="number"
              />
            </div>
            <div>
              <FieldLabel htmlFor="pff-propnamesmax" optional>Prop Names Max Length</FieldLabel>
              <TextInput
                id="pff-propnamesmax"
                value={data.propertyNamesMaxLength || ''}
                onChange={(v) => onChange('propertyNamesMaxLength', v)}
                type="number"
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="pff-propnamesformat" optional>Prop Names Format</FieldLabel>
            <SelectField
              id="pff-propnamesformat"
              value={data.propertyNamesFormat || ''}
              onChange={(v) => onChange('propertyNamesFormat', v)}
              options={[
                { value: '', label: 'None' },
                ...(FORMAT_OPTIONS.string || []).map((f) => ({ value: f.value, label: f.label })),
              ]}
              placeholder="Select format"
            />
          </div>
          <div>
            <FieldLabel htmlFor="pff-propnamesdesc" optional>Prop Names Description</FieldLabel>
            <TextArea
              id="pff-propnamesdesc"
              value={data.propertyNamesDescription || ''}
              onChange={(v) => onChange('propertyNamesDescription', v)}
              placeholder="Property names must be lowercase, start with letter..."
              rows={2}
            />
          </div>
          <div>
            <FieldLabel htmlFor="pff-unevaluatedprops" optional>Unevaluated Properties</FieldLabel>
            <SelectField
              id="pff-unevaluatedprops"
              value={data.unevaluatedProperties || 'default'}
              onChange={(v) => onChange('unevaluatedProperties', v)}
              options={[
                { value: 'default', label: 'Default' },
                { value: 'allow', label: 'Allow (true)' },
                { value: 'disallow', label: 'Disallow (false)' },
                { value: 'schema', label: 'Schema' },
              ]}
            />
          </div>
          {data.unevaluatedProperties === 'schema' && (
            <div>
              <FieldLabel htmlFor="pff-unevaluatedpropsschema" optional>Unevaluated Properties Schema</FieldLabel>
              <TextArea
                id="pff-unevaluatedpropsschema"
                value={data.unevaluatedPropertiesSchema || ''}
                onChange={(v) => onChange('unevaluatedPropertiesSchema', v)}
                placeholder='{ "type": "string" }'
                rows={2}
              />
            </div>
          )}

          {/* Pattern Properties */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Braces className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Pattern Properties</span>
            </div>
            {data.patternProperties && Object.entries(data.patternProperties).length > 0 && (
              <ul className="space-y-2 mb-2">
                {Object.entries(data.patternProperties).map(([pattern, schema]) => (
                  <li key={pattern} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex-1 font-mono text-sm text-indigo-600 dark:text-indigo-400 truncate">{pattern}</span>
                      <button
                        type="button"
                        onClick={() => handleDeletePatternProperty(pattern)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        aria-label={`Remove pattern ${pattern}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <pre className="text-xs text-slate-600 dark:text-slate-400 font-mono overflow-auto max-h-20">
                      {typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2">
              <TextInput
                id="pff-new-pattern-key"
                value={newPatternKey}
                onChange={setNewPatternKey}
                placeholder="^env_|^flag_"
              />
              <TextArea
                id="pff-new-pattern-schema"
                value={newPatternSchema}
                onChange={setNewPatternSchema}
                placeholder='{ "type": "string" }'
                rows={2}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddPatternProperty}
                  disabled={!newPatternKey.trim()}
                  className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Add pattern property"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Dependent Schemas */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Puzzle className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Dependent Schemas</span>
            </div>
            {data.dependentSchemas && Object.entries(data.dependentSchemas).length > 0 && (
              <ul className="space-y-2 mb-2">
                {Object.entries(data.dependentSchemas).map(([triggerProp, schema]) => (
                  <li key={triggerProp} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-mono text-xs font-semibold">{triggerProp}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">triggers conditional validation</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteDependentSchema(triggerProp)}
                        className="ml-auto text-slate-400 hover:text-red-500 transition-colors"
                        aria-label={`Remove dependent schema ${triggerProp}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <pre className="text-xs text-slate-600 dark:text-slate-400 font-mono overflow-auto max-h-20">
                      {typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <div className="flex-1">
                <TextInput
                  id="pff-new-dep-prop"
                  value={newDepPropName}
                  onChange={setNewDepPropName}
                  placeholder="Enter trigger property name"
                />
              </div>
              <button
                type="button"
                onClick={handleAddDependentSchema}
                disabled={!newDepPropName.trim()}
                className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Add dependent schema"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Section>
      )}

      {/* Enum / Const */}
      <Section
        title="Enum / Const Values"
        icon={<List className="h-3.5 w-3.5" />}
      >
        <div>
          <FieldLabel htmlFor="pff-const" optional>Const (fixed value)</FieldLabel>
          <TextInput
            id="pff-const"
            value={data.const || ''}
            onChange={(v) => onChange('const', v)}
            placeholder="Constant value (JSON)"
          />
          {data.const && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Const is mutually exclusive with enum</p>}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FieldLabel optional>Enum values</FieldLabel>
            {data.enum && data.enum.length > 1 && (
              <div className="flex gap-1 ml-auto">
                <button
                  type="button"
                  onClick={handleSortEnumAZ}
                  className="p-1 rounded-md text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                  aria-label="Sort enum A-Z"
                  title="Sort A→Z"
                >
                  <ArrowUpAZ className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleSortEnumZA}
                  className="p-1 rounded-md text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                  aria-label="Sort enum Z-A"
                  title="Sort Z→A"
                >
                  <ArrowDownAZ className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                id="pff-enum-input"
                value={enumInput}
                onChange={setEnumInput}
                placeholder="Add enum value"
              />
            </div>
            <button
              type="button"
              onClick={handleAddEnum}
              className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm transition-colors"
              aria-label="Add enum value"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {enumError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{enumError}</p>}
          {(data.enum || []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {data.enum!.map((val) => (
                <li key={val} className="flex items-center gap-2 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 text-sm font-mono">
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{val}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteEnum(val)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    aria-label={`Remove enum ${val}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* Advanced (JSON Schema 2020-12) */}
      <Section
        title="Advanced"
        icon={<Settings className="h-3.5 w-3.5" />}
        badge="2020-12"
      >
        <div>
          <FieldLabel htmlFor="pff-not" optional>NOT Schema</FieldLabel>
          <TextArea
            id="pff-not"
            value={data.not || ''}
            onChange={(v) => onChange('not', v)}
            placeholder='{ "type": "null" }'
            rows={2}
          />
        </div>
        <div>
          <FieldLabel htmlFor="pff-comment" optional>$comment</FieldLabel>
          <TextInput
            id="pff-comment"
            value={data.$comment || ''}
            onChange={(v) => onChange('$comment', v)}
            placeholder="Internal comment for schema authors"
          />
        </div>
        <div>
          <FieldLabel htmlFor="pff-contentmediatype" optional>Content Media Type</FieldLabel>
          <TextInput
            id="pff-contentmediatype"
            value={data.contentMediaType || ''}
            onChange={(v) => onChange('contentMediaType', v)}
            placeholder="application/octet-stream"
          />
        </div>
        <div>
          <FieldLabel htmlFor="pff-contentencoding" optional>Content Encoding</FieldLabel>
          <TextInput
            id="pff-contentencoding"
            value={data.contentEncoding || ''}
            onChange={(v) => onChange('contentEncoding', v)}
            placeholder="base64"
          />
        </div>
        <div>
          <FieldLabel htmlFor="pff-contentschema" optional>Content Schema</FieldLabel>
          <TextArea
            id="pff-contentschema"
            value={data.contentSchema || ''}
            onChange={(v) => onChange('contentSchema', v)}
            placeholder='{ "type": "object" }'
            rows={2}
          />
        </div>
      </Section>

      {/* Extensions (x- prefixed) */}
      <Section
        title="Extensions"
        icon={<Braces className="h-3.5 w-3.5" />}
        badge="x-"
      >
        {data.extensions && Object.entries(data.extensions).length > 0 && (
          <ul className="space-y-1 mb-2">
            {Object.entries(data.extensions).map(([key, value]) => (
              <li key={key} className="flex items-center gap-2 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 text-sm font-mono">
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{key}</span>
                <span className="text-slate-400">=</span>
                <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
                  {typeof value === 'string' ? value : JSON.stringify(value)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteExtension(key)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                  aria-label={`Remove extension ${key}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="pff-ext-key" optional>Key</FieldLabel>
              <TextInput
                id="pff-ext-key"
                value={newExtKey}
                onChange={(v) => { setNewExtKey(v); setExtKeyError(''); }}
                placeholder="x-custom-field"
              />
            </div>
            <div>
              <FieldLabel htmlFor="pff-ext-value" optional>Value</FieldLabel>
              <TextInput
                id="pff-ext-value"
                value={newExtValue}
                onChange={setNewExtValue}
                placeholder="value (JSON or string)"
              />
            </div>
          </div>
          {extKeyError && <p className="text-xs text-red-600 dark:text-red-400">{extKeyError}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddExtension}
              disabled={!newExtKey.trim()}
              className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Add extension"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Section>

      {/* External Docs & XML */}
      <Section
        title="External Docs & XML"
        icon={<Code className="h-3.5 w-3.5" />}
        badge="OpenAPI"
      >
        <div>
          <FieldLabel htmlFor="pff-externaldocsurl" optional>External Docs URL</FieldLabel>
          <TextInput
            id="pff-externaldocsurl"
            value={data.externalDocsUrl || ''}
            onChange={(v) => onChange('externalDocsUrl', v)}
            placeholder="https://docs.example.com"
          />
        </div>
        <div>
          <FieldLabel htmlFor="pff-externaldocsdesc" optional>External Docs Description</FieldLabel>
          <TextInput
            id="pff-externaldocsdesc"
            value={data.externalDocsDescription || ''}
            onChange={(v) => onChange('externalDocsDescription', v)}
            placeholder="See the documentation for details"
          />
        </div>
        <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">XML Serialization</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="pff-xmlname" optional>Name</FieldLabel>
              <TextInput
                id="pff-xmlname"
                value={data.xmlName || ''}
                onChange={(v) => onChange('xmlName', v)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="pff-xmlprefix" optional>Prefix</FieldLabel>
              <TextInput
                id="pff-xmlprefix"
                value={data.xmlPrefix || ''}
                onChange={(v) => onChange('xmlPrefix', v)}
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="pff-xmlnamespace" optional>Namespace</FieldLabel>
            <TextInput
              id="pff-xmlnamespace"
              value={data.xmlNamespace || ''}
              onChange={(v) => onChange('xmlNamespace', v)}
              placeholder="http://example.com/ns"
            />
          </div>
          <div className="flex gap-4 mt-1">
            <CheckboxField
              id="pff-xmlattribute"
              label="Attribute"
              checked={data.xmlAttribute || false}
              onChange={(v) => onChange('xmlAttribute', v)}
            />
            <CheckboxField
              id="pff-xmlwrapped"
              label="Wrapped"
              checked={data.xmlWrapped || false}
              onChange={(v) => onChange('xmlWrapped', v)}
            />
          </div>
        </div>
      </Section>
    </div>
  );
};

export default PropertyFormFields;
