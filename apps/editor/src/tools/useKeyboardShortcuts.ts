import { useEffect } from 'react';
import { KEY_TO_TOOL, shouldIgnoreShortcut } from './shortcuts';
import type { Tool } from './tool';

interface UseKeyboardShortcutsOptions {
  onSelectTool: (tool: Tool) => void;
  onEscape: () => void;
}

export function useKeyboardShortcuts({
  onSelectTool,
  onEscape,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape();
        return;
      }

      if (shouldIgnoreShortcut(event)) return;

      const tool = KEY_TO_TOOL[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        onSelectTool(tool);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSelectTool, onEscape]);
}
