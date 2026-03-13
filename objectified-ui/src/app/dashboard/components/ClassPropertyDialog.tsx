'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Check, X } from 'lucide-react';
import type { StudioProperty } from '@lib/studio/types';

interface ClassPropertyDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** 'add' to create a new class-property; 'edit' to modify an existing one. */
  mode: 'add' | 'edit';
  /** Available project-level properties for linking. Empty array if none available. */
  availableProperties: StudioProperty[];
  /** Initial values for edit mode. */
  initial?: { name: string; description: string; propertyId?: string };
  /** Called with the form data when the user saves. */
  onSave: (data: { name: string; description: string; propertyId?: string }) => void;
  /** Called when the dialog is closed without saving. */
  onClose: () => void;
}

/** Sentinel value for "no property linked" in the Radix Select (empty string not allowed). */
const NO_PROPERTY_VALUE = '__none__';

/**
 * Dialog for adding or editing a class-property.
 * Updates local state only — no REST call is made here.
 */
interface FormState {
  selectedPropertyId: string;
  name: string;
  description: string;
  error: string;
}

export default function ClassPropertyDialog({
  open,
  mode,
  availableProperties,
  initial,
  onSave,
  onClose,
}: ClassPropertyDialogProps) {
  const [form, setForm] = useState<FormState>({
    selectedPropertyId: initial?.propertyId ?? NO_PROPERTY_VALUE,
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    error: '',
  });

  // Reset form when dialog opens (single state update avoids cascading renders)
  useEffect(() => {
    if (open) {
      setForm({
        selectedPropertyId: initial?.propertyId ?? NO_PROPERTY_VALUE,
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        error: '',
      });
    }
  }, [open, initial?.propertyId, initial?.name, initial?.description]);

  const { selectedPropertyId, name, description, error } = form;

  // When a property is selected from the dropdown, auto-fill the name
  const handlePropertySelect = (propId: string) => {
    setForm((f) => {
      const actualId = propId === NO_PROPERTY_VALUE ? '' : propId;
      const found = availableProperties.find((p) => p.id === actualId);
      const autoName =
        !f.name || availableProperties.some((p) => p.name === f.name)
          ? (found?.name ?? f.name)
          : f.name;
      return { ...f, selectedPropertyId: propId, name: autoName };
    });
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setForm((f) => ({ ...f, error: 'Property name is required.' }));
      return;
    }
    setForm((f) => ({ ...f, error: '' }));
    const realPropertyId =
      selectedPropertyId && selectedPropertyId !== NO_PROPERTY_VALUE
        ? selectedPropertyId
        : undefined;
    onSave({
      name: trimmed,
      description: description.trim(),
      propertyId: realPropertyId,
    });
  };

  const title = mode === 'add' ? 'Add Property to Class' : 'Edit Class Property';

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
          onEscapeKeyDown={onClose}
          onPointerDownOutside={onClose}
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
          <div className="px-6 py-4 flex-1 overflow-auto space-y-4">
            {/* Property link (optional) — only shown in add mode or if editing a linked property */}
            {(mode === 'add' || initial?.propertyId) && availableProperties.length > 0 && (
              <div className="space-y-1">
                <label
                  htmlFor="property-link"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Link to Project Property
                  {mode === 'edit' && (
                    <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">(optional)</span>
                  )}
                </label>
                <Select.Root
                  value={selectedPropertyId}
                  onValueChange={mode === 'add' ? handlePropertySelect : (v) => setForm((f) => ({ ...f, selectedPropertyId: v }))}
                  disabled={mode === 'edit'}
                >
                  <Select.Trigger
                    id="property-link"
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent data-[disabled]:opacity-50"
                    aria-label="Link to project property"
                  >
                    <Select.Value placeholder="Select a property (optional)" />
                    <Select.Icon>
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      className="z-[10003] w-full bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
                      position="popper"
                      sideOffset={4}
                    >
                      <Select.ScrollUpButton />
                      <Select.Viewport className="p-1 max-h-48">
                        <Select.Item
                          value={NO_PROPERTY_VALUE}
                          className="flex items-center px-3 py-2 rounded text-sm text-slate-500 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-700"
                        >
                          <Select.ItemText>None (standalone property)</Select.ItemText>
                          <Select.ItemIndicator className="ml-auto">
                            <Check className="h-4 w-4" />
                          </Select.ItemIndicator>
                        </Select.Item>
                        {availableProperties.map((prop) => (
                          <Select.Item
                            key={prop.id}
                            value={prop.id}
                            className="flex items-center px-3 py-2 rounded text-sm text-slate-900 dark:text-slate-100 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-700"
                          >
                            <Select.ItemText>{prop.name}</Select.ItemText>
                            <Select.ItemIndicator className="ml-auto">
                              <Check className="h-4 w-4" />
                            </Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                      <Select.ScrollDownButton />
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
            )}

            {/* Property name */}
            <div className="space-y-1">
              <label
                htmlFor="property-name"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="property-name"
                type="text"
                value={name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, error: '' }))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                placeholder="e.g. id, name, email"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                autoFocus
              />
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label
                htmlFor="property-description"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Description
              </label>
              <textarea
                id="property-description"
                value={description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description for this property"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>
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








