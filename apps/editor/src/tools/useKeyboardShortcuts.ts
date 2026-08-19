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
  onDuplicate: () => void;
  onZoomTo100: () => void;
  onZoomToFit: () => void;
  onZoomToSelection: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onShowHelp: () => void;
  onToggleTheme: () => void;
  onOpenFile: () => void;
  onSaveFile: () => void;
  onExportImage: () => void;
  onFind: () => void;
  disabled?: boolean;
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
    onDuplicate,
    onZoomTo100,
    onZoomToFit,
    onZoomToSelection,
    onCopy,
    onCut,
    onPaste,
    onShowHelp,
    onToggleTheme,
    onOpenFile,
    onSaveFile,
    onExportImage,
    onFind,
    disabled,
  } = opts;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (disabled) return;
      if (event.key === 'Escape') {
        onEscape();
        return;
      }

      // Help: ? (Shift+/). Gated on the typing check like every other bare
      // key — without it, a '?' typed into the search box or the export
      // dialog's filename field opens the shortcuts modal instead.
      if (
        (event.key === '?' || (event.shiftKey && event.key === '/')) &&
        !shouldIgnoreShortcut(event)
      ) {
        event.preventDefault();
        onShowHelp();
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

      // Z-order
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

      if (!mod && event.altKey && event.shiftKey && event.code === 'KeyD') {
        event.preventDefault();
        onToggleTheme();
        return;
      }

      // Open a board file: Cmd/Ctrl+O. preventDefault matters twice over here
      // — the browser has its own Open dialog on this combo, and the file
      // picker needs this keydown's user activation to be allowed to appear.
      if (mod && event.key === 'o') {
        event.preventDefault();
        onOpenFile();
        return;
      }

      // Find on canvas: Cmd/Ctrl+F, taking the combo off the browser's own
      // find bar. Deliberately not gated on the typing check, so pressing it
      // again while the search box has focus still works.
      if (mod && !event.shiftKey && event.key === 'f') {
        event.preventDefault();
        onFind();
        return;
      }

      // Export image: Cmd/Ctrl+Shift+E. Checked before plain save so the
      // shifted combo isn't swallowed by it.
      if (mod && event.shiftKey && (event.key === 'e' || event.key === 'E')) {
        event.preventDefault();
        onExportImage();
        return;
      }

      // Save the board to a file: Cmd/Ctrl+S, preventDefault'd away from the
      // browser's own "save this page".
      if (mod && event.key === 's') {
        event.preventDefault();
        onSaveFile();
        return;
      }

      // Duplicate: Cmd/Ctrl+D
      if (mod && event.key === 'd') {
        event.preventDefault();
        onDuplicate();
        return;
      }

      // Cut: Cmd/Ctrl+X
      if (mod && event.key === 'x') {
        event.preventDefault();
        onCut();
        return;
      }

      // Copy: Cmd/Ctrl+C
      if (mod && event.key === 'c') {
        event.preventDefault();
        onCopy();
        return;
      }

      // Paste: Cmd/Ctrl+V
      if (mod && event.key === 'v') {
        event.preventDefault();
        onPaste();
        return;
      }

      // Zoom presets: Cmd/Ctrl + 1 / 2 / 3
      if (mod && event.key === '1') {
        event.preventDefault();
        onZoomTo100();
        return;
      }
      if (mod && event.key === '2') {
        event.preventDefault();
        onZoomToFit();
        return;
      }
      if (mod && event.key === '3') {
        event.preventDefault();
        onZoomToSelection();
        return;
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
    onDuplicate,
    onZoomTo100,
    onZoomToFit,
    onZoomToSelection,
    onCopy,
    onCut,
    onPaste,
    onShowHelp,
    onToggleTheme,
    onOpenFile,
    onSaveFile,
    onExportImage,
    onFind,
    disabled,
  ]);
}
