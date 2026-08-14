export interface ShortcutEntry {
  /** Primary key combo, e.g. 'mod+d' or 'r' or 'arrow-left' */
  keys: string;
  /** Optional alternative key combo, rendered after "or" */
  altKeys?: string;
  /** What the shortcut does */
  description: string;
}

export interface ShortcutCategory {
  title: string;
  entries: ShortcutEntry[];
}

export const SHORTCUTS: ShortcutCategory[] = [
  {
    title: 'Tools',
    entries: [
      { keys: 'h', description: 'Hand (pan canvas)' },
      { keys: 'v', description: 'Select tool' },
      { keys: 'r', description: 'Rectangle' },
      { keys: 'c', description: 'Ellipse' },
      { keys: 'd', description: 'Diamond' },
      { keys: 'l', description: 'Line' },
      { keys: 'a', description: 'Arrow' },
      { keys: 'p', description: 'Freehand (pencil)' },
      { keys: 't', description: 'Text' },
      { keys: 'e', description: 'Eraser' },
    ],
  },
  {
    title: 'Editor',
    entries: [
      { keys: 'mod+z', description: 'Undo' },
      { keys: 'mod+shift+z', altKeys: 'ctrl+y', description: 'Redo' },
      { keys: 'mod+c', description: 'Copy selection' },
      { keys: 'mod+x', description: 'Cut selection' },
      { keys: 'mod+v', description: 'Paste' },
      { keys: 'mod+d', description: 'Duplicate selection' },
      { keys: 'delete', altKeys: 'backspace', description: 'Delete selection' },
      { keys: 'mod+a', description: 'Select all' },
      { keys: 'escape', description: 'Deselect / cancel' },
      { keys: 'arrow-left', description: 'Nudge selection 1px' },
      { keys: 'shift+arrow-left', description: 'Nudge selection 10px' },
      { keys: ']', description: 'Bring forward' },
      { keys: '[', description: 'Send backward' },
      { keys: 'mod+]', description: 'Bring to front' },
      { keys: 'mod+[', description: 'Send to back' },
    ],
  },
  {
    title: 'View',
    entries: [
      { keys: 'space+drag', description: 'Pan canvas' },
      { keys: 'scroll', description: 'Pan (mouse or trackpad)' },
      { keys: 'mod+scroll', description: 'Zoom around cursor' },
      { keys: 'mod+=', description: 'Zoom in' },
      { keys: 'mod+-', description: 'Zoom out' },
      { keys: 'mod+0', description: 'Reset zoom' },
      { keys: 'mod+1', description: 'Zoom to 100%' },
      { keys: 'mod+2', description: 'Zoom to fit all' },
      { keys: 'mod+3', description: 'Zoom to selection' },
      { keys: '?', description: 'Show this dialog' },
    ],
  },
];
