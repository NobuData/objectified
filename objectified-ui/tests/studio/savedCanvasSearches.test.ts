/**
 * Saved canvas search presets. GitHub #241.
 */

import {
  getSavedCanvasSearches,
  saveCanvasSearchPreset,
  removeSavedCanvasSearch,
} from '@lib/studio/savedCanvasSearches';
import { defaultCanvasSearchState } from '@lib/studio/canvasSearch';

const KEY = 'objectified:canvas:savedSearches';

describe('savedCanvasSearches', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty list when nothing stored', () => {
    expect(getSavedCanvasSearches()).toEqual([]);
  });

  it('saves and loads a named preset', () => {
    const state = { ...defaultCanvasSearchState, canvasSearchQuery: 'alpha' };
    const list = saveCanvasSearchPreset('My search', state);
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('My search');
    expect(list[0].state.canvasSearchQuery).toBe('alpha');

    const again = getSavedCanvasSearches();
    expect(again.length).toBe(1);
    expect(again[0].state.searchFilterTag).toBeNull();
  });

  it('ignores blank names', () => {
    saveCanvasSearchPreset('   ', defaultCanvasSearchState);
    expect(getSavedCanvasSearches().length).toBe(0);
  });

  it('removeSavedCanvasSearch drops by id', () => {
    saveCanvasSearchPreset('A', defaultCanvasSearchState);
    const [first] = getSavedCanvasSearches();
    removeSavedCanvasSearch(first.id);
    expect(getSavedCanvasSearches().length).toBe(0);
  });

  it('ignores corrupt localStorage payload', () => {
    localStorage.setItem(KEY, 'not-json');
    expect(getSavedCanvasSearches()).toEqual([]);
  });
});
