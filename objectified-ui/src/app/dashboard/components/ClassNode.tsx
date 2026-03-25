'use client';

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { ComponentType, CSSProperties } from 'react';
import {
  Handle,
  Position,
  NodeResizer,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  ChevronDown,
  ChevronRight,
  Box,
  Circle,
  Square,
  Hexagon,
  Tag as TagIcon,
  CircleAlert,
  CircleDashed,
  Sparkles,
  PencilLine,
  Info,
} from 'lucide-react';
import type { ClassNodeData } from '@lib/studio/types';
import type {
  ClassNodeConfig,
  ClassNodeTheme,
} from '@lib/studio/canvasClassNodeConfig';
import type {
  NodePropertyDisplayMode,
  CanvasResizeHandleVisibility,
} from '@lib/studio/canvasSettings';

/** Extended data passed from DesignCanvas: config, resize, callback (GitHub #80, #82). */
export interface ClassNodeDataExtended extends ClassNodeData {
  classNodeConfig?: ClassNodeConfig;
  /**
   * Display-only theme (tag/tenant auto + manual merge). Not persisted; avoids writing auto colors to localStorage.
   * Reference: GitHub #230.
   */
  resolvedNodeTheme?: ClassNodeTheme;
  onConfigChange?: (classId: string, config: ClassNodeConfig) => void;
  /** When true, node can be resized via NodeResizer (GitHub #82). */
  allowResize?: boolean;
  /** Min/max dimensions from canvas settings (GitHub #235). */
  resizeConstraints?: {
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
  };
  /** When `hover`, show resize handles only while pointer is over the node (GitHub #235). */
  resizeHandleVisibility?: CanvasResizeHandleVisibility;
  /** Property list density (canvas setting). GitHub #230. */
  propertyDisplayMode?: NodePropertyDisplayMode;
  /** @deprecated Use propertyDisplayMode === 'hidden' */
  simplifiedView?: boolean;
  /** Increase node contrast for accessibility. */
  highContrast?: boolean;
  /** GitHub #231 — header shows an input instead of the title. */
  inlineRenameActive?: boolean;
  onInlineRenameCommit?: (classId: string, name: string) => void;
  onInlineRenameCancel?: () => void;
  /** GitHub #236 — roving tabindex and keyboard navigation on the node shell. */
  canvasNavShellTabIndex?: 0 | -1;
  onCanvasNavShellFocus?: () => void;
  onNavigateCanvasNav?: (delta: 1 | -1) => void;
  onCanvasNavShellEnter?: () => void;
}

/** Node type for react-flow; data satisfies Record<string, unknown>. */
export type ClassNodeType = Node<ClassNodeDataExtended & Record<string, unknown>, 'class'>;

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  box: Box,
  circle: Circle,
  square: Square,
  hexagon: Hexagon,
};

/**
 * Custom react-flow node for a class: header with class name, body with property members.
 * Supports expand/collapse, theme (backgroundColor, border, icon), and double-click to open class form.
 * Configuration is stored in localStorage. Resize when allowResize and selected (GitHub #82).
 * Reference: GitHub #79, #80, #231.
 */
