'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import * as Tabs from '@radix-ui/react-tabs';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  Search,
  Plus,
  LayoutGrid,
  Tag,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  getRestClientOptions,
  listClassesWithPropertiesAndTags,
  listProperties,
} from '@lib/api/rest-client';
import {
  generateLocalId,
  getStableClassId,
  type StudioClass,
  type StudioClassProperty,
} from '@lib/studio/types';
import { useWorkspaceOptional } from '@/app/contexts/WorkspaceContext';
import { useStudioOptional } from '@/app/contexts/StudioContext';
import { useEditClassRequestOptional } from '@/app/contexts/EditClassRequestContext';
import { useDialog } from '@/app/components/providers/DialogProvider';
import ClassDialog, { type ClassFormData } from './ClassDialog';
import ClassPropertyDialog, {
  type ClassPropertySaveData,
} from './ClassPropertyDialog';
import {
  refForClassName,
  parseClassNameFromRef,
  getRefTypeFromData,
} from '@lib/studio/canvasClassRefEdges';

// ─── Project-level property list (read-only, search-only) ────────────────────

function SearchableList({
  items,
  emptyMessage,
  noResultsMessage,
  loading,
}: {
  items: string[];
  /** Message shown when the list has no items at all (search field is blank). */
  emptyMessage: string;
  /** Message shown when items exist but the query has no matches. Defaults to emptyMessage. */
  noResultsMessage?: string;
  loading?: boolean;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        query.trim() ? item.toLowerCase().includes(query.toLowerCase()) : true
      ),
    [items, query]
  );

  const emptyText = query.trim()
    ? (noResultsMessage ?? 'No results match your search.')
    : emptyMessage;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            aria-label="Search list"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            <ul className="p-2 space-y-0.5">
              {filtered.map((item) => (
                <li
                  key={item}
                  className="px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-default"
                >
                  {item}
                </li>
              ))}
            </ul>
            {filtered.length === 0 && (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                {emptyText}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Editable class list with CRUD + reorder + class-property management ─────

interface ClassListPanelProps {
  classes: StudioClass[];
  availableProperties: { id: string; name: string; data?: Record<string, unknown> }[];
  canEdit: boolean;
  loading: boolean;
  onAddClass: (data: ClassFormData) => void;
  onUpdateClass: (classId: string, data: ClassFormData) => void;
  onDeleteClass: (cls: StudioClass) => void;
  onReorderClass: (classId: string, direction: 'up' | 'down') => void;
  onAddClassProperty: (classId: string, data: ClassPropertySaveData) => void;
  onUpdateClassProperty: (
    classId: string,
    propIndex: number,
    data: ClassPropertySaveData
  ) => void;
  onRemoveClassProperty: (classId: string, propName: string, propIndex: number) => void;
  onReorderClassProperty: (classId: string, propIndex: number, direction: 'up' | 'down') => void;
  /** When set (e.g. from canvas node double-click), open edit dialog for this class. GitHub #80. */
  editClassIdRequest?: string | null;
  onConsumeEditClassRequest?: () => void;
}

/**
 * Returns unique (non-duplicated), non-empty class names from `classes`, excluding the class
 * with `excludeId`, de-duped by normalized (trim+lowercase) key so only unambiguous targets
 * are offered in the reference dropdown.
 */
function getUniqueClassNamesExcluding(classes: StudioClass[], excludeId: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const names: string[] = [];
  for (const c of classes) {
    if (getStableClassId(c) === excludeId) continue;
    const key = (c.name ?? '').trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.add(key);
    } else {
      seen.add(key);
      names.push((c.name ?? '').trim());
    }
  }
  return names.filter((n) => !duplicates.has(n.toLowerCase())).sort();
}

function ClassListPanel({
  classes,
  availableProperties,
  canEdit,
  loading,
  onAddClass,
  onUpdateClass,
  onDeleteClass,
  onReorderClass,
  onAddClassProperty,
  onUpdateClassProperty,
  onRemoveClassProperty,
  onReorderClassProperty,
  editClassIdRequest,
  onConsumeEditClassRequest,
}: ClassListPanelProps) {
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Dialog state
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<StudioClass | null>(null);
  const [addPropClassId, setAddPropClassId] = useState<string | null>(null);
  const [editingProp, setEditingProp] = useState<{
    classId: string;
    propIndex: number;
    prop: StudioClassProperty;
  } | null>(null);

  // Close all edit dialogs when the canvas transitions to read-only.
  useEffect(() => {
    if (!canEdit) {
      setAddClassOpen(false);
      setEditingClass(null);
      setAddPropClassId(null);
      setEditingProp(null);
    }
  }, [canEdit]);

  // When canvas requests edit (e.g. double-click on node), open the class dialog. GitHub #80.
  useEffect(() => {
    if (!editClassIdRequest || !onConsumeEditClassRequest) return;
    if (canEdit) {
      const cls = classes.find((c) => getStableClassId(c) === editClassIdRequest);
      if (cls) setEditingClass(cls);
    }
    onConsumeEditClassRequest();
  }, [editClassIdRequest, onConsumeEditClassRequest, canEdit, classes]);

  const filtered = useMemo(
    () =>
      classes.filter((cls) =>
        query.trim() ? cls.name.toLowerCase().includes(query.toLowerCase()) : true
      ),
    [classes, query]
  );

  // Precompute a Map of classId → index in `classes` to avoid O(n²) lookups in the render loop.
  const classIndexMap = useMemo(
    () => new Map(classes.map((c, i) => [getStableClassId(c), i])),
    [classes]
  );

  const toggleExpand = (classId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  const handleAddClass = (data: ClassFormData) => {
    onAddClass(data);
    setAddClassOpen(false);
  };

  const handleUpdateClass = (data: ClassFormData) => {
    if (!editingClass) return;
    onUpdateClass(getStableClassId(editingClass), data);
    setEditingClass(null);
  };

  const handleAddProp = (data: ClassPropertySaveData) => {
    if (!addPropClassId) return;
    onAddClassProperty(addPropClassId, data);
    setAddPropClassId(null);
  };

  const handleUpdateProp = (data: ClassPropertySaveData) => {
    if (!editingProp) return;
    onUpdateClassProperty(editingProp.classId, editingProp.propIndex, data);
    setEditingProp(null);
  };

  const availableClassNamesForRefAdd = useMemo(
    () => addPropClassId != null ? getUniqueClassNamesExcluding(classes, addPropClassId) : [],
    [classes, addPropClassId]
  );

  const availableClassNamesForRefEdit = useMemo(
    () => editingProp != null ? getUniqueClassNamesExcluding(classes, editingProp.classId) : [],
    [classes, editingProp]
  );

  // Memoize the initial form values so the ClassDialog useEffect dependency on initial.schema
  // doesn't fire on every render when editingClass hasn't actually changed.
  const editClassInitial = useMemo(
    () =>
      editingClass
        ? {
            name: editingClass.name,
            description: editingClass.description ?? '',
            schema: editingClass.schema,
          }
        : undefined,
    [editingClass]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search classes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            aria-label="Search classes"
          />
        </div>
      </div>

      {/* Class list with context menu (New class). GitHub #95 */}
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div className="flex-1 overflow-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                {query.trim() ? 'No classes match your search.' : 'No classes yet.'}
              </p>
            ) : (
              <ul className="p-2 space-y-0.5">
            {filtered.map((cls) => {
              const classId = getStableClassId(cls);
              const isExpanded = expandedIds.has(classId);
              const classIndex = classIndexMap.get(classId) ?? -1;

              return (
                <li key={classId} className="rounded-lg overflow-hidden">
                  {/* Class row */}
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 group">
                    {/* Expand toggle */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(classId)}
                      className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={isExpanded ? 'Collapse properties' : 'Expand properties'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {/* Class name */}
                    <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      {cls.name}
                    </span>

                    {/* Actions — visible on hover when editable */}
                    {canEdit && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onReorderClass(classId, 'up')}
                          disabled={classIndex === 0}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move class up"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReorderClass(classId, 'down')}
                          disabled={classIndex === classes.length - 1}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move class down"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingClass(cls)}
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                          aria-label={`Edit class ${cls.name}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteClass(cls)}
                          className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                          aria-label={`Delete class ${cls.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Class-property sub-list */}
                  {isExpanded && (
                    <div className="ml-5 border-l border-slate-200 dark:border-slate-700 pl-2 mt-0.5 mb-1 space-y-0.5">
                      {cls.properties.length === 0 && (
                        <p className="px-2 py-1 text-xs text-slate-400 dark:text-slate-500">
                          No properties
                        </p>
                      )}
                      {cls.properties.map((prop, propIdx) => (
                        <div
                          key={prop.id ?? prop.localId ?? `${classId}-prop-${propIdx}`}
                          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 group/prop"
                        >
                          <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">
                            {prop.name}
                          </span>
                          {canEdit && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/prop:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => onReorderClassProperty(classId, propIdx, 'up')}
                                disabled={propIdx === 0}
                                className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label="Move property up"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onReorderClassProperty(classId, propIdx, 'down')}
                                disabled={propIdx === cls.properties.length - 1}
                                className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label="Move property down"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingProp({ classId, propIndex: propIdx, prop })
                                }
                                className="p-0.5 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                aria-label={`Edit property ${prop.name}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onRemoveClassProperty(classId, prop.name, propIdx)}
                                className="p-0.5 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                                aria-label={`Remove property ${prop.name}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setAddPropClassId(classId)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded w-full transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Add property
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
              </ul>
            )}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="min-w-[160px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 z-[10010]"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <ContextMenu.Item
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 outline-none cursor-default"
              onSelect={() => canEdit && setAddClassOpen(true)}
              disabled={!canEdit}
            >
              <Plus className="h-4 w-4" />
              New class
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {/* Add class button */}
      <div className="p-2 border-t border-slate-200 dark:border-slate-700 shrink-0">
        <button
          type="button"
          onClick={() => setAddClassOpen(true)}
          disabled={!canEdit}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          Add class
        </button>
      </div>

      {/* Dialogs */}
      <ClassDialog
        open={addClassOpen}
        mode="add"
        existingClassNames={classes.map((c) => c.name)}
        onSave={handleAddClass}
        onClose={() => setAddClassOpen(false)}
      />
      <ClassDialog
        open={editingClass !== null}
        mode="edit"
        initial={editClassInitial}
        existingClassNames={classes.map((c) => c.name)}
        onSave={handleUpdateClass}
        onClose={() => setEditingClass(null)}
      />
      <ClassPropertyDialog
        open={addPropClassId !== null}
        mode="add"
        availableProperties={availableProperties}
        availableClassNamesForRef={availableClassNamesForRefAdd}
        onSave={handleAddProp}
        onClose={() => setAddPropClassId(null)}
      />
      <ClassPropertyDialog
        open={editingProp !== null}
        mode="edit"
        availableProperties={availableProperties}
        availableClassNamesForRef={availableClassNamesForRefEdit}
        initial={
          editingProp
            ? (() => {
                const refStr = (editingProp.prop.data ?? editingProp.prop.property_data)
                  ?.$ref as string | undefined;
                const parsed =
                  refStr != null ? parseClassNameFromRef(refStr) : undefined;
                const referenceClass =
                  parsed &&
                  availableClassNamesForRefEdit.some(
                    (c) => c.toLowerCase() === parsed.toLowerCase()
                  )
                    ? availableClassNamesForRefEdit.find(
                        (c) => c.toLowerCase() === parsed.toLowerCase()
                      )
                    : undefined;
                return {
                  name: editingProp.prop.name,
                  description: editingProp.prop.description ?? '',
                  propertyId: editingProp.prop.property_id,
                  referenceClass,
                  refType: getRefTypeFromData(
                    (editingProp.prop.data ?? editingProp.prop.property_data) as
                      | Record<string, unknown>
                      | undefined
                  ),
                };
              })()
            : undefined
        }
        onSave={handleUpdateProp}
        onClose={() => setEditingProp(null)}
      />
    </div>
  );
}

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export default function DesignCanvasSidebar() {
  const { data: session } = useSession();
  const options = getRestClientOptions(
    (session as { accessToken?: string } | null) ?? null
  );
  const workspace = useWorkspaceOptional();
  const studio = useStudioOptional();
  const editClassRequest = useEditClassRequestOptional();
  const { confirm } = useDialog();
  const [classNames, setClassNames] = useState<string[]>([]);
  const [propertyNames, setPropertyNames] = useState<string[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(false);

  const versionId = workspace?.version?.id ?? null;
  const tenantId = workspace?.tenant?.id ?? null;
  const projectId = workspace?.project?.id ?? null;

  const loadClasses = useCallback(async () => {
    if (!versionId) {
      setClassNames([]);
      setLoadingClasses(false);
      return;
    }
    setLoadingClasses(true);
    try {
      const classes = await listClassesWithPropertiesAndTags(versionId, options);
      setClassNames(classes.map((c) => c.name).sort((a, b) => a.localeCompare(b)));
    } catch {
      setClassNames([]);
    } finally {
      setLoadingClasses(false);
    }
  }, [versionId, options.jwt, options.apiKey]);

  const loadProperties = useCallback(async () => {
    if (!tenantId || !projectId) {
      setPropertyNames([]);
      setLoadingProperties(false);
      return;
    }
    setLoadingProperties(true);
    try {
      const list = await listProperties(tenantId, projectId, options);
      setPropertyNames(list.map((p) => p.name).sort((a, b) => a.localeCompare(b)));
    } catch {
      setPropertyNames([]);
    } finally {
      setLoadingProperties(false);
    }
  }, [tenantId, projectId, options.jwt, options.apiKey]);

  useEffect(() => {
    if (studio?.state) return;
    loadClasses();
  }, [loadClasses, studio?.state]);

  useEffect(() => {
    if (studio?.state) return;
    loadProperties();
  }, [loadProperties, studio?.state]);

  const noVersion = !versionId;
  const noProject = !tenantId || !projectId;
  const isReadOnly =
    studio?.state?.readOnly === true || workspace?.version?.published === true;

  const useStudioData = Boolean(studio?.state);
  const classesLoading = useStudioData ? (studio?.loading ?? false) : loadingClasses;
  const propertiesLoading = useStudioData ? false : loadingProperties;

  const studioClasses = useMemo(() => studio?.state?.classes ?? [], [studio?.state]);
  const studioProperties = useMemo(() => studio?.state?.properties ?? [], [studio?.state]);
  const propertiesItems = useStudioData
    ? studioProperties.map((p) => p.name).sort((a, b) => a.localeCompare(b))
    : propertyNames;

  // ─── Class mutation handlers ──────────────────────────────────────────────

  const handleAddClass = useCallback(
    (data: ClassFormData) => {
      studio?.applyChange((draft) => {
        const count = draft.classes.length;
        const position = data.canvas_metadata?.position ?? {
          x: 80 * (count % 6),
          y: 100 * Math.floor(count / 6),
        };
        draft.classes.push({
          localId: generateLocalId(),
          name: data.name,
          description: data.description,
          schema: data.schema,
          properties: [],
          canvas_metadata: { position },
        });
      });
    },
    [studio]
  );

  const handleUpdateClass = useCallback(
    (classId: string, data: ClassFormData) => {
      studio?.applyChange((draft) => {
        const idx = draft.classes.findIndex((c) => getStableClassId(c) === classId);
        if (idx >= 0) {
          draft.classes[idx].name = data.name;
          draft.classes[idx].description = data.description;
          if (data.schema !== undefined) draft.classes[idx].schema = data.schema;
        }
      });
    },
    [studio]
  );

  const handleDeleteClass = useCallback(
    async (cls: StudioClass) => {
      const ok = await confirm({
        title: 'Delete Class',
        message: `Delete class "${cls.name}"? This action will be reflected when you next save.`,
        variant: 'danger',
        confirmLabel: 'Delete',
      });
      if (!ok) return;
      studio?.applyChange((draft) => {
        const idx = draft.classes.findIndex(
          (c) => getStableClassId(c) === getStableClassId(cls)
        );
        if (idx >= 0) draft.classes.splice(idx, 1);
      });
    },
    [studio, confirm]
  );

  const handleReorderClass = useCallback(
    (classId: string, direction: 'up' | 'down') => {
      studio?.applyChange((draft) => {
        const idx = draft.classes.findIndex((c) => getStableClassId(c) === classId);
        if (direction === 'up' && idx > 0) {
          [draft.classes[idx - 1], draft.classes[idx]] = [
            draft.classes[idx],
            draft.classes[idx - 1],
          ];
        } else if (direction === 'down' && idx < draft.classes.length - 1) {
          [draft.classes[idx], draft.classes[idx + 1]] = [
            draft.classes[idx + 1],
            draft.classes[idx],
          ];
        }
      });
    },
    [studio]
  );

  // ─── Class-property mutation handlers ────────────────────────────────────

  const handleAddClassProperty = useCallback(
    (classId: string, data: ClassPropertySaveData) => {
      const linked = data.propertyId
        ? studioProperties.find((p) => p.id === data.propertyId)
        : null;
      studio?.applyChange((draft) => {
        const idx = draft.classes.findIndex((c) => getStableClassId(c) === classId);
        if (idx >= 0) {
          const propData = data.referenceClass
            ? {
                $ref: refForClassName(data.referenceClass),
                refType: data.refType ?? 'direct',
              }
            : undefined;
          draft.classes[idx].properties.push({
            localId: generateLocalId(),
            name: data.name,
            description: data.description,
            property_id: data.propertyId,
            property_name: linked?.name,
            property_data: linked?.data,
            data: propData,
          });
        }
      });
    },
    [studio, studioProperties]
  );

  const handleUpdateClassProperty = useCallback(
    (classId: string, propIndex: number, data: ClassPropertySaveData) => {
      studio?.applyChange((draft) => {
        const classIdx = draft.classes.findIndex((c) => getStableClassId(c) === classId);
        if (classIdx < 0 || !draft.classes[classIdx].properties[propIndex]) return;
        const prop = draft.classes[classIdx].properties[propIndex];
        prop.name = data.name;
        prop.description = data.description;
        const existingData = prop.data as Record<string, unknown> | undefined;
        if (data.referenceClass?.trim()) {
          prop.data = {
            ...(existingData ?? {}),
            $ref: refForClassName(data.referenceClass),
            refType: data.refType ?? 'direct',
          };
        } else {
          const next: Record<string, unknown> = { ...(existingData ?? {}) };
          delete next.$ref;
          delete next.refType;
          prop.data = Object.keys(next).length > 0 ? next : undefined;
        }
      });
    },
    [studio]
  );

  const handleRemoveClassProperty = useCallback(
    async (classId: string, propName: string, propIndex: number) => {
      const ok = await confirm({
        title: 'Remove Property',
        message: `Remove property "${propName}" from this class?`,
        variant: 'danger',
        confirmLabel: 'Remove',
      });
      if (!ok) return;
      studio?.applyChange((draft) => {
        const classIdx = draft.classes.findIndex((c) => getStableClassId(c) === classId);
        if (classIdx >= 0) {
          draft.classes[classIdx].properties.splice(propIndex, 1);
        }
      });
    },
    [studio, confirm]
  );

  const handleReorderClassProperty = useCallback(
    (classId: string, propIndex: number, direction: 'up' | 'down') => {
      studio?.applyChange((draft) => {
        const classIdx = draft.classes.findIndex((c) => getStableClassId(c) === classId);
        if (classIdx < 0) return;
        const props = draft.classes[classIdx].properties;
        if (direction === 'up' && propIndex > 0) {
          [props[propIndex - 1], props[propIndex]] = [props[propIndex], props[propIndex - 1]];
        } else if (direction === 'down' && propIndex < props.length - 1) {
          [props[propIndex], props[propIndex + 1]] = [props[propIndex + 1], props[propIndex]];
        }
      });
    },
    [studio]
  );

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col shrink-0">
      {/* Error banner — shown when the studio failed to load data */}
      {studio?.error && (
        <div
          className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs"
          role="alert"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{studio.error}</span>
        </div>
      )}
      <Tabs.Root defaultValue="classes" className="flex flex-col flex-1 min-h-0">
        <Tabs.List className="flex shrink-0 border-b border-slate-200 dark:border-slate-700">
          <Tabs.Trigger
            value="classes"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-400 border-b-2 border-transparent hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <LayoutGrid className="h-4 w-4" />
            Classes
          </Tabs.Trigger>
          <Tabs.Trigger
            value="properties"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-400 border-b-2 border-transparent hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <Tag className="h-4 w-4" />
            Properties
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="classes" className="flex-1 min-h-0 mt-0">
          {noVersion ? (
            <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
              Select a tenant, project, and version to load classes.
            </p>
          ) : useStudioData ? (
            <ClassListPanel
              classes={studioClasses}
              availableProperties={studioProperties}
              canEdit={!isReadOnly}
              loading={classesLoading}
              onAddClass={handleAddClass}
              onUpdateClass={handleUpdateClass}
              onDeleteClass={handleDeleteClass}
              onReorderClass={handleReorderClass}
              onAddClassProperty={handleAddClassProperty}
              onUpdateClassProperty={handleUpdateClassProperty}
              onRemoveClassProperty={handleRemoveClassProperty}
              onReorderClassProperty={handleReorderClassProperty}
              editClassIdRequest={editClassRequest?.requestEditClassId ?? null}
              onConsumeEditClassRequest={editClassRequest?.clearRequest}
            />
          ) : (
            <SearchableList
              items={classNames}
              emptyMessage="No classes found."
              noResultsMessage="No classes match your search."
              loading={classesLoading}
            />
          )}
        </Tabs.Content>

        <Tabs.Content value="properties" className="flex-1 min-h-0 mt-0">
          {noProject ? (
            <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
              Select a tenant and project to load properties.
            </p>
          ) : (
            <SearchableList
              items={propertiesItems}
              emptyMessage="No properties found."
              noResultsMessage="No properties match your search."
              loading={propertiesLoading}
            />
          )}
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
