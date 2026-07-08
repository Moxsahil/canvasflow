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
}

export function useKeyboardShortcuts({
  onSelectTool,
  onEscape,
  onSpaceDown,
  onSpaceUp,
  onZoomIn,
  onZoomOut,
  onResetView,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape();
        return;
      }

      // Space: only when not typing
      if (event.code === 'Space' && !shouldIgnoreShortcut(event)) {
        event.preventDefault();
        onSpaceDown();
        return;
      }

      // Cmd/Ctrl + 0 = reset view
      if ((event.metaKey || event.ctrlKey) && event.key === '0') {
        event.preventDefault();
        onResetView();
        return;
      }

      // Cmd/Ctrl + = or + = zoom in
      if ((event.metaKey || event.ctrlKey) && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        onZoomIn();
        return;
      }

      // Cmd/Ctrl + - = zoom out
      if ((event.metaKey || event.ctrlKey) && event.key === '-') {
        event.preventDefault();
        onZoomOut();
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
  }, [onSelectTool, onEscape, onSpaceDown, onSpaceUp, onZoomIn, onZoomOut, onResetView]);
}
