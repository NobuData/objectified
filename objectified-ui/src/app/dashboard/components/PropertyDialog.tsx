'use client';

/**
 * Dialog for adding or editing a property with full JSON Schema 2020-12 support.
 * Supports form view and JSON preview, type selection, and array toggle.
 * Reference: GitHub #104, #106 (string constraints), #110 (metadata in property form).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Tabs from '@radix-ui/react-tabs';
import { ChevronDown, Check, X, FileText, Code } from 'lucide-react';
import { PropertyFormFields } from './PropertyFormFields';
import {
  type PropertyFormData,
  PROPERTY_TYPES,
  buildPropertySchema,
  parsePropertySchema,
} from '../utils/propertySchemaUtils';

export interface PropertyDialogSaveData {
  name: string;
  description: string | null;
  data: Record<string, any>;
}

interface PropertyDialogProps {
  open: boolean;
  mode: 'add' | 'edit';
  onSave: (data: PropertyDialogSaveData) => void;
  onClose: () => void;
  /** Initial property data for edit mode. */
  initial?: {
    name: string;
    description?: string;
    data?: Record<string, any>;
  };
  /** Available class names for schema references. */
  availableClasses?: string[];
  /** Available project property names for reference suggestions. */
  availableProperties?: string[];
  /** Existing property names for duplicate checking. */
  existingNames?: string[];
}

export default function PropertyDialog({
  open,
  mode,
  onSave,
  onClose,
  initial,
  availableClasses = [],
  availableProperties = [],
  existingNames = [],
}: PropertyDialogProps) {
  const [propertyName, setPropertyName] = useState('');
  const [propertyType, setPropertyType] = useState('string');
  const [isArray, setIsArray] = useState(false);
  const [formData, setFormData] = useState<PropertyFormData>({});
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'form' | 'json'>('form');

  useEffect(() => {
    if (!open) return;

    if (mode === 'edit' && initial) {
      setPropertyName(initial.name);
      if (initial.data && Object.keys(initial.data).length > 0) {
        const parsed = parsePropertySchema(initial.data);
        setPropertyType(parsed.propertyType);
        setIsArray(parsed.isArray);
        setFormData(parsed.formData);
      } else {
        setPropertyType('string');
        setIsArray(false);
        setFormData(initial.description ? { description: initial.description } : {});
      }
    } else {
      setPropertyName('');
      setPropertyType('string');
      setIsArray(false);
      setFormData({});
    }
    setError('');
    setViewMode('form');
  }, [open, mode, initial]);

  const handleFormChange = useCallback(
    (field: keyof PropertyFormData, value: any) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const buildSchema = useCallback(() => {
    return buildPropertySchema(formData, propertyType, isArray);
  }, [formData, propertyType, isArray]);

  const handleSave = () => {
    const trimmed = propertyName.trim();
    if (!trimmed) {
      setError('Property name is required.');
      return;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
      setError('Name must start with a letter or underscore and contain only letters, numbers, and underscores.');
      return;
    }

    const nameLower = trimmed.toLowerCase();
    const isDuplicate = existingNames.some((n) => n.toLowerCase() === nameLower);

    if (mode === 'add' && isDuplicate) {
      setError('A property with this name already exists.');
      return;
    }
    if (mode === 'edit' && initial?.name && initial.name.toLowerCase() !== nameLower && isDuplicate) {
      setError('A property with this name already exists.');
      return;
    }

    const schema = buildSchema();
    onSave({
      name: trimmed,
      description: formData.description || null,
      data: schema,
    });
  };

  const jsonPreview = (() => {
    try {
      return JSON.stringify(buildSchema(), null, 2);
    } catch {
      return '{}';
    }
  })();

  const title = mode === 'add' ? 'Add Property' : 'Edit Property';

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto">
            <Tabs.Root value={viewMode} onValueChange={(v) => setViewMode(v as 'form' | 'json')}>
              <div className="px-6 pt-4 border-b border-slate-200 dark:border-slate-700">
                <Tabs.List className="flex gap-1">
                  <Tabs.Trigger
                    value="form"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-lg border border-b-0 transition-colors data-[state=active]:bg-white data-[state=active]:dark:bg-slate-900 data-[state=active]:text-indigo-600 data-[state=active]:dark:text-indigo-400 data-[state=active]:border-slate-200 data-[state=active]:dark:border-slate-700 data-[state=inactive]:bg-slate-50 data-[state=inactive]:dark:bg-slate-800 data-[state=inactive]:text-slate-500 data-[state=inactive]:border-transparent"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Form
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="json"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-lg border border-b-0 transition-colors data-[state=active]:bg-white data-[state=active]:dark:bg-slate-900 data-[state=active]:text-indigo-600 data-[state=active]:dark:text-indigo-400 data-[state=active]:border-slate-200 data-[state=active]:dark:border-slate-700 data-[state=inactive]:bg-slate-50 data-[state=inactive]:dark:bg-slate-800 data-[state=inactive]:text-slate-500 data-[state=inactive]:border-transparent"
                  >
                    <Code className="h-3.5 w-3.5" />
                    JSON Preview
                  </Tabs.Trigger>
                </Tabs.List>
              </div>

              <Tabs.Content value="form" className="px-6 py-4 space-y-4">
                {/* Property Name */}
                <div>
                  <label
                    htmlFor="pd-name"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="pd-name"
                    type="text"
                    value={propertyName}
                    onChange={(e) => { setPropertyName(e.target.value); setError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                    placeholder="e.g. id, name, email"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    autoFocus
                  />
                  {error && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                  )}
                </div>

                {/* Type & Array */}
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label
                      htmlFor="pd-type"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Type
                    </label>
                    <Select.Root value={propertyType} onValueChange={setPropertyType}>
                      <Select.Trigger
                        id="pd-type"
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        aria-label="Property type"
                      >
                        <Select.Value />
                        <Select.Icon>
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content
                          className="z-[10003] bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
                          position="popper"
                          sideOffset={4}
                        >
                          <Select.Viewport className="p-1">
                            {PROPERTY_TYPES.map((t) => (
                              <Select.Item
                                key={t}
                                value={t}
                                className="flex items-center px-3 py-2 rounded text-sm text-slate-900 dark:text-slate-100 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-700"
                              >
                                <Select.ItemText>{t}</Select.ItemText>
                                <Select.ItemIndicator className="ml-auto">
                                  <Check className="h-4 w-4" />
                                </Select.ItemIndicator>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>

                  <div className="flex items-center gap-2 pb-1">
                    <Checkbox.Root
                      id="pd-array"
                      checked={isArray}
                      onCheckedChange={(val) => setIsArray(val === true)}
                      className="h-5 w-5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                    >
                      <Checkbox.Indicator>
                        <Check className="h-3.5 w-3.5 text-white" />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                    <label
                      htmlFor="pd-array"
                      className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap"
                    >
                      Array
                    </label>
                  </div>
                </div>

                {/* Form Fields */}
                <PropertyFormFields
                  baseType={propertyType}
                  isArray={isArray}
                  data={formData}
                  onChange={handleFormChange}
                  availableClasses={availableClasses}
                  availableProperties={availableProperties}
                />
              </Tabs.Content>

              <Tabs.Content value="json" className="px-6 py-4">
                <pre className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-800 dark:text-slate-200 overflow-auto max-h-[50vh] whitespace-pre-wrap">
                  {jsonPreview}
                </pre>
              </Tabs.Content>
            </Tabs.Root>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {mode === 'add' ? 'Add Property' : 'Save Changes'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
