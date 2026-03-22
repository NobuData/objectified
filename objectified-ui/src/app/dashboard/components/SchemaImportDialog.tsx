'use client';

/**
 * Schema import: file / URL (with optional auth) / paste, OpenAPI or JSON Schema,
 * validation, dry-run preview, apply, post-import report, and local recent-import history.
 * Reference: GitHub #200.
 */

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import * as Tabs from '@radix-ui/react-tabs';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileUp,
  Link2,
  Loader2,
  ScrollText,
} from 'lucide-react';
import { useDialog } from '@/app/components/providers/DialogProvider';
import {
  fetchImportDocumentUrl,
  importJsonSchema,
  importOpenApi,
  validateJsonSchema,
  validateOpenApiDocument,
  type ImportResultSchema,
  type RestClientOptions,
  type VersionSchema,
} from '@lib/api/rest-client';

const HISTORY_KEY = 'objectified.schemaImportHistory.v1';
const HISTORY_MAX = 30;

export type ImportHistoryEntry = {
  at: string;
  versionId: string;
  versionName: string;
  format: 'openapi' | 'jsonschema';
  source: 'file' | 'url' | 'paste';
  label: string;
  summary: string;
};

function loadHistory(): ImportHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ImportHistoryEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as ImportHistoryEntry).at === 'string' &&
        typeof (e as ImportHistoryEntry).summary === 'string'
    );
  } catch {
    return [];
  }
}

