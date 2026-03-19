'use client';

/**
 * Shared code generation preview: built-in targets, custom Mustache, copy/download.
 * Preview updates when studio classes change (schema).
 *
 * Reference: GitHub #120 — preview panel; #119 — templates; #121 — tagged schema source.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import * as Label from '@radix-ui/react-label';
import * as Select from '@radix-ui/react-select';
import * as Tabs from '@radix-ui/react-tabs';
import { Copy, Download, Loader2, Save, Trash2 } from 'lucide-react';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useDialog } from '@/app/components/providers/DialogProvider';
import {
  listVersions,
  listClassesWithPropertiesAndTags,
  getRestClientOptions,
  type VersionSchema,
} from '@lib/api/rest-client';
import { classesAndPropertiesToState } from '@lib/studio/stateAdapter';
import type { StudioClass } from '@lib/studio/types';
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

export const selectTriggerClass =
  'inline-flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400';

export const MUSTACHE_HELP = `Mustache view: {{#classes}} ... {{/classes}}
Each class: {{name}}, {{snake}}, {{id}}
{{#properties}} {{name}} {{snake}} {{column}} {{tsType}} {{prismaType}} {{graphqlType}} {{goType}} {{pydanticType}} {{optional}} {{required}} {{isRefId}} {{refModel}} {{/properties}}`;

const DEFAULT_CUSTOM_BODY =
  '{{#classes}}\n// {{name}}\n{{#properties}}  // {{name}}: {{tsType}}\n{{/properties}}\n{{/classes}}';

export interface CodeGenerationPreviewFormProps {
  /** Dialog resets when opened; panel resets when version changes via resetVersionKey */
  variant: 'dialog' | 'panel';
  /** When false (dialog closed), skip reset effects */
  active: boolean;
  /** Bump when studio version changes (panel) */
  resetVersionKey?: string;
}

