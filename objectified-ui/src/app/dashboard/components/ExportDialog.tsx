'use client';

/**
 * Export wizard: format options, include groups, background; capture and download.
 * Reference: GitHub #92, #93 — export dialog and export wizard.
 */

import { useMemo, useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import * as Select from '@radix-ui/react-select';
import { X, Image, FileCode, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import { useExportFunctions } from '@/app/hooks/useExportFunctions';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import type { ImageExportScope } from '@/app/contexts/CanvasExportContext';
import * as Popover from '@radix-ui/react-popover';
import * as Checkbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportType = 'image' | 'data';
type ImageFormat = 'png' | 'svg' | 'jpeg' | 'pdf';
type DataFormat =
  | 'mermaid'
  | 'plantuml'
  | 'dot'
  | 'graphml'
  | 'json'
  | 'openapi'
  | 'docs-markdown'
  | 'docs-html'
  | 'sql-ddl';
type BackgroundOption = 'white' | 'transparent';

const IMAGE_SCOPES: { value: ImageExportScope; label: string; hint: string }[] = [
  { value: 'full', label: 'Full diagram', hint: 'Fit entire graph in view, then capture' },
  { value: 'viewport', label: 'Current view', hint: 'Capture at the current pan/zoom' },
  { value: 'selected', label: 'Selected nodes', hint: 'Only selected classes/groups and edges between them' },
  { value: 'perGroup', label: 'One file per group', hint: 'Separate download for each top-level group (not for PDF print)' },
];

const IMAGE_FORMATS: { value: ImageFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'svg', label: 'SVG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'pdf', label: 'PDF' },
];

const BASE_DATA_FORMATS: { value: DataFormat; label: string }[] = [
  { value: 'mermaid', label: 'Mermaid' },
  { value: 'plantuml', label: 'PlantUML' },
  { value: 'dot', label: 'DOT' },
  { value: 'graphml', label: 'GraphML' },
  { value: 'json', label: 'JSON' },
];

const BACKGROUND_OPTIONS: { value: BackgroundOption; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'transparent', label: 'Transparent' },
];

const btnClass =
  'flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left text-sm';

const selectTriggerClass =
  'inline-flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400';

export default function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const exportFns = useExportFunctions();
  const workspace = useWorkspaceOptional();
  const studio = useStudioOptional();
  const studioGroups = useMemo(() => studio?.state?.groups ?? [], [studio?.state?.groups]);
  const tenantId = workspace?.tenant?.id ? String(workspace.tenant.id) : '';
  const brandingStorageKey = useMemo(
    () => (tenantId ? `objectified:docs:branding:${tenantId}` : 'objectified:docs:branding'),
    [tenantId]
  );
  const [step, setStep] = useState(1);
  const [exportType, setExportType] = useState<ExportType | null>(null);
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png');
  const [dataFormat, setDataFormat] = useState<DataFormat>('mermaid');
  const [background, setBackground] = useState<BackgroundOption>('white');
  const [includeGroups, setIncludeGroups] = useState(true);
  const [imageScope, setImageScope] = useState<ImageExportScope>('viewport');
  const [dataRestrictGroupIds, setDataRestrictGroupIds] = useState<string[]>([]);
  const [includeGroupInfo, setIncludeGroupInfo] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [docsTitle, setDocsTitle] = useState('API Documentation');
  const [docsVersion, setDocsVersion] = useState('0.1.0');
  const [docsDescription, setDocsDescription] = useState('');
  const [docsBrandName, setDocsBrandName] = useState('');
  const [docsLogoUrl, setDocsLogoUrl] = useState('');
  const [docsPrimaryColor, setDocsPrimaryColor] = useState('#4f46e5');

  useEffect(() => {
    if (open) {
      setStep(1);
      setExportType(null);
      setImageFormat('png');
      setDataFormat('mermaid');
      setBackground('white');
      setIncludeGroups(true);
      setImageScope('viewport');
      setDataRestrictGroupIds([]);
      setIncludeGroupInfo(true);
      setExporting(null);

      try {
        const raw = window.localStorage.getItem(brandingStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<{
            title: string;
            version: string;
            description: string;
            brandName: string;
            logoUrl: string;
            primaryColor: string;
          }>;
          setDocsTitle(
            typeof parsed.title === 'string' && parsed.title.trim()
              ? parsed.title
              : 'API Documentation'
          );
          setDocsVersion(
            typeof parsed.version === 'string' && parsed.version.trim()
              ? parsed.version
              : '0.1.0'
          );
          setDocsDescription(typeof parsed.description === 'string' ? parsed.description : '');
          setDocsBrandName(typeof parsed.brandName === 'string' ? parsed.brandName : '');
          setDocsLogoUrl(typeof parsed.logoUrl === 'string' ? parsed.logoUrl : '');
          setDocsPrimaryColor(
            typeof parsed.primaryColor === 'string' && parsed.primaryColor.trim()
              ? parsed.primaryColor
              : '#4f46e5'
          );
        } else {
          setDocsTitle('API Documentation');
          setDocsVersion('0.1.0');
          setDocsDescription('');
          setDocsBrandName('');
          setDocsLogoUrl('');
          setDocsPrimaryColor('#4f46e5');
        }
      } catch {
        setDocsTitle('API Documentation');
        setDocsVersion('0.1.0');
        setDocsDescription('');
        setDocsBrandName('');
        setDocsLogoUrl('');
        setDocsPrimaryColor('#4f46e5');
      }
    }
  }, [open, brandingStorageKey]);

  const imageDisabled = !exportFns.imageExportReady;
  const dataDisabled = !exportFns.dataExportReady;
  const dataFormats: { value: DataFormat; label: string }[] = [
    ...BASE_DATA_FORMATS,
    ...(exportFns.schemaMode === 'openapi'
      ? ([
          { value: 'openapi', label: 'OpenAPI document (JSON)' },
          { value: 'docs-markdown', label: 'API documentation (Markdown)' },
          { value: 'docs-html', label: 'API documentation (Static HTML)' },
        ] as const)
      : ([] as const)),
    ...(exportFns.schemaMode === 'sql'
      ? ([{ value: 'sql-ddl', label: 'SQL DDL (PostgreSQL)' }] as const)
      : ([] as const)),
  ];

  // When schemaMode changes, reset dataFormat if the current selection is no longer available.
  useEffect(() => {
    const modeFormats: DataFormat[] =
      exportFns.schemaMode === 'openapi'
        ? ['openapi', 'docs-markdown', 'docs-html']
        : exportFns.schemaMode === 'sql'
          ? ['sql-ddl']
          : [];
    const valid: DataFormat[] = ['mermaid', 'plantuml', 'dot', 'graphml', 'json', ...modeFormats];
    setDataFormat((prev) => (valid.includes(prev) ? prev : 'mermaid'));
  }, [exportFns.schemaMode]);

  useEffect(() => {
    if (imageFormat === 'pdf' && imageScope === 'perGroup') {
      setImageScope('viewport');
    }
  }, [imageFormat, imageScope]);

  const dataGroupFilterSummary =
    dataRestrictGroupIds.length === 0
      ? 'All classes'
      : dataRestrictGroupIds.length === 1
        ? studioGroups.find((g) => g.id === dataRestrictGroupIds[0])?.name ?? '1 group'
        : `${dataRestrictGroupIds.length} groups`;

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleImageExport = async (): Promise<void> => {
    const label = imageFormat.toUpperCase();
    setExporting(label);
    try {
      const scope = imageScope;
      const opts = {
        backgroundColor: background === 'transparent' ? 'transparent' : background,
        includeGroups,
        scope,
      };
      const fns = {
        png: () => exportFns.exportAsPng(opts),
        svg: () => exportFns.exportAsSvg(opts),
        jpeg: () => exportFns.exportAsJpeg(opts),
        pdf: () => exportFns.exportAsPdf(opts),
      };
      await fns[imageFormat]();
      onOpenChange(false);
    } catch (err) {
      console.error(`Export ${label} failed:`, err);
    } finally {
      setExporting(null);
    }
  };

  const handleDataExport = (): void => {
    const label = dataFormat;
    setExporting(label);
    try {
      const opts = {
        includeGroupInfo,
        restrictToGroupIds:
          dataRestrictGroupIds.length > 0 ? dataRestrictGroupIds : undefined,
      };
      const docsOpts = {
        title: docsTitle,
        version: docsVersion,
        description: docsDescription,
        brandName: docsBrandName,
        logoUrl: docsLogoUrl,
        primaryColor: docsPrimaryColor,
      };
      const fns = {
        mermaid: () => exportFns.exportAsMermaid(opts),
        plantuml: () => exportFns.exportAsPlantUML(opts),
        dot: () => exportFns.exportAsDot(opts),
        graphml: () => exportFns.exportAsGraphML(opts),
        json: () => exportFns.exportAsJson(opts),
        openapi: () => exportFns.exportAsOpenApi(),
        'docs-markdown': () => exportFns.exportAsDocsMarkdown(docsOpts),
        'docs-html': () => exportFns.exportAsDocsHtml(docsOpts),
        'sql-ddl': () => exportFns.exportAsSqlDdl(),
      };
      fns[dataFormat]();
      if (dataFormat === 'docs-markdown' || dataFormat === 'docs-html') {
        try {
          window.localStorage.setItem(brandingStorageKey, JSON.stringify(docsOpts));
        } catch {
          // ignore storage failures (private mode, quota, etc.)
        }
      }
      onOpenChange(false);
    } finally {
      setExporting(null);
    }
  };

  const handleCaptureAndDownload = () => {
    if (exportType === 'image') void handleImageExport();
    else if (exportType === 'data') handleDataExport();
  };

  const canProceedStep1 = exportType !== null;
  const isStep2Valid =
    (exportType === 'image' && (imageDisabled ? false : true)) ||
    (exportType === 'data' && (dataDisabled ? false : true));
  const showDocsBrandingFields =
    exportType === 'data' && (dataFormat === 'docs-markdown' || dataFormat === 'docs-html');
  const exportLabel =
    exportType === 'image'
      ? `Capture as ${IMAGE_FORMATS.find((f) => f.value === imageFormat)?.label ?? imageFormat}`
      : exportType === 'data'
        ? `Export as ${dataFormats.find((f) => f.value === dataFormat)?.label ?? dataFormat}`
        : 'Export';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9998] animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden z-[9999] animate-in focus:outline-none flex flex-col"
          aria-describedby="export-dialog-description"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div>
              <Dialog.Title className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Export canvas
              </Dialog.Title>
              <Dialog.Description
                id="export-dialog-description"
                className="text-sm text-slate-500 dark:text-slate-400 mt-1"
              >
                {step === 1 && 'Choose what to export.'}
                {step === 2 && 'Set format and options.'}
                {step === 3 && 'Review and download.'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4 p-4 overflow-y-auto">
            {/* Step 1: Export type */}
            {step === 1 && (
              <div className="flex flex-col gap-2">
                <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Export as
                </Label.Root>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors text-left ${
                      exportType === 'image'
                        ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                    } ${imageDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => !imageDisabled && setExportType('image')}
                    disabled={imageDisabled}
                    title={imageDisabled ? 'Load the canvas first' : 'Capture canvas as image'}
                  >
                    <Image className="w-8 h-8 text-slate-600 dark:text-slate-400" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Image
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      PNG, SVG, JPEG, PDF
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors text-left ${
                      exportType === 'data'
                        ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                    } ${dataDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => !dataDisabled && setExportType('data')}
                    disabled={dataDisabled}
                    title={dataDisabled ? 'Load a version with classes first' : 'Export diagram as data'}
                  >
                    <FileCode className="w-8 h-8 text-slate-600 dark:text-slate-400" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Data
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Mermaid, PlantUML, etc.
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Format and options */}
            {step === 2 && exportType === 'image' && (
              <div className="flex flex-col gap-4">
                <div>
                  <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                    Format
                  </Label.Root>
                  <Select.Root value={imageFormat} onValueChange={(v) => setImageFormat(v as ImageFormat)}>
                    <Select.Trigger className={selectTriggerClass} aria-label="Image format">
                      <Select.Value />
                      <Select.Icon>
                        <ChevronRight className="w-4 h-4" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content
                        className="overflow-hidden bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-lg"
                        position="popper"
                        sideOffset={4}
                      >
                        {IMAGE_FORMATS.map((f) => (
                          <Select.Item
                            key={f.value}
                            value={f.value}
                            className="px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:bg-slate-100 dark:focus:bg-slate-700 focus:outline-none cursor-pointer"
                          >
                            <Select.ItemText>{f.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
                <div>
                  <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                    Background
                  </Label.Root>
                  <Select.Root value={background} onValueChange={(v) => setBackground(v as BackgroundOption)}>
                    <Select.Trigger className={selectTriggerClass} aria-label="Background">
                      <Select.Value />
                      <Select.Icon>
                        <ChevronRight className="w-4 h-4" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content
                        className="overflow-hidden bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-lg"
                        position="popper"
                        sideOffset={4}
                      >
                        {BACKGROUND_OPTIONS.map((o) => (
                          <Select.Item
                            key={o.value}
                            value={o.value}
                            className="px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:bg-slate-100 dark:focus:bg-slate-700 focus:outline-none cursor-pointer"
                          >
                            <Select.ItemText>{o.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeGroups}
                    onChange={(e) => setIncludeGroups(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Include group boxes in capture
                  </span>
                </label>
                <div>
                  <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                    Capture scope
                  </Label.Root>
                  <Select.Root
                    value={imageScope}
                    onValueChange={(v) => setImageScope(v as ImageExportScope)}
                  >
                    <Select.Trigger className={selectTriggerClass} aria-label="Image capture scope">
                      <Select.Value />
                      <Select.Icon>
                        <ChevronRight className="w-4 h-4" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content
                        className="overflow-hidden bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-lg"
                        position="popper"
                        sideOffset={4}
                      >
                        {IMAGE_SCOPES.map((s) => (
                          <Select.Item
                            key={s.value}
                            value={s.value}
                            disabled={imageFormat === 'pdf' && s.value === 'perGroup'}
                            className="px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:bg-slate-100 dark:focus:bg-slate-700 focus:outline-none cursor-pointer data-[disabled]:opacity-40 data-[disabled]:pointer-events-none"
                            title={s.hint}
                          >
                            <Select.ItemText>{s.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {IMAGE_SCOPES.find((s) => s.value === imageScope)?.hint}
                    {imageFormat === 'pdf'
                      ? ' PDF uses a print dialog; choose PNG for one download per group.'
                      : ''}
                  </p>
                </div>
              </div>
            )}

            {step === 2 && exportType === 'data' && (
              <div className="flex flex-col gap-4">
                <div>
                  <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                    Format
                  </Label.Root>
                  <Select.Root value={dataFormat} onValueChange={(v) => setDataFormat(v as DataFormat)}>
                    <Select.Trigger className={selectTriggerClass} aria-label="Data format">
                      <Select.Value />
                      <Select.Icon>
                        <ChevronRight className="w-4 h-4" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content
                        className="overflow-hidden bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-lg"
                        position="popper"
                        sideOffset={4}
                      >
                        {dataFormats.map((f) => (
                          <Select.Item
                            key={f.value}
                            value={f.value}
                            className="px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:bg-slate-100 dark:focus:bg-slate-700 focus:outline-none cursor-pointer"
                          >
                            <Select.ItemText>{f.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeGroupInfo}
                    onChange={(e) => setIncludeGroupInfo(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    Include group information in export
                  </span>
                </label>

                <div>
                  <Label.Root className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                    Limit to groups (optional)
                  </Label.Root>
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        className={selectTriggerClass}
                        aria-label="Restrict data export to certain groups"
                      >
                        <span className="truncate text-left flex-1">{dataGroupFilterSummary}</span>
                        <ChevronRight className="w-4 h-4 shrink-0" />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="overflow-y-auto max-h-[min(280px,45vh)] w-[min(280px,85vw)] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg z-[10003] p-2"
                        sideOffset={4}
                        align="start"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2 px-1">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Export classes in…
                          </span>
                          {dataRestrictGroupIds.length > 0 ? (
                            <button
                              type="button"
                              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                              onClick={() => setDataRestrictGroupIds([])}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                        {studioGroups.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 px-1 py-2">
                            No groups on this version.
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-0.5">
                            {studioGroups.map((g) => {
                              const checked = dataRestrictGroupIds.includes(g.id);
                              return (
                                <li key={g.id}>
                                  <label className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-sm text-slate-800 dark:text-slate-200">
                                    <Checkbox.Root
                                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                      checked={checked}
                                      onCheckedChange={() =>
                                        setDataRestrictGroupIds((prev) =>
                                          prev.includes(g.id)
                                            ? prev.filter((x) => x !== g.id)
                                            : [...prev, g.id]
                                        )
                                      }
                                    >
                                      <Checkbox.Indicator>
                                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                      </Checkbox.Indicator>
                                    </Checkbox.Root>
                                    <span className="truncate">{g.name}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Nested groups under a selected group are included.
                  </p>
                </div>

                {showDocsBrandingFields && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Documentation options
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label.Root htmlFor="docs-title" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Title
                        </Label.Root>
                        <input
                          id="docs-title"
                          type="text"
                          value={docsTitle}
                          onChange={(e) => setDocsTitle(e.target.value)}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="API Documentation"
                        />
                      </div>
                      <div>
                        <Label.Root htmlFor="docs-version" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Version
                        </Label.Root>
                        <input
                          id="docs-version"
                          type="text"
                          value={docsVersion}
                          onChange={(e) => setDocsVersion(e.target.value)}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="0.1.0"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label.Root htmlFor="docs-description" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Description (optional)
                        </Label.Root>
                        <input
                          id="docs-description"
                          type="text"
                          value={docsDescription}
                          onChange={(e) => setDocsDescription(e.target.value)}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Short intro shown at top of the docs"
                        />
                      </div>
                      <div>
                        <Label.Root htmlFor="docs-brand-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Brand name (optional)
                        </Label.Root>
                        <input
                          id="docs-brand-name"
                          type="text"
                          value={docsBrandName}
                          onChange={(e) => setDocsBrandName(e.target.value)}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Tenant / Product"
                        />
                      </div>
                      <div>
                        <Label.Root htmlFor="docs-primary-color" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Primary color (optional)
                        </Label.Root>
                        <input
                          id="docs-primary-color"
                          type="text"
                          value={docsPrimaryColor}
                          onChange={(e) => setDocsPrimaryColor(e.target.value)}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="#4f46e5"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label.Root htmlFor="docs-logo-url" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Logo URL (optional, http/https only)
                        </Label.Root>
                        <input
                          id="docs-logo-url"
                          type="text"
                          value={docsLogoUrl}
                          onChange={(e) => setDocsLogoUrl(e.target.value)}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      These options are saved locally{tenantId ? ' for this tenant' : ''} for
                      convenience.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Review and download */}
            {step === 3 && (
              <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-400">
                <p>
                  {exportType === 'image' && (
                    <>
                      Format: <strong className="text-slate-800 dark:text-slate-200">{imageFormat.toUpperCase()}</strong>
                      . Background: <strong className="text-slate-800 dark:text-slate-200">{background}</strong>.
                      Group boxes: <strong className="text-slate-800 dark:text-slate-200">{includeGroups ? 'Yes' : 'No'}</strong>.
                      Scope:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {IMAGE_SCOPES.find((s) => s.value === imageScope)?.label ?? imageScope}
                      </strong>.
                    </>
                  )}
                  {exportType === 'data' && (
                    <>
                      Format: <strong className="text-slate-800 dark:text-slate-200">{dataFormats.find((f) => f.value === dataFormat)?.label ?? dataFormat}</strong>.
                      Group info: <strong className="text-slate-800 dark:text-slate-200">{includeGroupInfo ? 'Yes' : 'No'}</strong>.
                      {dataRestrictGroupIds.length > 0 ? (
                        <>
                          {' '}
                          Groups: <strong className="text-slate-800 dark:text-slate-200">{dataGroupFilterSummary}</strong>.
                        </>
                      ) : null}
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <div>
              {step > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 ? !canProceedStep1 : !isStep2Valid}
                  className={btnClass}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCaptureAndDownload}
                  disabled={!isStep2Valid || exporting !== null}
                  className={btnClass}
                >
                  {exporting ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  {exporting ? 'Exporting…' : exportType === 'image' ? 'Capture and download' : 'Export and download'}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
