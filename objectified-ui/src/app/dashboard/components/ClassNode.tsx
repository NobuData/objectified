'use client';

import { memo, useCallback } from 'react';
import type { ComponentType, CSSProperties } from 'react';
import {
  Handle,
  Position,
  NodeResizer,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { ChevronDown, ChevronRight, Box, Circle, Square, Hexagon } from 'lucide-react';
import type { ClassNodeData } from '@lib/studio/types';
import type { ClassNodeConfig } from '@lib/studio/canvasClassNodeConfig';

/** Node type for react-flow; data satisfies Record<string, unknown>. */
export type ClassNodeType = Node<ClassNodeData & Record<string, unknown>, 'class'>;

/** Extended data passed from DesignCanvas: config, resize, callback (GitHub #80, #82). */
export interface ClassNodeDataExtended extends ClassNodeData {
  classNodeConfig?: ClassNodeConfig;
  onConfigChange?: (classId: string, config: ClassNodeConfig) => void;
  /** When true, node can be resized via NodeResizer (GitHub #82). */
  allowResize?: boolean;
}

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
 * Reference: GitHub #79, #80.
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
    onConfigChange,
    allowResize,
    tags = [],
    tagDefinitions = {},
  } = data as ClassNodeDataExtended;

  const hasProperties = properties.length > 0;
  const defaultTagColor = '#94a3b8';
  const expanded = classNodeConfig?.propertiesExpanded !== false;
  const theme = classNodeConfig?.theme;
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

  const containerStyle: CSSProperties = {};
  if (theme?.backgroundColor) containerStyle.backgroundColor = theme.backgroundColor;
  if (theme?.border) {
    containerStyle.borderWidth = '2px';
    containerStyle.borderStyle = 'solid';
    containerStyle.borderColor = theme.border;
  }

  const headerStyle: CSSProperties = {};
  if (theme?.backgroundColor) headerStyle.backgroundColor = theme.backgroundColor;

  const showResizer = allowResize === true && selected;

  return (
    <>
      {showResizer && (
        <NodeResizer
          minWidth={180}
          minHeight={48}
          maxWidth={400}
          maxHeight={400}
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
        className={[
          'rounded-lg border-2 shadow-md min-w-[180px]',
          allowResize ? 'w-full h-full overflow-auto' : 'max-w-[280px] overflow-hidden',
          !theme?.backgroundColor && 'bg-white dark:bg-slate-900',
          !theme?.border &&
            'border-slate-200 dark:border-slate-700',
          selected
            ? 'ring-2 ring-indigo-500 dark:ring-indigo-400 border-indigo-500 dark:border-indigo-400'
            : 'hover:border-slate-300 dark:hover:border-slate-600',
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
          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate block flex-1 min-w-0">
            {name || 'Unnamed class'}
          </span>
        </div>
        {tags.length > 0 && (
          <div className="px-3 py-1 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-1">
            {tags.map((tagName) => (
              <span
                key={tagName}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white border border-white/20"
                style={{
                  backgroundColor:
                    tagDefinitions[tagName]?.color ?? defaultTagColor,
                }}
              >
                {tagName}
              </span>
            ))}
          </div>
        )}
        {expanded && (
          <ScrollArea.Root className="max-h-[240px]">
            <ScrollArea.Viewport className="w-full">
              <div className="px-3 py-2">
                {hasProperties ? (
                  <ul className="space-y-1 text-left">
                    {properties.map((prop, idx) => (
                      <li
                        key={prop.id ?? prop.localId ?? idx}
                        className="text-xs text-slate-600 dark:text-slate-400 truncate font-mono"
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
