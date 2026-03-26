'use client';

/**
 * Accessible table of schema classes; selection syncs with the design canvas (GitHub #236).
 */

import { useCallback } from 'react';
import type { StudioClass } from '@lib/studio/types';
import { getStableClassId } from '@lib/studio/types';

export interface CanvasClassListViewProps {
  classes: StudioClass[];
  selectedClassIds: Set<string>;
  onSelectClassId: (classId: string) => void;
  onAnnounce?: (message: string) => void;
}

export default function CanvasClassListView({
  classes,
  selectedClassIds,
  onSelectClassId,
  onAnnounce,
}: CanvasClassListViewProps) {
  const handleActivate = useCallback(
    (classId: string, name: string) => {
      onSelectClassId(classId);
      onAnnounce?.(`Selected class ${name || 'Unnamed class'}`);
    },
    [onSelectClassId, onAnnounce]
  );

  return (
    <div className="pointer-events-auto max-h-[min(50vh,360px)] overflow-auto rounded-md border border-slate-200 bg-white/98 shadow-md dark:border-slate-600 dark:bg-slate-900/98">
      <table className="w-full min-w-[240px] border-collapse text-left text-xs text-slate-800 dark:text-slate-100">
        <caption className="sr-only">
          Classes on this schema. Activate a row to select the class on the canvas.
        </caption>
        <thead className="sticky top-0 z-[1] bg-slate-100 dark:bg-slate-800">
          <tr>
            <th scope="col" className="px-2 py-1.5 font-semibold border-b border-slate-200 dark:border-slate-600">
              Class
            </th>
            <th scope="col" className="px-2 py-1.5 font-semibold border-b border-slate-200 dark:border-slate-600">
              Properties
            </th>
          </tr>
        </thead>
        <tbody>
          {classes.map((cls) => {
            const id = getStableClassId(cls);
            const selected = selectedClassIds.has(id);
            const name = cls.name?.trim() || 'Unnamed class';
            return (
              <tr
                key={id}
                aria-selected={selected}
                className={
                  selected
                    ? 'bg-indigo-50 dark:bg-indigo-950/60'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                }
              >
                <td className="border-b border-slate-100 px-2 py-1 dark:border-slate-700">
                  <button
                    type="button"
                    className="w-full text-left font-medium text-slate-900 underline-offset-2 hover:underline dark:text-slate-100"
                    onClick={() => handleActivate(id, name)}
                  >
                    {name}
                  </button>
                </td>
                <td className="border-b border-slate-100 px-2 py-1 tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {(cls.properties ?? []).length}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