export default function CodeGenerationPreviewForm({
  variant,
  active,
  resetVersionKey = '',
}: CodeGenerationPreviewFormProps) {
  const studio = useStudioOptional();
  const workspace = useWorkspaceOptional();
  const { data: session } = useSession();
  const { resolvedTheme } = useTheme();
  const { confirm, alert: dialogAlert } = useDialog();

  const tenantId = workspace?.tenant?.id ?? '';
  const projectId = workspace?.project?.id ?? '';
  const versionId = studio?.state?.versionId ?? '';
  const classes = studio?.state?.classes ?? [];

  const restOpts = useMemo(
    () => getRestClientOptions((session as { accessToken?: string } | null) ?? null),
    [(session as { accessToken?: string } | null)?.accessToken]
  );

  /** `canvas` = live studio state; else version UUID for a tagged version’s persisted schema. */
  const [schemaSourceId, setSchemaSourceId] = useState<string>('canvas');
  const [taggedVersionList, setTaggedVersionList] = useState<VersionSchema[]>([]);
  const [taggedClasses, setTaggedClasses] = useState<StudioClass[] | null>(null);
  const [taggedLoading, setTaggedLoading] = useState(false);

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

  const applyDialogOpenReset = useCallback(() => {
    setSchemaSourceId('canvas');
    setTaggedClasses(null);
    setTab('builtin');
    setBuiltinId('typescript');
    refreshCustom();
    setSelectedCustomId('');
    setEditName('');
    setEditBody(DEFAULT_CUSTOM_BODY);
  }, [refreshCustom]);

  useEffect(() => {
    if (!active || variant !== 'dialog') return;
    applyDialogOpenReset();
  }, [active, variant, applyDialogOpenReset]);

  useEffect(() => {
    if (!active || variant !== 'panel' || !resetVersionKey) return;
    setSchemaSourceId('canvas');
    setTaggedClasses(null);
    setTab('builtin');
    setBuiltinId('typescript');
    refreshCustom();
    setSelectedCustomId('');
    setEditName('');
    setEditBody(DEFAULT_CUSTOM_BODY);
  }, [active, variant, resetVersionKey, refreshCustom]);

  useEffect(() => {
    if (!tenantId || !projectId) {
      setTaggedVersionList([]);
      return;
    }
    if (!active) {
      return;
    }
    let cancelled = false;
    void listVersions(tenantId, projectId, restOpts)
      .then((vs) => {
        if (!cancelled) {
          setTaggedVersionList(
            vs.filter((v) => v.code_generation_tag && String(v.code_generation_tag).trim() !== '')
          );
        }
      })
      .catch(() => {
        if (!cancelled) setTaggedVersionList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [active, tenantId, projectId, restOpts]);

  useEffect(() => {
    if (!active || schemaSourceId === 'canvas') {
      setTaggedClasses(null);
      setTaggedLoading(false);
      return;
    }
    let cancelled = false;
    setTaggedLoading(true);
    setTaggedClasses(null);
    void listClassesWithPropertiesAndTags(schemaSourceId, restOpts)
      .then((raw) => {
        if (cancelled) return;
        const st = classesAndPropertiesToState(schemaSourceId, null, raw, []);
        setTaggedClasses(st.classes);
      })
      .catch(async (e) => {
        if (cancelled) return;
        await dialogAlert({
          title: 'Could not load tagged version',
          message: e instanceof Error ? e.message : 'Failed to load classes for this tag.',
          variant: 'error',
        });
        setSchemaSourceId('canvas');
      })
      .finally(() => {
        if (!cancelled) setTaggedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, schemaSourceId, restOpts]);

  useEffect(() => {
    if (schemaSourceId === 'canvas') return;
    if (taggedVersionList.length === 0) {
      setSchemaSourceId('canvas');
      return;
    }
    const stillValid = taggedVersionList.some((v) => v.id === schemaSourceId);
    if (!stillValid) setSchemaSourceId('canvas');
  }, [taggedVersionList, schemaSourceId]);

  const effectiveClasses = useMemo(() => {
    if (schemaSourceId === 'canvas') return classes;
    return taggedClasses ?? [];
  }, [schemaSourceId, classes, taggedClasses]);

  const schemaSourceLabel = useMemo(() => {
    if (schemaSourceId === 'canvas') return 'current canvas';
    const v = taggedVersionList.find((x) => x.id === schemaSourceId);
    return v?.code_generation_tag
      ? `tag “${v.code_generation_tag}” (${v.name})`
      : 'tagged version';
  }, [schemaSourceId, taggedVersionList]);

  useEffect(() => {
    if (!selectedCustomId || customList.length === 0) return;
    const t = customList.find((c) => c.id === selectedCustomId);
    if (t) {
      setEditName(t.name);
      setEditBody(t.body);
    }
  }, [selectedCustomId, customList]);

  const builtinOutput = useMemo(() => {
    if (taggedLoading) return '// Loading schema from tagged version…\n';
    if (!effectiveClasses.length) {
      return schemaSourceId === 'canvas'
        ? '// Add classes on the canvas to generate code.\n'
        : '// No classes in this tagged version.\n';
    }
    return generateFromBuiltinTemplate(builtinId, effectiveClasses);
  }, [builtinId, effectiveClasses, schemaSourceId, taggedLoading]);

  const { customOutput, mustacheError } = useMemo(() => {
    if (taggedLoading) {
      return {
        customOutput: '// Loading schema from tagged version…\n',
        mustacheError: null as string | null,
      };
    }
    if (!effectiveClasses.length) {
      return {
        customOutput:
          schemaSourceId === 'canvas'
            ? '// Add classes on the canvas to generate code.\n'
            : '// No classes in this tagged version.\n',
        mustacheError: null as string | null,
      };
    }
    if (!editBody.trim()) {
      return { customOutput: '// Enter a Mustache template below.\n', mustacheError: null };
    }
    try {
      return {
        customOutput: renderCustomMustacheTemplate(editBody, effectiveClasses),
        mustacheError: null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { customOutput: `// Template error: ${msg}\n`, mustacheError: msg };
    }
  }, [editBody, effectiveClasses, schemaSourceId, taggedLoading]);

  const preview = tab === 'builtin' ? builtinOutput : customOutput;
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
      tab === 'builtin' ? BUILTIN_CODE_TEMPLATES.find((b) => b.id === builtinId) : null;
    const name =
      tab === 'builtin'
        ? meta?.fileHint ?? 'generated.txt'
        : `${(editName || 'custom').replace(/[^a-zA-Z0-9-_]/g, '_')}.txt`;
    const blob = new Blob([preview], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
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
  const isPanel = variant === 'panel';
  const previewEditorHeight = isPanel ? 'min(42vh, 280px)' : 'min(40vh, 320px)';

  return (
    <div
      className={
        isPanel
          ? 'flex flex-col flex-1 min-h-0 gap-3 overflow-hidden'
          : 'space-y-4 min-h-0'
      }
    >
      {disabled && (
        <p className="text-sm text-amber-700 dark:text-amber-300 shrink-0">
          Open a version in the studio to generate code.
        </p>
      )}

      {!disabled && tenantId && projectId && (
        <div className="shrink-0">
          <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Schema for generation
          </Label.Root>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-1">
            Use the live canvas, or a version tagged on the Dashboard → Versions page (e.g.{' '}
            <span className="font-mono">api-v2</span>).
          </p>
          <Select.Root
            value={schemaSourceId}
            onValueChange={(v) => setSchemaSourceId(v)}
          >
            <Select.Trigger
              className={`mt-1 ${selectTriggerClass}`}
              data-testid="schema-source-select"
            >
              <Select.Value />
              <Select.Icon />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg z-[100]">
                <Select.Viewport className="p-1 max-h-[min(50vh,280px)] overflow-y-auto">
                  <Select.Item
                    value="canvas"
                    className="px-3 py-2 text-sm rounded cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-700"
                  >
                    <Select.ItemText>Current working (canvas)</Select.ItemText>
                  </Select.Item>
                  {taggedVersionList.map((v) => (
                    <Select.Item
                      key={v.id}
                      value={v.id}
                      className="px-3 py-2 text-sm rounded cursor-pointer outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-700"
                    >
                      <Select.ItemText>
                        Tag <span className="font-mono">{v.code_generation_tag}</span> — {v.name}
                      </Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      )}

      <div className={isPanel ? 'shrink-0 space-y-3 overflow-y-auto max-h-[45vh]' : 'space-y-4'}>
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
                Template / target
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
                    <Select.Viewport className="p-1 max-h-[min(60vh,320px)] overflow-y-auto">
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
                onClick={() => void handleDeleteCustom()}
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
              <div
                className={`mt-1 rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden ${isPanel ? 'h-[120px]' : 'h-[160px]'}`}
              >
                <Editor
                  height="100%"
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
      </div>

      <div className={isPanel ? 'flex flex-col flex-1 min-h-0 border-t border-slate-200 dark:border-slate-600 pt-3' : ''}>
        <div className="flex items-center justify-between mb-1 shrink-0">
          <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Preview
            {schemaSourceId === 'canvas' && versionId && classes.length > 0 && (
              <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                (updates as you edit the schema)
              </span>
            )}
            {schemaSourceId !== 'canvas' && !taggedLoading && (
              <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                (from {schemaSourceLabel})
              </span>
            )}
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
        <div
          className={
            isPanel
              ? 'flex-1 min-h-[160px] rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden'
              : `rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden`
          }
          style={isPanel ? undefined : { height: previewEditorHeight }}
        >
          <Editor
            height={isPanel ? '100%' : previewEditorHeight}
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
  );
}
