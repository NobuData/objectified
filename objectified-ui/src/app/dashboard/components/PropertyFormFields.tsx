'use client';

/**
 * Reusable form fields for property creation/editing with full
 * JSON Schema 2020-12 / OpenAPI 3.2.0 support.
 * Reference: GitHub #104
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState } from 'react';
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
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono"
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
}) => {
  const [enumInput, setEnumInput] = useState('');
  const [enumError, setEnumError] = useState('');
  const [exampleInput, setExampleInput] = useState('');

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
    if (!exampleInput.trim()) return;
    onChange('examples', [...(data.examples || []), exampleInput.trim()]);
    setExampleInput('');
  };

  const handleDeleteExample = (index: number) => {
    onChange('examples', (data.examples || []).filter((_, i) => i !== index));
  };

  const showStringConstraints = baseType === 'string';
  const showNumberConstraints = baseType === 'number' || baseType === 'integer';
  const showArrayConstraints = isArray;
  const showObjectConstraints = baseType === 'object';

  const formatOptions = FORMAT_OPTIONS[baseType] || [];

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
        <div>
          <FieldLabel htmlFor="pff-default" optional>Default value</FieldLabel>
          <TextInput
            id="pff-default"
            value={data.default || ''}
            onChange={(v) => onChange('default', v)}
            placeholder="Default value"
          />
        </div>
        {/* Examples */}
        <div>
          <FieldLabel optional>Examples</FieldLabel>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                id="pff-example-input"
                value={exampleInput}
                onChange={setExampleInput}
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
            onChange={(v) => onChange('readOnly', v)}
          />
          <CheckboxField
            id="pff-writeonly"
            label="Write Only"
            checked={data.writeOnly || false}
            onChange={(v) => onChange('writeOnly', v)}
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

      {/* String Constraints */}
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
        </Section>
      )}

      {/* Array Constraints */}
      {showArrayConstraints && (
        <Section
          title="Array Constraints"
          icon={<List className="h-3.5 w-3.5" />}
          badge="Array"
        >
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
          <FieldLabel optional>Enum values</FieldLabel>
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
