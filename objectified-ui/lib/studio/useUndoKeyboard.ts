/**
 * Keyboard shortcut hook for undo/redo.
 *
 * Listens for Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y (redo)
 * on the document and dispatches the corresponding studio actions.
 *
 * Reference: GitHub #64 — undo/redo keyboard shortcuts.
 */

import { useEffect, useRef } from 'react';

export interface UndoKeyboardOptions {
  /** Called when the undo shortcut is pressed. */
  onUndo: () => void;
  /** Called when the redo shortcut is pressed. */
  onRedo: () => void;
  /** When true, shortcuts are ignored (e.g. while loading). */
  disabled?: boolean;
}

/**
 * Returns the platform-aware modifier key label ('⌘' on macOS, 'Ctrl' elsewhere).
 * Safe to call during SSR (defaults to 'Ctrl').
 */
export function getModifierLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? '') ? '⌘' : 'Ctrl';
}

/**
 * Attach global keydown listeners for undo (Cmd/Ctrl+Z) and
 * redo (Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y).
 *
 * Uses refs internally so callers do not need to memoise callbacks.
 * Automatically uses `metaKey` on macOS and `ctrlKey` elsewhere.
 */
export function useUndoKeyboard({ onUndo, onRedo, disabled }: UndoKeyboardOptions): void {
  const onUndoRef = useRef(onUndo);
  const onRedoRef = useRef(onRedo);

  // Keep refs up-to-date without re-attaching the listener.
  useEffect(() => {
    onUndoRef.current = onUndo;
    onRedoRef.current = onRedo;
  });

  useEffect(() => {
    if (disabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      // Skip if the user is typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.contentEditable === 'true')
      ) {
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      // Redo: Cmd/Ctrl + Shift + Z  or  Cmd/Ctrl + Y
      if (
        (event.key === 'z' && event.shiftKey) ||
        (event.key === 'Z' && event.shiftKey) ||
        event.key === 'y'
      ) {
        event.preventDefault();
        onRedoRef.current();
        return;
      }

      // Undo: Cmd/Ctrl + Z (no shift)
      if ((event.key === 'z' || event.key === 'Z') && !event.shiftKey) {
        event.preventDefault();
        onUndoRef.current();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [disabled]);
}

