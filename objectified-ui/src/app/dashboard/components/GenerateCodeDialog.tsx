'use client';

/**
 * Generate code from the current schema: built-in targets (TS, Prisma, GraphQL, Go, Pydantic, SQL)
 * and workspace-scoped custom Mustache templates.
 *
 * Reference: GitHub #119 — configurable code generation templates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import * as Select from '@radix-ui/react-select';
import * as Tabs from '@radix-ui/react-tabs';
import { X, Code2, Copy, Download, Trash2, Save, Loader2 } from 'lucide-react';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useDialog } from '@/app/components/providers/DialogProvider';
import {
  BUILTIN_CODE_TEMPLATES,
  type BuiltinTemplateId,
  generateFromBuiltinTemplate,
  renderCustomMustacheTemplate,
} from '@lib/studio/codeGenerationRegistry';
import {
  loadCustomCodegenTemplates,
  upsertCustomCodegenTemplate,
  deleteCustomCodegenTemplate,
  type StoredCustomCodegenTemplate,
} from '@lib/studio/codeGenerationStorage';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export interface GenerateCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const selectTriggerClass =
  'inline-flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400';

const MUSTACHE_HELP = `Mustache view: {{#classes}} ... {{/classes}}
Each class: {{name}}, {{snake}}, {{id}}
{{#properties}} {{name}} {{snake}} {{column}} {{tsType}} {{prismaType}} {{graphqlType}} {{goType}} {{pydanticType}} {{optional}} {{required}} {{isRefId}} {{refModel}} {{/properties}}`;

export default function GenerateCodeDialog({ open, onOpenChange }: GenerateCodeDialogProps) {
  const studio = useStudioOptional();
  const workspace = useWorkspaceOptional();
  const { resolvedTheme } = useTheme();
  const { confirm, alert: dialogAlert } = useDialog();

  const tenantId = workspace?.tenant?.id ?? '';
  const projectId = workspace?.project?.id ?? '';
  const versionId = studio?.state?.versionId ?? '';
  const classes = studio?.state?.classes ?? [];

  const [tab, setTab] = useState<'builtin' | 'custom'>('builtin');
  const [builtinId, setBuiltinId] = useState<BuiltinTemplateId>('typescript');
  const [customList, setCustomList] = useState<StoredCustomCodegenTemplate[]>([]);
  const [selectedCustomId, setSelectedCustomId] = useState<string>('');
  const [editName, setEditName] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);

  const refreshCustom = useCallback(() => {
    setCustomList(loadCustomCodegenTemplates(tenantId, projectId, versionId));
  }, [tenantId, projectId, versionId]);

  useEffect(() => {
    if (open) {
      setTab('builtin');
      setBuiltinId('typescript');
      refreshCustom();
      setSelectedCustomId('');
      setEditName('');
      setEditBody(
        '{{#classes}}\n// {{name}}\n{{#properties}}  // {{name}}: {{tsType}}\n{{/properties}}\n{{/classes}}'
      );
    }
  }, [open, refreshCustom]);

  useEffect(() => {
    if (!selectedCustomId || customList.length === 0) return;
    const t = customList.find((c) => c.id === selectedCustomId);
    if (t) {
      setEditName(t.name);
      setEditBody(t.body);
    }
  }, [selectedCustomId, customList]);

  const builtinOutput = useMemo(() => {
    if (!classes.length) return '// Add classes on the canvas to generate code.\n';
    return generateFromBuiltinTemplate(builtinId, classes);
  }, [builtinId, classes]);

  const { customOutput, mustacheError } = useMemo(() => {
    if (!classes.length) {
      return { customOutput: '// Add classes on the canvas to generate code.\n', mustacheError: null as string | null };
    }
    if (!editBody.trim()) {
      return { customOutput: '// Enter a Mustache template below.\n', mustacheError: null };
    }
    try {
      return {
        customOutput: renderCustomMustacheTemplate(editBody, classes),
        mustacheError: null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { customOutput: `// Template error: ${msg}\n`, mustacheError: msg };
    }
  }, [editBody, classes]);

  const preview =
    tab === 'builtin' ? builtinOutput : customOutput;
  const previewLang =
    tab === 'builtin'
      ? BUILTIN_CODE_TEMPLATES.find((b) => b.id === builtinId)?.language ?? 'typescript'
      : 'plaintext';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 1500);
    } catch {
      void dialogAlert({
        title: 'Copy failed',
        message: 'Could not copy to clipboard.',
        variant: 'error',
      });
    }
  };

  const handleDownload = () => {
    const meta =
      tab === 'builtin'
        ? BUILTIN_CODE_TEMPLATES.find((b) => b.id === builtinId)
        : null;
    const name =
      tab === 'builtin'
        ? meta?.fileHint ?? 'generated.txt'
        : `${(editName || 'custom').replace(/[^a-zA-Z0-9-_]/g, '_')}.txt`;
    const blob = new Blob([preview], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveCustom = () => {
    if (!versionId) return;
    setSaving(true);
    try {
      const saved = upsertCustomCodegenTemplate(tenantId, projectId, versionId, {
        id: selectedCustomId || undefined,
        name: editName,
        body: editBody,
      });
      refreshCustom();
      setSelectedCustomId(saved.id);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustom = async () => {
    if (!selectedCustomId || !versionId) return;
    const ok = await confirm({
      title: 'Delete template?',
      message: 'This custom template will be removed from this version.',
      variant: 'warning',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    deleteCustomCodegenTemplate(tenantId, projectId, versionId, selectedCustomId);
    refreshCustom();
    setSelectedCustomId('');
    setEditName('');
    setEditBody('{{#classes}}\n{{name}}\n{{/classes}}');
  };

  const disabled = !studio?.state?.versionId;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(96vw,900px)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl flex flex-col overflow-hidden"
          aria-describedby="generate-code-description"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-600 px-4 py-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Generate code
              </Dialog.Title>
            </div>
            <Dialog.Close
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <p id="generate-code-description" className="sr-only">
            Generate TypeScript, Prisma, GraphQL, Go, Pydantic, SQL, or custom Mustache from the
            current schema.
          </p>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {disabled && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Open a version in the studio to generate code.
              </p>
            )}

            <Tabs.Root value={tab} onValueChange={(v) => setTab(v as 'builtin' | 'custom')}>
              <Tabs.List className="flex gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 w-fit">
                <Tabs.Trigger
                  value="builtin"
                  className="px-3 py-1.5 text-sm rounded-md data-[state=active]:bg-white data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow text-slate-700 dark:text-slate-200"
                >
                  Built-in
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="custom"
                  className="px-3 py-1.5 text-sm rounded-md data-[state=active]:bg-white data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow text-slate-700 dark:text-slate-200"
                >
                  Custom (Mustache)
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="builtin" className="mt-3 space-y-3">
                <div>
                  <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Template
                  </Label.Root>
                  <Select.Root
                    value={builtinId}
                    onValueChange={(v) => setBuiltinId(v as BuiltinTemplateId)}
                    disabled={disabled}
                  >
                    <Select.Trigger className={`mt-1 ${selectTriggerClass}`}>
                      <Select.Value />
                      <Select.Icon />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-[100]">
                        <Select.Viewport className="p-1">
                          {BUILTIN_CODE_TEMPLATES.map((t) => (
                            <Select.Item
                              key={t.id}
                              value={t.id}
                              className="px-3 py-2 text-sm rounded cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-700"
                            >
                              <Select.ItemText>
                                {t.label} — {t.description}
                              </Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
              </Tabs.Content>

              <Tabs.Content value="custom" className="mt-3 space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-mono">
                  {MUSTACHE_HELP}
                </p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Saved templates
                    </Label.Root>
                    <Select.Root
                      value={selectedCustomId || '__new__'}
                      onValueChange={(v) => {
                        if (v === '__new__') {
                          setSelectedCustomId('');
                          setEditName('New template');
                          setEditBody(
                            '{{#classes}}\nexport interface {{name}} {\n{{#properties}}  {{column}}: {{tsType}};\n{{/properties}}\n}\n{{/classes}}'
                          );
                        } else setSelectedCustomId(v);
                      }}
                      disabled={disabled}
                    >
                      <Select.Trigger className={`mt-1 ${selectTriggerClass}`}>
                        <Select.Value placeholder="New template" />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-[100]">
                          <Select.Viewport className="p-1">
                            <Select.Item
                              value="__new__"
                              className="px-3 py-2 text-sm rounded cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-700"
                            >
                              <Select.ItemText>+ New template</Select.ItemText>
                            </Select.Item>
                            {customList.map((c) => (
                              <Select.Item
                                key={c.id}
                                value={c.id}
                                className="px-3 py-2 text-sm rounded cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-700"
                              >
                                <Select.ItemText>{c.name}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveCustom}
                    disabled={disabled || saving}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCustom}
                    disabled={disabled || !selectedCustomId}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
                <div>
                  <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Name
                  </Label.Root>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={disabled}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Mustache template
                  </Label.Root>
                  <div className="mt-1 h-40 rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
                    <Editor
                      height="160px"
                      language="plaintext"
                      theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                      value={editBody}
                      onChange={(v) => setEditBody(v ?? '')}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        wordWrap: 'on',
                      }}
                    />
                  </div>
                </div>
                {mustacheError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{mustacheError}</p>
                )}
              </Tabs.Content>
            </Tabs.Root>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Preview
                </Label.Root>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    disabled={disabled}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copyFlash ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={disabled}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </div>
              </div>
              <div className="h-[min(40vh,320px)] rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
                <Editor
                  height="100%"
                  language={previewLang === 'prisma' ? 'sql' : previewLang}
                  theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                  value={preview}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: 'on',
                  }}
                />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
