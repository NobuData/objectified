'use client';

/**
 * Custom react-flow node for a group: resizable container with label and optional style.
 * Used to visually group class nodes. No handles; children use parentId and extent: 'parent'.
 * Reference: GitHub #83 — Add ability to create groups in the react-flow canvas.
 */

import { memo, useCallback, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { CSSProperties } from 'react';
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
    resizeConstraints,
    resizeHandleVisibility = 'always',
    canvasNavShellTabIndex = -1,
    onCanvasNavShellFocus,
    onNavigateCanvasNav,
    onCanvasNavShellEnter,
  } = data;

  const [resizeHover, setResizeHover] = useState(false);
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
    containerStyle.borderStyle = 'solid';
    containerStyle.borderColor = String(style.border);
  }
  containerStyle.minWidth = rc.minWidth;
  containerStyle.minHeight = rc.minHeight;
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
        aria-label={`Group ${label?.trim() ? label : 'Untitled'}`}
        onMouseEnter={() => setResizeHover(true)}
        onMouseLeave={() => setResizeHover(false)}
        onFocus={() => onCanvasNavShellFocus?.()}
        onKeyDown={handleNavShellKeyDown}
        className={[
          'w-full h-full rounded-lg border-2 shadow-sm outline-none',
          'bg-slate-50/95 dark:bg-slate-800/95 border-slate-300 dark:border-slate-600',
          selected && 'ring-2 ring-indigo-500 dark:ring-indigo-400 border-indigo-500 dark:border-indigo-400',
          'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
        ].join(' ')}
        style={containerStyle}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onEdit?.(id)}
          className="w-full px-3 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200 truncate rounded-t-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
          title="Rename, color, style"
          aria-label={`Edit group ${label?.trim() ? label : 'Untitled'} (rename, color, style)`}
        >
          {label || 'Group'}
        </button>
      </div>
    </>
  );
}

const GroupNode = memo(GroupNodeComponent);
export default GroupNode;
