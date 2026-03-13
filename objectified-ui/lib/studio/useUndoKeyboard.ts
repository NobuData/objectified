/**
 * Keyboard shortcut hook for undo/redo.
 *
 * Listens for Cmd+Z (macOS) or Ctrl+Z (Windows/Linux) to undo, and
 * Cmd/Ctrl+Shift+Z or Ctrl+Y (Windows/Linux only) to redo, then dispatches
 * the corresponding studio actions.
 *
 * Uses metaKey on macOS and ctrlKey on all other platforms to avoid
 * intercepting OS-level shortcuts (e.g. Win+Z on Windows).
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
 * redo (Cmd/Ctrl+Shift+Z or Ctrl+Y on Windows/Linux).
 *
 * Uses refs internally so callers do not need to memoise callbacks.
 * Uses metaKey on macOS and ctrlKey on Windows/Linux to avoid intercepting
 * OS-level shortcuts (e.g. Win+Z on Windows).
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

    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? '');

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

      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod) return;

      const key = event.key.toLowerCase();

      // Redo: Cmd/Ctrl + Shift + Z  or  Ctrl + Y (Windows/Linux only)
      if ((key === 'z' && event.shiftKey) || (!isMac && key === 'y')) {
        event.preventDefault();
        onRedoRef.current();
        return;
      }

      // Undo: Cmd/Ctrl + Z (no shift)
      if (key === 'z' && !event.shiftKey) {
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