function saveHistoryEntry(entry: ImportHistoryEntry): void {
  if (typeof window === 'undefined') return;
  const prev = loadHistory();
  const next = [entry, ...prev.filter((e) => e.at !== entry.at || e.versionId !== entry.versionId)].slice(
    0,
    HISTORY_MAX
  );
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

function summarizeResult(r: ImportResultSchema): string {
  const parts: string[] = [];
  if (r.classes_created) parts.push(`${r.classes_created} class(es) created`);
  if (r.classes_updated) parts.push(`${r.classes_updated} class(es) updated`);
  if (r.properties_created) parts.push(`${r.properties_created} propert(y/ies) created`);
  if (r.properties_reused) parts.push(`${r.properties_reused} propert(y/ies) reused`);
  if (r.class_properties_created) parts.push(`${r.class_properties_created} link(s) created`);
  if (r.class_properties_skipped) parts.push(`${r.class_properties_skipped} link(s) skipped`);
  return parts.length ? parts.join(' · ') : 'No changes';
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';
const tabListClass =
  'inline-flex h-9 items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-slate-600 dark:text-slate-400';
const tabTriggerClass =
  'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow dark:ring-offset-slate-950 dark:data-[state=active]:bg-slate-950 dark:data-[state=active]:text-slate-100';

export interface SchemaImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: VersionSchema;
  options: RestClientOptions;
}

export default function SchemaImportDialog({
  open,
  onOpenChange,
  version,
  options,
}: SchemaImportDialogProps) {
  const { alert: alertDialog } = useDialog();
  const [format, setFormat] = useState<'openapi' | 'jsonschema'>('openapi');
  const [sourceTab, setSourceTab] = useState<'file' | 'url' | 'paste'>('paste');
  const [url, setUrl] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [document, setDocument] = useState<Record<string, unknown> | null>(null);
  const [docLabel, setDocLabel] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [previewResult, setPreviewResult] = useState<ImportResultSchema | null>(null);
  const [reportResult, setReportResult] = useState<ImportResultSchema | null>(null);
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [loadingUrl, setLoadingUrl] = useState(false);
  const [validating, setValidating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) {
      setHistory(loadHistory());
    }
  }, [open]);

  const resetForClose = useCallback(() => {
    setValidationErrors([]);
    setValidationWarnings([]);
    setPreviewResult(null);
    setReportResult(null);
  }, []);

  const parseJsonFromText = useCallback(
    (text: string, label: string) => {
      const t = text.trim();
      if (!t) {
        void alertDialog({ message: 'Paste or choose a document first.' });
        return;
      }
      try {
        const parsed = JSON.parse(t) as unknown;
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          void alertDialog({ message: 'Document must be a JSON object.' });
          return;
        }
        setDocument(parsed as Record<string, unknown>);
        setDocLabel(label);
        resetForClose();
      } catch {
        void alertDialog({
          message: `Could not parse ${label} as JSON. For YAML, use Import from URL (server fetches and parses YAML) or convert to JSON.`,
        });
      }
    },
    [alertDialog, resetForClose]
  );

  const handleFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        parseJsonFromText(text, file.name);
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [parseJsonFromText]
  );

  const handleLoadUrl = useCallback(async () => {
    const u = url.trim();
    if (!u) {
      void alertDialog({ message: 'Enter a URL.' });
      return;
    }
    setLoadingUrl(true);
    try {
      const headers: Record<string, string> = {};
      const tok = bearerToken.trim();
      if (tok) {
        headers.Authorization = tok.startsWith('Bearer ') ? tok : `Bearer ${tok}`;
      }
      const res = await fetchImportDocumentUrl(version.id, { url: u, headers }, options);
      setDocument(res.document);
      try {
        const parsed = new URL(u);
        setDocLabel(parsed.hostname + parsed.pathname);
      } catch {
        setDocLabel(u);
      }
      resetForClose();
    } catch (err) {
      void alertDialog({
        message: err instanceof Error ? err.message : 'Failed to load URL',
      });
    } finally {
      setLoadingUrl(false);
    }
  }, [url, bearerToken, version.id, options, alertDialog, resetForClose]);

  const handleUsePaste = useCallback(() => {
    parseJsonFromText(pasteText, 'Pasted JSON');
  }, [pasteText, parseJsonFromText]);

  const runValidate = useCallback(async () => {
    if (!document) {
      void alertDialog({ message: 'Load a document first (file, URL, or paste).' });
      return;
    }
    setValidating(true);
    setValidationErrors([]);
    setValidationWarnings([]);
    try {
      if (format === 'openapi') {
        const v = await validateOpenApiDocument(document, options);
        if (!v.valid) {
          setValidationErrors(v.errors);
        } else {
          setValidationWarnings(v.warnings);
        }
      } else {
        const v = await validateJsonSchema(document, options);
        if (!v.valid) {
          setValidationErrors(v.errors.map((e) => `${e.path}: ${e.message}`));
        }
      }
    } catch (err) {
      void alertDialog({
        message: err instanceof Error ? err.message : 'Validation failed',
      });
    } finally {
      setValidating(false);
    }
  }, [document, format, options, alertDialog]);

  const runPreview = useCallback(async () => {
    if (!document) {
      void alertDialog({ message: 'Load a document first.' });
      return;
    }
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const res =
        format === 'openapi'
          ? await importOpenApi(version.id, document, options, true)
          : await importJsonSchema(version.id, document, options, true);
      setPreviewResult(res);
    } catch (err) {
      void alertDialog({
        message: err instanceof Error ? err.message : 'Preview failed',
      });
    } finally {
      setPreviewing(false);
    }
  }, [document, format, version.id, options, alertDialog]);

  const runImport = useCallback(async () => {
    if (!document) {
      void alertDialog({ message: 'Load a document first.' });
      return;
    }
    setImporting(true);
    setReportResult(null);
    try {
      const res =
        format === 'openapi'
          ? await importOpenApi(version.id, document, options, false)
          : await importJsonSchema(version.id, document, options, false);
      setReportResult(res);
      const entry: ImportHistoryEntry = {
        at: new Date().toISOString(),
        versionId: version.id,
        versionName: version.name,
        format,
        source: sourceTab,
        label: docLabel || '—',
        summary: summarizeResult(res),
      };
      saveHistoryEntry(entry);
      setHistory(loadHistory());
    } catch (err) {
      void alertDialog({
        message: err instanceof Error ? err.message : 'Import failed',
      });
    } finally {
      setImporting(false);
    }
  }, [document, format, version, options, alertDialog, sourceTab, docLabel]);

  const docReady = document !== null;
  const title = useMemo(() => `Import schema — ${version.name}`, [version.name]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-lg max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-700"
          onPointerDownOutside={(e) => {
            if (loadingUrl || validating || previewing || importing) e.preventDefault();
          }}
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100 pr-8">
              {title}
            </Dialog.Title>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              OpenAPI 3.x or JSON Schema 2020-12. Preview shows projected creates/updates before apply.
            </p>
          </div>

          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            <div>
              <Label.Root className={labelClass}>Document type</Label.Root>
              <div className="mt-1 flex gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="imp-fmt"
                    checked={format === 'openapi'}
                    onChange={() => setFormat('openapi')}
                    className="rounded-full border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  OpenAPI
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="imp-fmt"
                    checked={format === 'jsonschema'}
                    onChange={() => setFormat('jsonschema')}
                    className="rounded-full border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  JSON Schema
                </label>
              </div>
            </div>

            <Tabs.Root value={sourceTab} onValueChange={(v) => setSourceTab(v as typeof sourceTab)}>
              <Tabs.List className={tabListClass} aria-label="Import source">
                <Tabs.Trigger value="paste" className={tabTriggerClass}>
                  <ScrollText className="h-3.5 w-3.5 mr-1.5 inline" />
                  Paste
                </Tabs.Trigger>
                <Tabs.Trigger value="file" className={tabTriggerClass}>
                  <FileUp className="h-3.5 w-3.5 mr-1.5 inline" />
                  File
                </Tabs.Trigger>
                <Tabs.Trigger value="url" className={tabTriggerClass}>
                  <Link2 className="h-3.5 w-3.5 mr-1.5 inline" />
                  URL
                </Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="paste" className="mt-3 space-y-2">
                <Label.Root htmlFor="imp-paste" className={labelClass}>
                  JSON object
                </Label.Root>
                <textarea
                  id="imp-paste"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={6}
                  className={inputClass + ' font-mono text-xs'}
                  placeholder='{"openapi": "3.0.0", ...}'
                />
                <button
                  type="button"
                  onClick={handleUsePaste}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Use pasted JSON
                </button>
              </Tabs.Content>
              <Tabs.Content value="file" className="mt-3 space-y-2">
                <Label.Root htmlFor="imp-file" className={labelClass}>
                  JSON file
                </Label.Root>
                <input
                  id="imp-file"
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFile}
                  className="text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:rounded-md file:border file:border-slate-300 dark:file:border-slate-600 file:bg-white dark:file:bg-slate-800 file:px-3 file:py-1.5"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  For YAML, use the URL tab (server parses YAML) or convert to JSON.
                </p>
              </Tabs.Content>
              <Tabs.Content value="url" className="mt-3 space-y-2">
                <Label.Root htmlFor="imp-url" className={labelClass}>
                  HTTPS URL
                </Label.Root>
                <input
                  id="imp-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className={inputClass}
                  placeholder="https://example.com/openapi.json"
                  autoComplete="off"
                />
                <Label.Root htmlFor="imp-bearer" className={labelClass}>
                  Bearer token (optional)
                </Label.Root>
                <input
                  id="imp-bearer"
                  type="password"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  className={inputClass}
                  placeholder="Paste token or full Authorization value"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => void handleLoadUrl()}
                  disabled={loadingUrl}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  {loadingUrl && <Loader2 className="h-4 w-4 animate-spin" />}
                  Load from URL
                </button>
              </Tabs.Content>
            </Tabs.Root>

            {docReady && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-700 dark:text-slate-200">Loaded:</span>{' '}
                {docLabel || 'document'}
              </div>
            )}

            {validationErrors.length > 0 && (
              <div
                className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-800 dark:text-red-200"
                role="alert"
              >
                <div className="font-medium flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Validation errors
                </div>
                <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
                  {validationErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {validationWarnings.length > 0 && validationErrors.length === 0 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                <div className="font-medium">Warnings</div>
                <ul className="mt-1 list-disc list-inside">
                  {validationWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {previewResult && (
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/30 px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
                <div className="font-medium text-indigo-900 dark:text-indigo-100">Conflict preview (dry-run)</div>
                <p className="text-xs mt-1 font-mono">{summarizeResult(previewResult)}</p>
                {previewResult.detail.length > 0 && (
                  <ul className="mt-2 max-h-28 overflow-y-auto text-xs font-mono space-y-0.5 border-t border-indigo-200/60 dark:border-indigo-800/60 pt-2">
                    {previewResult.detail.slice(0, 40).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    {previewResult.detail.length > 40 && (
                      <li className="text-slate-500">… {previewResult.detail.length - 40} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {reportResult && !reportResult.dry_run && (
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/80 dark:bg-green-950/30 px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
                <div className="font-medium text-green-900 dark:text-green-100 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Import complete
                </div>
                <p className="text-xs mt-1 font-mono">{summarizeResult(reportResult)}</p>
                {reportResult.detail.length > 0 && (
                  <ul className="mt-2 max-h-28 overflow-y-auto text-xs font-mono space-y-0.5 border-t border-green-200/60 dark:border-green-800/60 pt-2">
                    {reportResult.detail.slice(0, 40).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                    {reportResult.detail.length > 40 && (
                      <li className="text-slate-500">… {reportResult.detail.length - 40} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setHistoryOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Recent imports
                {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {historyOpen && (
                <div className="px-3 py-2 max-h-36 overflow-y-auto text-xs text-slate-600 dark:text-slate-400 space-y-2">
                  {history.length === 0 ? (
                    <p className="text-slate-500">No imports recorded in this browser yet.</p>
                  ) : (
                    history.map((h) => (
                      <div key={`${h.at}-${h.versionId}`} className="border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                        <div className="text-slate-500">
                          {new Date(h.at).toLocaleString()} · {h.versionName} · {h.format} · {h.source}
                        </div>
                        <div className="text-slate-700 dark:text-slate-300">{h.label}</div>
                        <div className="font-mono text-[11px] mt-0.5">{h.summary}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 justify-end shrink-0">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
              >
                Close
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={() => void runValidate()}
              disabled={!docReady || validating}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm disabled:opacity-50 inline-flex items-center gap-2"
            >
              {validating && <Loader2 className="h-4 w-4 animate-spin" />}
              Validate
            </button>
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={!docReady || previewing}
              className="px-3 py-2 rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-sm disabled:opacity-50 inline-flex items-center gap-2"
            >
              {previewing && <Loader2 className="h-4 w-4 animate-spin" />}
              Preview
            </button>
            <button
              type="button"
              onClick={() => void runImport()}
              disabled={!docReady || importing}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm disabled:opacity-50 inline-flex items-center gap-2"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply import
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
