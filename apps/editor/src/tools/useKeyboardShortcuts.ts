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
}

export function useKeyboardShortcuts({
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
}: UseKeyboardShortcutsOptions): void {
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

      // Cmd/Ctrl-modified shortcuts
      const mod = event.metaKey || event.ctrlKey;

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

      // Redo: Cmd/Ctrl+Shift+Z or Ctrl+Y
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
  ]);
}
