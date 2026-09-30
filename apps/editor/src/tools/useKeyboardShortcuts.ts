import { useEffect } from 'react';
import {
  KEY_TO_TOOL,
  isCommandPaletteShortcut,
  isTypingTarget,
  shouldIgnoreShortcut,
} from './shortcuts';
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
  /**
   * Handed what the paste carried, to be read before anything is awaited: the
   * browser empties it once the event has been dealt with.
   */
  onPaste: (pasted: DataTransfer | null) => void;
  onShowHelp: () => void;
  onToggleTheme: () => void;
  onToggleGrid: () => void;
  onToggleSnapping: () => void;
  onToggleToolLock: () => void;
  onToggleFocusMode: () => void;
  onToggleViewMode: () => void;
  onToggleCanvasStats: () => void;
  onToggleComments: () => void;
  onOpenFile: () => void;
  onSaveFile: () => void;
  onExportImage: () => void;
  onFind: () => void;
  onCommandPalette: () => void;
  disabled?: boolean;
  /**
   * Answer a paste even while the rest are off. For the one window that is up
   * to ask for that very keystroke.
   */
  pasteWhileDisabled?: boolean;
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
    onToggleGrid,
    onToggleSnapping,
    onToggleToolLock,
    onToggleFocusMode,
    onToggleViewMode,
    onToggleCanvasStats,
    onToggleComments,
    onOpenFile,
    onSaveFile,
    onExportImage,
    onFind,
    onCommandPalette,
    disabled,
    pasteWhileDisabled,
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

      // Show or hide the grid: Cmd/Ctrl+'. Read from event.key rather than a
      // code, so a layout that puts the apostrophe elsewhere still matches the
      // character the preferences menu prints.
      if (mod && event.key === "'") {
        event.preventDefault();
        onToggleGrid();
        return;
      }

      // Snap to objects: Alt+S. Read from the code rather than the key, since
      // Alt is a compose key on several layouts and pressing it with S there
      // produces something other than an "s".
      if (!mod && event.altKey && !event.shiftKey && event.code === 'KeyS') {
        event.preventDefault();
        onToggleSnapping();
        return;
      }

      // Focus mode: Alt+Z. View mode: Alt+R. By code, as Alt+S is, and for the
      // same reason.
      if (!mod && event.altKey && !event.shiftKey && event.code === 'KeyZ') {
        event.preventDefault();
        onToggleFocusMode();
        return;
      }
      if (!mod && event.altKey && !event.shiftKey && event.code === 'KeyR') {
        event.preventDefault();
        onToggleViewMode();
        return;
      }

      // Canvas stats: Alt+/. By code again — and Alt+/ types a division sign
      // on some layouts, which no check on the key would recognise.
      if (!mod && event.altKey && !event.shiftKey && event.code === 'Slash') {
        event.preventDefault();
        onToggleCanvasStats();
        return;
      }

      // Show or hide comments: Shift+C. Checked ahead of the tool keys, where
      // a bare C is the ellipse — and not while typing, where it is a capital.
      if (
        !mod &&
        !event.altKey &&
        event.shiftKey &&
        event.code === 'KeyC' &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        onToggleComments();
        return;
      }

      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        onCommandPalette();
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

      // Tool lock: Q, the letter both the preferences menu and the shortcuts
      // dialog already print for it. Bare only — Cmd+Q is the platform's.
      if (!mod && !event.altKey && event.key.toLowerCase() === 'q') {
        event.preventDefault();
        onToggleToolLock();
        return;
      }

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

    // Paste: Cmd/Ctrl+V, and the browser's own Edit ▸ Paste. Answered on the
    // paste event rather than the keydown, which is left alone so that the
    // event follows it. Only the event is handed a file copied from the
    // computer's own folders, and it carries text without the page having to
    // ask leave to read the clipboard.
    const handlePaste = (event: ClipboardEvent) => {
      if (disabled && !pasteWhileDisabled) return;
      // Into a field is the field's paste, not the board's.
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      onPaste(event.clipboardData);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('paste', handlePaste);
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
    onToggleGrid,
    onToggleSnapping,
    onToggleToolLock,
    onToggleFocusMode,
    onToggleViewMode,
    onToggleCanvasStats,
    onToggleComments,
    onOpenFile,
    onSaveFile,
    onExportImage,
    onFind,
    onCommandPalette,
    disabled,
    pasteWhileDisabled,
  ]);
}
