import { useEffect } from 'react';
import { KEY_TO_TOOL, shouldIgnoreShortcut } from './shortcuts';
import type { Tool } from './tool';

interface UseKeyboardShortcutsOptions {
  onSelectTool: (tool: Tool) => void;
  onEscape: () => void;
  onSpaceDown: () => void;
  onSpaceUp: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onNudge: (dx: number, dy: number) => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

export function useKeyboardShortcuts(opts: UseKeyboardShortcutsOptions): void {
  const {
    onSelectTool,
    onEscape,
    onSpaceDown,
    onSpaceUp,
    onZoomIn,
    onZoomOut,
    onResetView,
    onDelete,
    onSelectAll,
    onUndo,
    onRedo,
    onNudge,
    onBringForward,
    onSendBackward,
    onBringToFront,
    onSendToBack,
  } = opts;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape();
        return;
      }

      if (event.code === 'Space' && !shouldIgnoreShortcut(event)) {
        event.preventDefault();
        onSpaceDown();
        return;
      }

      const mod = event.metaKey || event.ctrlKey;

      // Arrow-nudge (only if not typing)
      if (!shouldIgnoreShortcut(event)) {
        const step = event.shiftKey ? 10 : 1;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onNudge(-step, 0);
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onNudge(step, 0);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onNudge(0, -step);
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          onNudge(0, step);
          return;
        }
      }

      // Z-order shortcuts (only if not typing)
      if (!shouldIgnoreShortcut(event)) {
        if (mod && event.key === ']') {
          event.preventDefault();
          onBringToFront();
          return;
        }
        if (mod && event.key === '[') {
          event.preventDefault();
          onSendToBack();
          return;
        }
        if (!mod && event.key === ']') {
          event.preventDefault();
          onBringForward();
          return;
        }
        if (!mod && event.key === '[') {
          event.preventDefault();
          onSendBackward();
          return;
        }
      }

      if (mod && event.key === '0') {
        event.preventDefault();
        onResetView();
        return;
      }
      if (mod && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        onZoomIn();
        return;
      }
      if (mod && event.key === '-') {
        event.preventDefault();
        onZoomOut();
        return;
      }
      if (mod && event.key === 'a') {
        event.preventDefault();
        onSelectAll();
        return;
      }

      // Undo: Cmd/Ctrl+Z (without shift)
      if (mod && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        onUndo();
        return;
      }
      if (mod && ((event.key === 'z' && event.shiftKey) || event.key === 'y')) {
        event.preventDefault();
        onRedo();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && !shouldIgnoreShortcut(event)) {
        event.preventDefault();
        onDelete();
        return;
      }

      if (shouldIgnoreShortcut(event)) return;

      const tool = KEY_TO_TOOL[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        onSelectTool(tool);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        onSpaceUp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    onSelectTool,
    onEscape,
    onSpaceDown,
    onSpaceUp,
    onZoomIn,
    onZoomOut,
    onResetView,
    onDelete,
    onSelectAll,
    onUndo,
    onRedo,
    onNudge,
    onBringForward,
    onSendBackward,
    onBringToFront,
    onSendToBack,
  ]);
}
