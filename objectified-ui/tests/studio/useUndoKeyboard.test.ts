/**
 * Unit tests for useUndoKeyboard hook and getModifierLabel utility.
 *
 * Reference: GitHub #64 — undo/redo keyboard shortcuts.
 */

import { renderHook } from '@testing-library/react';
import { useUndoKeyboard, getModifierLabel } from '@lib/studio/useUndoKeyboard';

function fireKey(
  key: string,
  opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}
) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

describe('useUndoKeyboard', () => {
  it('calls onUndo when Ctrl+Z is pressed', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    renderHook(() => useUndoKeyboard({ onUndo, onRedo }));

    fireKey('z', { ctrlKey: true });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('calls onUndo when Meta+Z is pressed (macOS)', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    renderHook(() => useUndoKeyboard({ onUndo, onRedo }));

    fireKey('z', { metaKey: true });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('calls onRedo when Ctrl+Shift+Z is pressed', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    renderHook(() => useUndoKeyboard({ onUndo, onRedo }));

    fireKey('z', { ctrlKey: true, shiftKey: true });

    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('calls onRedo when Meta+Shift+Z is pressed (macOS)', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    renderHook(() => useUndoKeyboard({ onUndo, onRedo }));

    fireKey('Z', { metaKey: true, shiftKey: true });

    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('calls onRedo when Ctrl+Y is pressed', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    renderHook(() => useUndoKeyboard({ onUndo, onRedo }));

    fireKey('y', { ctrlKey: true });

    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('does nothing when disabled is true', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    renderHook(() => useUndoKeyboard({ onUndo, onRedo, disabled: true }));

    fireKey('z', { ctrlKey: true });
    fireKey('z', { ctrlKey: true, shiftKey: true });
    fireKey('y', { ctrlKey: true });

    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('does nothing without modifier key', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    renderHook(() => useUndoKeyboard({ onUndo, onRedo }));

    fireKey('z');
    fireKey('y');

    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('ignores events from input elements', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    renderHook(() => useUndoKeyboard({ onUndo, onRedo }));

    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(onUndo).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('ignores events from textarea elements', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    renderHook(() => useUndoKeyboard({ onUndo, onRedo }));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);

    expect(onUndo).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it('ignores events from contenteditable elements', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    renderHook(() => useUndoKeyboard({ onUndo, onRedo }));

    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    div.dispatchEvent(event);

    expect(onUndo).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('cleans up listener on unmount', () => {
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    const { unmount } = renderHook(() => useUndoKeyboard({ onUndo, onRedo }));

    unmount();

    fireKey('z', { ctrlKey: true });

    expect(onUndo).not.toHaveBeenCalled();
  });
});

describe('getModifierLabel', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(
    navigator,
    'platform'
  );

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(navigator, 'platform', originalPlatform);
    }
  });

  it('returns "⌘" for macOS platforms', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    expect(getModifierLabel()).toBe('⌘');
  });

  it('returns "Ctrl" for non-Mac platforms', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      configurable: true,
    });
    expect(getModifierLabel()).toBe('Ctrl');
  });
});

