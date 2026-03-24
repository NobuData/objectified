import { getNextKeyboardFocusIndex } from '@/app/dashboard/utils/canvasKeyboardNavigation';

describe('canvasKeyboardNavigation', () => {
  it('wraps to first item when moving forward from last', () => {
    expect(getNextKeyboardFocusIndex(2, 1, 3)).toBe(0);
  });

  it('wraps to last item when moving backward from first', () => {
    expect(getNextKeyboardFocusIndex(0, -1, 3)).toBe(2);
  });

  it('returns zero when there are no visible items', () => {
    expect(getNextKeyboardFocusIndex(0, 1, 0)).toBe(0);
  });
});
