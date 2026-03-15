'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { X, Plus, ChevronDown } from 'lucide-react';
import {
  buildSchemaFromForm,
  schemaToFormState,
  initialClassFormSchemaState,
  type ClassFormSchemaState,
} from '@/app/dashboard/utils/classFormSchema';

export interface ClassFormData {
  name: string;
  description: string;
  schema?: Record<string, unknown>;
}

interface ClassDialogProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial?: { name: string; description: string; schema?: Record<string, unknown> };
  /** Class names available for composition refs (allOf/oneOf/anyOf) and additionalProperties. */
  existingClassNames?: string[];
  onSave: (data: ClassFormData) => void;
  onClose: () => void;
}

interface FormState {
  name: string;
  description: string;
  error: string;
  schema: ClassFormSchemaState;
}

function MultiSelectRefs({
  value,
  onChange,
  options,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
  placeholder: string;
  'aria-label': string;
}) {
  const [open, setOpen] = useState(false);
  const available = useMemo(
    () => options.filter((o) => !value.includes(o)),
    [options, value]
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-left text-sm flex flex-wrap gap-1.5 items-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        {value.length === 0 ? (
          <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>
        ) : (
          value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 text-xs"
            >
              {v}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((x) => x !== v));
                }}
                className="hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded p-0.5"
                aria-label={`Remove ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
        <ChevronDown className="h-4 w-4 ml-auto text-slate-400 shrink-0" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[10003]"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-[10004] mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg max-h-48 overflow-auto">
            {available.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">No other classes</p>
            ) : (
              available.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange([...value, opt]);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function ClassDialog({
  open,
  mode,
  initial,
  existingClassNames = [],
  onSave,
  onClose,
}: ClassDialogProps) {
  const [form, setForm] = useState<FormState>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    error: '',
    schema: initial?.schema
      ? schemaToFormState(initial.schema as Record<string, unknown>)
      : initialClassFormSchemaState,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        error: '',
        schema: initial?.schema
          ? schemaToFormState(initial.schema as Record<string, unknown>)
          : initialClassFormSchemaState,
      });
    }
  }, [open, initial?.name, initial?.description, initial?.schema]);

  const { name, description, error, schema } = form;
  const classNamesForRefs = useMemo(
    () => (mode === 'edit' ? [name.trim(), ...existingClassNames].filter(Boolean) : existingClassNames),
    [mode, name, existingClassNames]
  );

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setForm((f) => ({ ...f, error: 'Class name is required.' }));
      return;
    }
    setForm((f) => ({ ...f, error: '' }));
    const builtSchema = buildSchemaFromForm(schema);
    onSave({
      name: trimmed,
      description: description.trim(),
      ...(builtSchema ? { schema: builtSchema } : {}),
    });
  };

  const title = mode === 'add' ? 'Add Class' : 'Edit Class';

  const setSchema = (update: Partial<ClassFormSchemaState>) => {
    setForm((f) => ({ ...f, schema: { ...f.schema, ...update } }));
  };

  const addDiscriminatorMapping = () => {
    const key = `value_${Object.keys(schema.discriminatorMapping).length}`;
    setSchema({ discriminatorMapping: { ...schema.discriminatorMapping, [key]: '' } });
  };

  const updateDiscriminatorMappingKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const next = { ...schema.discriminatorMapping };
    const v = next[oldKey];
    delete next[oldKey];
    if (newKey.trim()) next[newKey.trim()] = v;
    setSchema({ discriminatorMapping: next });
  };

  const removeDiscriminatorMapping = (k: string) => {
    const next = { ...schema.discriminatorMapping };
    delete next[k];
    setSchema({ discriminatorMapping: next });
  };

  const addExample = () => {
    setSchema({ examples: [...schema.examples, ''] });
  };

  const setExample = (index: number, value: string) => {
    const next = [...schema.examples];
    next[index] = value;
    setSchema({ examples: next });
  };

  const removeExample = (index: number) => {
    setSchema({ examples: schema.examples.filter((_, i) => i !== index) });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl shadow-xl p-0 flex flex-col max-h-[90vh]"
          aria-describedby={undefined}
        >
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

          <ScrollArea.Root className="flex-1 overflow-hidden">
            <ScrollArea.Viewport className="h-full w-full">
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Common / essential */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-1">
                      Essential
                    </h3>
                    <div className="space-y-1">
                      <label htmlFor="class-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="class-name"
                        type="text"
                        value={name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, error: '' }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                        placeholder="e.g. User, Product"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                      />
                      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="class-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Description
                      </label>
                      <textarea
                        id="class-description"
                        value={description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Optional description"
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                    </div>
                    {/* Composition: allOf / oneOf / anyOf */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                        Schema composition (OpenAPI 3.2.0)
                      </h4>
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">allOf</label>
                        <MultiSelectRefs
                          value={schema.allOf}
                          onChange={(v) => setSchema({ allOf: v })}
                          options={classNamesForRefs}
                          placeholder="Select schemas to combine"
                          aria-label="allOf references"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">oneOf</label>
                        <MultiSelectRefs
                          value={schema.oneOf}
                          onChange={(v) => setSchema({ oneOf: v })}
                          options={classNamesForRefs}
                          placeholder="Exactly one of these schemas"
                          aria-label="oneOf references"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">anyOf</label>
                        <MultiSelectRefs
                          value={schema.anyOf}
                          onChange={(v) => setSchema({ anyOf: v })}
                          options={classNamesForRefs}
                          placeholder="One or more of these schemas"
                          aria-label="anyOf references"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="discriminator-property" className="block text-xs font-medium text-slate-600 dark:text-slate-400">Discriminator property</label>
                        <input
                          id="discriminator-property"
                          type="text"
                          value={schema.discriminatorProperty}
                          onChange={(e) => setSchema({ discriminatorProperty: e.target.value })}
                          placeholder="propertyName"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        {Object.keys(schema.discriminatorMapping).length > 0 && (
                          <div className="mt-2 space-y-1">
                            {Object.entries(schema.discriminatorMapping).map(([key, val]) => (
                              <div key={key} className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  value={key}
                                  onChange={(e) => updateDiscriminatorMappingKey(key, e.target.value)}
                                  placeholder="Property value"
                                  className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                                />
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(e) =>
                                    setSchema({
                                      discriminatorMapping: {
                                        ...schema.discriminatorMapping,
                                        [key]: e.target.value,
                                      },
                                    })
                                  }
                                  placeholder="Schema name"
                                  className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeDiscriminatorMapping(key)}
                                  className="text-slate-400 hover:text-red-600"
                                  aria-label="Remove mapping"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={addDiscriminatorMapping}
                              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              + Add mapping
                            </button>
                          </div>
                        )}
                        {Object.keys(schema.discriminatorMapping).length === 0 && schema.discriminatorProperty && (
                          <button
                            type="button"
                            onClick={addDiscriminatorMapping}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1"
                          >
                            + Add discriminator mapping
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Advanced */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-1">
                      Advanced
                    </h3>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Additional properties</label>
                      <select
                        value={schema.additionalPropertiesType}
                        onChange={(e) =>
                          setSchema({
                            additionalPropertiesType: e.target.value as ClassFormSchemaState['additionalPropertiesType'],
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="default">Default</option>
                        <option value="allow">Allow</option>
                        <option value="disallow">Disallow</option>
                        <option value="schema">Must match schema</option>
                      </select>
                      {schema.additionalPropertiesType === 'schema' && (
                        <select
                          value={schema.additionalPropertiesSchema}
                          onChange={(e) => setSchema({ additionalPropertiesSchema: e.target.value })}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                        >
                          <option value="">Select class</option>
                          {classNamesForRefs.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Unevaluated properties</label>
                      <select
                        value={schema.unevaluatedPropertiesType}
                        onChange={(e) =>
                          setSchema({
                            unevaluatedPropertiesType: e.target.value as ClassFormSchemaState['unevaluatedPropertiesType'],
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="default">Default</option>
                        <option value="allow">Allow</option>
                        <option value="disallow">Disallow</option>
                        <option value="schema">Must match schema</option>
                      </select>
                      {schema.unevaluatedPropertiesType === 'schema' && (
                        <select
                          value={schema.unevaluatedPropertiesSchema}
                          onChange={(e) => setSchema({ unevaluatedPropertiesSchema: e.target.value })}
                          className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                        >
                          <option value="">Select class</option>
                          {classNamesForRefs.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="deprecated"
                        type="checkbox"
                        checked={schema.deprecated}
                        onChange={(e) => setSchema({ deprecated: e.target.checked })}
                        className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor="deprecated" className="text-sm text-slate-700 dark:text-slate-300">
                        Deprecated
                      </label>
                    </div>
                    {schema.deprecated && (
                      <input
                        type="text"
                        value={schema.deprecationMessage}
                        onChange={(e) => setSchema({ deprecationMessage: e.target.value })}
                        placeholder="Deprecation message"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                      />
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">minProperties</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={schema.minProperties}
                          onChange={(e) => setSchema({ minProperties: e.target.value })}
                          placeholder="—"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">maxProperties</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={schema.maxProperties}
                          onChange={(e) => setSchema({ maxProperties: e.target.value })}
                          placeholder="—"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Examples (JSON)</label>
                      {schema.examples.map((ex, i) => (
                        <div key={i} className="flex gap-1">
                          <textarea
                            value={ex}
                            onChange={(e) => setExample(i, e.target.value)}
                            placeholder="{}"
                            rows={2}
                            className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => removeExample(i)}
                            className="text-slate-400 hover:text-red-600 shrink-0"
                            aria-label="Remove example"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addExample}
                        className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Add example
                      </button>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">External docs URL</label>
                      <input
                        type="url"
                        value={schema.externalDocsUrl}
                        onChange={(e) => setSchema({ externalDocsUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                      />
                      <input
                        type="text"
                        value={schema.externalDocsDescription}
                        onChange={(e) => setSchema({ externalDocsDescription: e.target.value })}
                        placeholder="Description"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm mt-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="ScrollAreaScrollbar" orientation="vertical">
              <ScrollArea.Thumb className="ScrollAreaThumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {mode === 'add' ? 'Add Class' : 'Save Changes'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
