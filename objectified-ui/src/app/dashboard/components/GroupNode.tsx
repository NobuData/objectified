'use client';

/**
 * Custom react-flow node for a group: resizable container with label and optional style.
 * Used to visually group class nodes. No handles; children use parentId and extent: 'parent'.
 * Reference: GitHub #83 — Add ability to create groups in the react-flow canvas.
 */

import { memo } from 'react';
import type { CSSProperties } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import type { GroupCanvasMetadata } from '@lib/studio/canvasGroupStorage';

export interface GroupNodeData {
  label: string;
  /** Position, dimensions, style from group metadata (stored in state.groups[].metadata). */
  groupMetadata?: GroupCanvasMetadata;
  /** When true, group can be resized when selected. */
  allowResize?: boolean;
  /** Called when user requests edit (rename, color, style). */
  onEdit?: (groupId: string) => void;
}

export type GroupNodeType = Node<GroupNodeData & Record<string, unknown>, 'group'>;

function GroupNodeComponent({ id, data, selected }: NodeProps<GroupNodeType>) {
  const {
    label,
    groupMetadata,
    allowResize,
    onEdit,
  } = data;

  const style = groupMetadata?.style ?? {};
  const containerStyle: CSSProperties = {};
  if (style.backgroundColor) containerStyle.backgroundColor = String(style.backgroundColor);
  if (style.border) {
    containerStyle.borderWidth = '2px';
    containerStyle.borderStyle = 'solid';
    containerStyle.borderColor = String(style.border);
  }

  const showResizer = allowResize === true && selected;

  return (
    <>
      {showResizer && (
        <NodeResizer
          minWidth={120}
          minHeight={80}
          maxWidth={800}
          maxHeight={600}
          isVisible={true}
          lineClassName="!border-slate-400 dark:!border-slate-500"
          handleClassName="!w-2 !h-2 !border-2 !border-slate-400 dark:!border-slate-500 !bg-white dark:!bg-slate-800"
        />
      )}
      <div
        data-nodetype="group"
        className={[
          'w-full h-full rounded-lg border-2 shadow-sm min-w-[120px] min-h-[80px]',
          'bg-slate-50/95 dark:bg-slate-800/95 border-slate-300 dark:border-slate-600',
          selected && 'ring-2 ring-indigo-500 dark:ring-indigo-400 border-indigo-500 dark:border-indigo-400',
        ].join(' ')}
        style={containerStyle}
      >
        <button
          type="button"
          onClick={() => onEdit?.(id)}
          className="w-full px-3 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200 truncate rounded-t-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
          title="Rename, color, style"
        >
          {label || 'Group'}
        </button>
      </div>
    </>
  );
}

const GroupNode = memo(GroupNodeComponent);
export default GroupNode;
