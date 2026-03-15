/**
 * Optional layout hints overlay: edge crossings, spacing, suggestions.
 * Reference: GitHub #89 — Add layout hinting to the canvas.
 */
'use client';

import { Info } from 'lucide-react';
import type { LayoutQualityResult } from '@lib/studio/layoutQuality';

export interface LayoutHintsOverlayProps {
  quality: LayoutQualityResult;
}

export default function LayoutHintsOverlay({ quality }: LayoutHintsOverlayProps) {
  const { edgeCrossings, minSpacing, suggestions } = quality;
  const spacingText =
    minSpacing === Infinity ? '—' : `${Math.round(minSpacing)}px`;

  return (
    <div
      className="absolute top-2 left-2 z-10 flex flex-col gap-1.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white/95 dark:bg-slate-900/95 shadow-lg text-xs text-slate-700 dark:text-slate-300 max-w-[220px]"
      role="status"
      aria-label="Layout quality hints"
    >
      <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Layout hints</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <dt className="text-slate-500 dark:text-slate-400">Edge crossings</dt>
        <dd>{edgeCrossings}</dd>
        <dt className="text-slate-500 dark:text-slate-400">Min spacing</dt>
        <dd>{spacingText}</dd>
      </dl>
      {suggestions.length > 0 && (
        <ul className="list-disc list-inside text-amber-700 dark:text-amber-400 mt-0.5 space-y-0.5">
          {suggestions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
