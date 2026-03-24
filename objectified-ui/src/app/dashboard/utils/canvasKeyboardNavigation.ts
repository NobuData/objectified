/**
 * Normalizes keyboard-based focus traversal across visible class nodes.
 * Returns 0 when there are no nodes to keep callers safe.
 */
export function getNextKeyboardFocusIndex(
  currentIndex: number,
  offset: number,
  totalItems: number
): number {
  if (totalItems <= 0) {
    return 0;
  }
  return ((currentIndex + offset) % totalItems + totalItems) % totalItems;
}
