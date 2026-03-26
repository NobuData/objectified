'use client';

/**
 * Custom react-flow node for a group: resizable container with label and optional style.
 * Used to visually group class nodes. No handles; children use parentId and extent: 'parent'.
 * Reference: GitHub #83 — Add ability to create groups in the react-flow canvas.
 */

import { memo, useCallback, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { CSSProperties } from 'react';
import { Box, ChevronDown, ChevronRight, Circle, Hexagon, Square } from 'lucide-react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import type { GroupCanvasMetadata } from '@lib/studio/canvasGroupStorage';
import type { CanvasResizeHandleVisibility } from '@lib/studio/canvasSettings';

export interface GroupNodeData {
  label: string;
  /** Position, dimensions, style from group metadata (stored in state.groups[].metadata). */
  groupMetadata?: GroupCanvasMetadata;
  /** When true, group can be resized when selected. */
  allowResize?: boolean;
  resizeConstraints?: {
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
  };
  resizeHandleVisibility?: CanvasResizeHandleVisibility;
  /** Called when user requests edit (rename, color, style). */
  onEdit?: (groupId: string) => void;
  /** Toggle collapsed header strip (GitHub #238). */
  onToggleCollapse?: (groupId: string) => void;
  /** GitHub #236 — roving tabindex and keyboard navigation on the group shell. */
  canvasNavShellTabIndex?: 0 | -1;
  onCanvasNavShellFocus?: () => void;
  onNavigateCanvasNav?: (delta: 1 | -1) => void;
  onCanvasNavShellEnter?: () => void;
}

export type GroupNodeType = Node<GroupNodeData & Record<string, unknown>, 'group'>;

function GroupNodeComponent({ id, data, selected }: NodeProps<GroupNodeType>) {
  const {
    label,
    groupMetadata,
    allowResize,
    onEdit,
    onToggleCollapse,
    resizeConstraints,
    resizeHandleVisibility = 'always',
    canvasNavShellTabIndex = -1,
    onCanvasNavShellFocus,
    onNavigateCanvasNav,
    onCanvasNavShellEnter,
  } = data;

  const [resizeHover, setResizeHover] = useState(false);
  const collapsed = groupMetadata?.collapsed === true;
  const style = groupMetadata?.style ?? {};
  const rc = resizeConstraints ?? {
    minWidth: 120,
    maxWidth: 800,
    minHeight: 80,
    maxHeight: 600,
  };
  const containerStyle: CSSProperties = {};
  if (style.backgroundColor) containerStyle.backgroundColor = String(style.backgroundColor);
  if (style.border) {
    containerStyle.borderWidth = '2px';
    const bs = style.borderStyle;
    containerStyle.borderStyle =
      bs === 'dashed' || bs === 'dotted' ? String(bs) : 'solid';
    containerStyle.borderColor = String(style.border);
  }
  const headerIcon = String(style.headerIcon ?? '');
  const HeaderGlyph =
    headerIcon === 'box'
      ? Box
      : headerIcon === 'circle'
        ? Circle
        : headerIcon === 'square'
          ? Square
          : headerIcon === 'hexagon'
            ? Hexagon
            : null;
  const detail = [
    groupMetadata?.description?.trim(),
    groupMetadata?.owner ? `Owner: ${groupMetadata.owner}` : '',
    groupMetadata?.governanceTag ? `Tag: ${groupMetadata.governanceTag}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  containerStyle.minWidth = rc.minWidth;
  if (!collapsed) {
    containerStyle.minHeight = rc.minHeight;
  } else {
    containerStyle.overflow = 'hidden';
  }
  const showResizeChrome =
    allowResize === true &&
    !collapsed &&
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

  return (
    <>
      {showResizeChrome && (
        <NodeResizer
          minWidth={rc.minWidth}
          minHeight={rc.minHeight}
          maxWidth={rc.maxWidth}
          maxHeight={rc.maxHeight}
          isVisible={true}
          lineClassName="!border-slate-400 dark:!border-slate-500"
          handleClassName="!w-2 !h-2 !border-2 !border-slate-400 dark:!border-slate-500 !bg-white dark:!bg-slate-800"
        />
      )}
      <div
        data-nodetype="group"
        data-canvas-nav-node={id}
        tabIndex={canvasNavShellTabIndex}
        role="group"
        aria-label={`Group ${label?.trim() ? label : 'Untitled'}${
          detail ? `. ${detail}` : ''
        }`}
        title={detail || undefined}
        onMouseEnter={() => setResizeHover(true)}
        onMouseLeave={() => setResizeHover(false)}
        onFocus={() => onCanvasNavShellFocus?.()}
        onKeyDown={handleNavShellKeyDown}
        className={[
          'w-full h-full rounded-lg border-2 shadow-sm outline-none flex flex-col',
          'bg-slate-50/95 dark:bg-slate-800/95 border-slate-300 dark:border-slate-600',
          selected && 'ring-2 ring-indigo-500 dark:ring-indigo-400 border-indigo-500 dark:border-indigo-400',
          'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
        ].join(' ')}
        style={containerStyle}
      >
        <div className="flex items-stretch shrink-0 rounded-t-md min-h-0">
          {onToggleCollapse ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(id);
              }}
              className="px-2 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors rounded-tl-md border-r border-slate-200/80 dark:border-slate-600/80"
              aria-expanded={!collapsed}
              aria-label={
                collapsed
                  ? `Expand group ${label?.trim() ? label : 'Untitled'}`
                  : `Collapse group ${label?.trim() ? label : 'Untitled'}`
              }
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
              )}
            </button>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onEdit?.(id)}
            className="flex-1 min-w-0 px-3 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200 truncate hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors inline-flex items-center gap-2 rounded-tr-md"
            title="Rename, color, style"
            aria-label={`Edit group ${label?.trim() ? label : 'Untitled'} (rename, color, style)`}
          >
            {HeaderGlyph ? (
              <HeaderGlyph className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            ) : null}
            <span className="truncate">{label || 'Group'}</span>
          </button>
        </div>
      </div>
    </>
  );
}

const GroupNode = memo(GroupNodeComponent);
export default GroupNode;
