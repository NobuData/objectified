'use client';

import { useCallback, useState } from 'react';
import type { CanvasSearchState } from '@lib/studio/canvasSearch';
import {
  getSavedCanvasSearches,
  saveCanvasSearchPreset,
  removeSavedCanvasSearch,
  type SavedCanvasSearch,
} from '@lib/studio/savedCanvasSearches';

export interface UseSavedCanvasSearchesReturn {
  items: SavedCanvasSearch[];
  savePreset: (name: string, state: CanvasSearchState) => void;
  removePreset: (id: string) => void;
  refresh: () => void;
}

export function useSavedCanvasSearches(): UseSavedCanvasSearchesReturn {
  const [items, setItems] = useState<SavedCanvasSearch[]>(getSavedCanvasSearches);

  const savePreset = useCallback((name: string, state: CanvasSearchState) => {
    const next = saveCanvasSearchPreset(name, state);
    setItems(next);
  }, []);

  const removePreset = useCallback((id: string) => {
    const next = removeSavedCanvasSearch(id);
    setItems(next);
  }, []);

  const refresh = useCallback(() => {
    setItems(getSavedCanvasSearches());
  }, []);

  return { items, savePreset, removePreset, refresh };
}