function ClassNodeComponent({
  id,
  data,
  selected,
}: NodeProps<ClassNodeType>) {
  const {
    name,
    properties,
    classNodeConfig,
    resolvedNodeTheme,
    onConfigChange,
    allowResize,
    resizeConstraints,
    resizeHandleVisibility = 'always',
    propertyDisplayMode = 'full',
    simplifiedView,
    highContrast,
    tags = [],
    tagDefinitions = {},
    description,
    refCount = 0,
    nodeStatus,
    inlineRenameActive = false,
    onInlineRenameCommit,
    onInlineRenameCancel,
    canvasNavShellTabIndex = -1,
    onCanvasNavShellFocus,
    onNavigateCanvasNav,
    onCanvasNavShellEnter,
  } = data as ClassNodeDataExtended;

  const [renameDraft, setRenameDraft] = useState(name ?? '');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameCommittedRef = useRef(false);

  useEffect(() => {
    if (!inlineRenameActive) return;
    renameCommittedRef.current = false;
    setRenameDraft(name ?? '');
    const t = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(t);
  }, [inlineRenameActive, name]);

  const submitInlineRename = useCallback(() => {
    if (!inlineRenameActive || !onInlineRenameCommit || renameCommittedRef.current) return;
    renameCommittedRef.current = true;
    onInlineRenameCommit(id, renameDraft);
  }, [inlineRenameActive, onInlineRenameCommit, id, renameDraft]);

  const hasProperties = properties.length > 0;
  const defaultTagColor = '#94a3b8';
  const expanded = classNodeConfig?.propertiesExpanded !== false;
  const theme = resolvedNodeTheme ?? classNodeConfig?.theme;
  const displayMode: NodePropertyDisplayMode =
    simplifiedView === true ? 'hidden' : propertyDisplayMode;
  const COMPACT_MAX = 5;
  /** GitHub #231 — cap full list height until user expands. */
  const FULL_LIST_INITIAL_MAX = 12;
  const [showAllProperties, setShowAllProperties] = useState(false);
  const [resizeHover, setResizeHover] = useState(false);
  useEffect(() => {
    setShowAllProperties(false);
  }, [id]);
  const IconComponent = theme?.icon
    ? ICON_MAP[theme.icon.toLowerCase()]
    : null;

  const toggleExpanded = useCallback(() => {
    if (!onConfigChange) return;
    onConfigChange(id, {
      ...classNodeConfig,
      propertiesExpanded: !expanded,
    });
  }, [id, classNodeConfig, expanded, onConfigChange]);

  const rc = resizeConstraints ?? {
    minWidth: 180,
    maxWidth: 400,
    minHeight: 48,
    maxHeight: 400,
  };

  const containerStyle: CSSProperties = {};
  if (theme?.backgroundColor) containerStyle.backgroundColor = theme.backgroundColor;
  if (theme?.border) {
    containerStyle.borderWidth = '2px';
    containerStyle.borderStyle = theme.borderStyle ?? 'solid';
    containerStyle.borderColor = theme.border;
  }
  containerStyle.minWidth = rc.minWidth;
  containerStyle.minHeight = rc.minHeight;

  const headerStyle: CSSProperties = {};
  if (theme?.backgroundColor) headerStyle.backgroundColor = theme.backgroundColor;

  const showResizeChrome =
    allowResize === true &&
    selected &&
    (resizeHandleVisibility === 'always' || resizeHover);
  const handleNavShellKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        onNavigateCanvasNav?.(1);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        onNavigateCanvasNav?.(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onCanvasNavShellEnter?.();
      }
    },
    [onNavigateCanvasNav, onCanvasNavShellEnter]
  );

  const statusBadges = [
    nodeStatus?.isDeprecated
      ? { key: 'deprecated', label: 'Deprecated', icon: CircleDashed }
      : null,
    nodeStatus?.isNew ? { key: 'new', label: 'New', icon: Sparkles } : null,
    nodeStatus?.isModified
      ? { key: 'modified', label: 'Modified', icon: PencilLine }
      : null,
    nodeStatus?.hasValidationErrors
      ? { key: 'errors', label: 'Errors', icon: CircleAlert }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }>;

  return (
    <>
      {showResizeChrome && (
        <NodeResizer
          minWidth={rc.minWidth}
          minHeight={rc.minHeight}
          maxWidth={rc.maxWidth}
          maxHeight={rc.maxHeight}
          isVisible={true}
          lineClassName="!border-indigo-500 dark:!border-indigo-400"
          handleClassName="!w-2 !h-2 !border-2 !border-indigo-500 dark:!border-indigo-400 !bg-white dark:!bg-slate-800"
        />
      )}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !border-2 !border-slate-300 dark:!border-slate-600 !bg-white dark:!bg-slate-800"
      />
      <div
        data-canvas-nav-node={id}
        tabIndex={canvasNavShellTabIndex}
        role="group"
        aria-label={`Class ${name?.trim() ? name : 'Unnamed class'}`}
        onMouseEnter={() => setResizeHover(true)}
        onMouseLeave={() => setResizeHover(false)}
        onFocus={(e) => {
          setResizeHover(true);
          onCanvasNavShellFocus?.();
        }}
        onBlur={(e) => {
          const next = e.relatedTarget as globalThis.Node | null;
          if (!next || !e.currentTarget.contains(next)) {
            setResizeHover(false);
          }
        }}
        onKeyDown={handleNavShellKeyDown}
        className={[
          'rounded-lg border-2 shadow-md outline-none',
          allowResize ? 'w-full h-full overflow-auto' : 'max-w-[280px] overflow-hidden',
          !theme?.backgroundColor && 'bg-white dark:bg-slate-900',
          !theme?.border &&
            'border-slate-200 dark:border-slate-700',
          highContrast && 'border-slate-900 dark:border-slate-100 shadow-lg',
          selected
            ? 'ring-2 ring-indigo-500 dark:ring-indigo-400 border-indigo-500 dark:border-indigo-400'
            : 'hover:border-slate-300 dark:hover:border-slate-600',
          'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
        ].join(' ')}
        style={containerStyle}
      >
        <div
          className={[
            'px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5',
            !theme?.backgroundColor && 'bg-slate-100 dark:bg-slate-800/80',
          ].join(' ')}
          style={headerStyle}
        >
          {hasProperties ? (
            <button
              type="button"
              onClick={toggleExpanded}
              className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 -m-0.5 rounded"
              aria-label={expanded ? 'Collapse properties' : 'Expand properties'}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
          {IconComponent && (
            <IconComponent className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
          )}
          {inlineRenameActive && onInlineRenameCommit && onInlineRenameCancel ? (
            <input
              ref={renameInputRef}
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  renameCommittedRef.current = true;
                  onInlineRenameCancel();
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitInlineRename();
                }
              }}
              onBlur={(_e: FocusEvent<HTMLInputElement>) => submitInlineRename()}
              className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex-1 min-w-0 rounded border border-indigo-400 dark:border-indigo-500 bg-white dark:bg-slate-900 px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Class name"
            />
          ) : (
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate block flex-1 min-w-0">
              {name || 'Unnamed class'}
            </span>
          )}
          <Tooltip.Provider delayDuration={150}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  className="shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Show class summary"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  sideOffset={8}
                  className="z-[10010] max-w-[280px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 shadow-lg"
                >
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {name || 'Unnamed class'}
                  </p>
                  <p className="mt-1">
                    Properties: {properties.length} | Refs: {refCount}
                  </p>
                  {description?.trim() ? (
                    <p className="mt-1 text-slate-600 dark:text-slate-300 line-clamp-3">
                      {description.trim()}
                    </p>
                  ) : (
                    <p className="mt-1 text-slate-500 dark:text-slate-400 italic">
                      No description
                    </p>
                  )}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
        {statusBadges.length > 0 && (
          <div className="px-3 py-1 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-1">
            {statusBadges.map((badge) => {
              const BadgeIcon = badge.icon;
              return (
                <span
                  key={badge.key}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-200"
                >
                  <BadgeIcon className="h-3 w-3" />
                  {badge.label}
                </span>
              );
            })}
          </div>
        )}
        {tags.length > 0 && (
          <div className="px-3 py-1 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-1">
            {tags.map((tagName) => (
              <span
                key={tagName}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white border border-white/20"
                style={{
                  backgroundColor:
                    tagDefinitions[tagName]?.color ?? defaultTagColor,
                }}
              >
                <TagIcon className="h-3 w-3" />
                {tagName}
              </span>
            ))}
          </div>
        )}
        {displayMode !== 'hidden' && expanded && (
          <ScrollArea.Root
            className={displayMode === 'compact' ? 'max-h-[120px]' : 'max-h-[240px]'}
          >
            <ScrollArea.Viewport className="w-full">
              <div className="px-3 py-2">
                {hasProperties ? (
                  <ul
                    className={[
                      'text-left',
                      displayMode === 'compact'
                        ? 'grid grid-cols-1 gap-0.5'
                        : 'space-y-1',
                    ].join(' ')}
                  >
                    {(displayMode === 'compact'
                      ? properties.slice(0, COMPACT_MAX)
                      : showAllProperties ||
                          properties.length <= FULL_LIST_INITIAL_MAX
                        ? properties
                        : properties.slice(0, FULL_LIST_INITIAL_MAX)
                    ).map((prop, idx) => (
                      <li
                        key={prop.id ?? prop.localId ?? idx}
                        className={[
                          'text-slate-600 dark:text-slate-400 truncate font-mono',
                          displayMode === 'compact'
                            ? 'text-[10px] leading-tight'
                            : 'text-xs',
                        ].join(' ')}
                      >
                        {prop.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                    No properties
                  </p>
                )}
                {displayMode === 'compact' &&
                  hasProperties &&
                  properties.length > COMPACT_MAX && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
                      +{properties.length - COMPACT_MAX} more
                    </p>
                  )}
                {displayMode === 'full' &&
                  hasProperties &&
                  properties.length > FULL_LIST_INITIAL_MAX &&
                  !showAllProperties && (
                    <button
                      type="button"
                      onClick={() => setShowAllProperties(true)}
                      className="mt-2 w-full text-left text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Show all {properties.length} properties
                    </button>
                  )}
              </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar
              className="flex w-1.5 touch-none select-none p-0.5 transition-colors"
              orientation="vertical"
            >
              <ScrollArea.Thumb className="relative flex-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !border-2 !border-slate-300 dark:!border-slate-600 !bg-white dark:!bg-slate-800"
      />
    </>
  );
}

const ClassNode = memo(ClassNodeComponent);
export default ClassNode;
