import {
  ALargeSmall,
  AppWindow,
  BookPlus,
  Bookmark,
  Braces,
  CodeXml,
  Crop,
  EyeOff,
  FileCode,
  FileImage,
  FlipHorizontal,
  FlipVertical,
  Layers,
  Link,
  Link2,
  Lock,
  LockOpen,
  MousePointerClick,
  PanelRight,
  PenTool,
  RectangleEllipsis,
  RemoveFormatting,
  Spline,
  SquarePlus,
  TextCursorInput,
  Type,
  VenetianMask,
  WrapText,
} from 'lucide-react';
import { COMMANDS_BY_ID, type CommandIcon, type CommandId } from '../commands/commands';
import { MENU_ITEMS, type MenuItemId } from '../menu/menu-items';
import { PREFERENCE_GROUPS, type PreferenceId } from '../preferences/preferences';

/**
 * Every row either context menu can show.
 *
 * Most are not built yet. They are listed anyway, and render disabled with a
 * "Soon" badge, so the menu is complete from the start and the work behind it
 * can land one row at a time — the same bargain the sidebar strikes.
 */
export type ContextMenuItemId =
  // Clipboard
  | 'cut'
  | 'copy'
  | 'paste'
  | 'pasteHere'
  | 'duplicate'
  // Copy as
  | 'copyAsPng'
  | 'copyAsSvg'
  | 'copyAsText'
  | 'copyAsCode'
  | 'copyAsJson'
  | 'exportImage'
  // Edit
  | 'flatten'
  | 'outlineStroke'
  | 'useAsMask'
  | 'editLine'
  | 'cropImage'
  | 'textAutoSize'
  | 'bindText'
  | 'unbindText'
  | 'wrapTextInContainer'
  | 'convertToEmbed'
  | 'convertToBookmark'
  // Boards
  | 'moveToNewBoard'
  // Z-order
  | 'bringToFront'
  | 'bringForward'
  | 'sendBackward'
  | 'sendToBack'
  // Flip
  | 'flipHorizontal'
  | 'flipVertical'
  // Links
  | 'addLink'
  | 'copyLinkToSelection'
  // Library
  | 'addToLibrary'
  // Visibility and locking
  | 'hide'
  | 'lock'
  | 'unlockAll'
  | 'deleteSelection'
  // Canvas
  | 'selectAll'
  | 'showGrid'
  | 'snapToObjects'
  | 'snapToMidpoints'
  | 'arrowBinding'
  | 'focusMode'
  | 'viewMode'
  | 'canvasStats'
  | 'showComments'
  | 'commandPalette'
  // Style panel
  | 'stylePanelInspector'
  | 'stylePanelHalo';

export interface ContextMenuItemMeta {
  readonly label: string;
  /** At the right-hand end of the row. A toggle draws its on/off box there instead. */
  readonly icon?: CommandIcon;
  /**
   * Key combo in the `mod+o` notation of help/platform. Only on rows that work.
   * Not drawn — the row has room for its icon alone — but announced to
   * assistive technology through `aria-keyshortcuts`.
   */
  readonly shortcut?: string;
  /** Held to confirm, rather than run on a click. */
  readonly destructive?: boolean;
  /** Switches a setting, showing a box that says whether it is on. */
  readonly toggle?: boolean;
  /**
   * One of the rows of its submenu, of which exactly one is in effect: that
   * one is ticked, and picking another switches to it.
   */
  readonly choice?: boolean;
  /** Says what the row does, on hover, where its label alone may not. */
  readonly hint?: string;
  /**
   * Changes the board. Left out of the menu for anyone who cannot, rather
   * than shown disabled: a viewer has no use for a row they can never press.
   */
  readonly edits?: boolean;
}

/**
 * A row for something the palette already runs. Its icon and key come from
 * there, so the two places cannot drift apart.
 */
function fromCommand(id: CommandId, label: string, edits = true): ContextMenuItemMeta {
  const command = COMMANDS_BY_ID.get(id);
  return {
    label,
    icon: command?.icon,
    shortcut: command?.shortcut,
    destructive: command?.destructive,
    edits,
  };
}

/** Likewise for a row the sidebar already has. */
function fromMenu(id: MenuItemId): ContextMenuItemMeta {
  const { label, icon, shortcut } = MENU_ITEMS[id];
  return { label, icon, shortcut };
}

/** A preference ticked on and off from here, labelled as the preferences menu labels it. */
function fromPreference(id: PreferenceId, label: string, edits = false): ContextMenuItemMeta {
  const preference = PREFERENCE_GROUPS.flatMap((group) => group.items).find(
    (item) => item.id === id,
  );
  return { label: preference?.label ?? label, shortcut: preference?.shortcut, toggle: true, edits };
}

/** A row whose feature is not built. It says "Soon" before its icon. */
const soon = (label: string, icon: CommandIcon, edits = true): ContextMenuItemMeta => ({
  label,
  icon,
  edits,
});

export const CONTEXT_MENU_ITEMS: Readonly<Record<ContextMenuItemId, ContextMenuItemMeta>> = {
  cut: fromCommand('cut', 'Cut'),
  copy: fromCommand('copy', 'Copy', false),
  paste: fromCommand('paste', 'Paste'),
  // Built, but run from this menu alone: there is no command to take an icon
  // and a key from, and no key of its own.
  pasteHere: { label: 'Paste here', icon: MousePointerClick, edits: true },
  duplicate: fromCommand('duplicate', 'Duplicate'),

  copyAsPng: soon('PNG', FileImage, false),
  copyAsSvg: soon('SVG', FileCode, false),
  copyAsText: soon('Text', Type, false),
  copyAsCode: soon('Code', CodeXml, false),
  copyAsJson: soon('JSON', Braces, false),
  exportImage: fromMenu('exportImage'),

  flatten: soon('Flatten', Layers),
  outlineStroke: soon('Outline stroke', PenTool),
  useAsMask: soon('Use as mask', VenetianMask),
  editLine: soon('Edit line points', Spline),
  cropImage: soon('Crop image', Crop),
  textAutoSize: soon('Auto-size text', ALargeSmall),
  bindText: soon('Bind text to container', TextCursorInput),
  unbindText: soon('Unbind text', RemoveFormatting),
  wrapTextInContainer: soon('Wrap text in container', WrapText),
  convertToEmbed: soon('Convert to embed', AppWindow),
  convertToBookmark: soon('Convert to bookmark', Bookmark),

  moveToNewBoard: soon('New board', SquarePlus),

  bringToFront: fromCommand('bringToFront', 'Bring to front'),
  bringForward: fromCommand('bringForward', 'Bring forward'),
  sendBackward: fromCommand('sendBackward', 'Send backward'),
  sendToBack: fromCommand('sendToBack', 'Send to back'),

  flipHorizontal: soon('Flip horizontal', FlipHorizontal),
  flipVertical: soon('Flip vertical', FlipVertical),

  addLink: soon('Add link', Link),
  copyLinkToSelection: soon('Copy link to selection', Link2, false),

  addToLibrary: soon('Add to library', BookPlus, false),

  hide: soon('Hide', EyeOff),
  lock: soon('Lock', Lock),
  unlockAll: soon('Unlock all', LockOpen),
  deleteSelection: fromCommand('deleteSelection', 'Delete'),

  selectAll: fromCommand('selectAll', 'Select all'),
  showGrid: fromPreference('showGrid', 'Show grid'),
  snapToObjects: fromPreference('snapToObjects', 'Snap to objects', true),
  // Not in the preferences menu, which dropped it; still read by snapping.
  snapToMidpoints: fromPreference('snapToMidpoints', 'Snap to midpoints', true),
  arrowBinding: fromPreference('arrowBinding', 'Arrow binding', true),
  focusMode: fromPreference('focusMode', 'Focus mode'),
  viewMode: fromPreference('viewMode', 'View mode'),
  canvasStats: fromPreference('canvasStats', 'Canvas stats'),
  showComments: fromPreference('showComments', 'Show comments'),
  commandPalette: fromMenu('commandPalette'),

  // A viewer has no style controls for either to show.
  stylePanelInspector: {
    label: 'Inspector',
    icon: PanelRight,
    hint: 'Style controls docked at the right edge',
    choice: true,
    edits: true,
  },
  stylePanelHalo: {
    label: 'Halo',
    icon: RectangleEllipsis,
    hint: 'Style controls in a bar that floats over the selection',
    choice: true,
    edits: true,
  },
};

/** A row that opens a list of its own. */
export interface ContextSubmenu {
  readonly submenu: string;
  readonly label: string;
  readonly items: readonly ContextMenuItemId[];
  /** Followed by the boards of this workspace — see `MoveToBoards`. */
  readonly listsBoards?: boolean;
  /**
   * Its rows are a word or two: the panel is sized to them rather than to
   * the width a menu of longer rows is given.
   */
  readonly compact?: boolean;
}

export type ContextMenuEntry = ContextMenuItemId | ContextSubmenu;

/** Rows between two rules. */
export type ContextMenuGroup = readonly ContextMenuEntry[];

const COPY_AS: ContextSubmenu = {
  submenu: 'copyAs',
  label: 'Copy as',
  items: ['copyAsPng', 'copyAsSvg', 'copyAsText', 'copyAsCode', 'copyAsJson'],
  compact: true,
};

const EDIT: ContextSubmenu = {
  submenu: 'edit',
  label: 'Edit',
  items: [
    'flatten',
    'outlineStroke',
    'useAsMask',
    'editLine',
    'cropImage',
    'textAutoSize',
    'bindText',
    'unbindText',
    'wrapTextInContainer',
    'convertToEmbed',
    'convertToBookmark',
  ],
};

/**
 * The boards of this workspace follow New board, filled in at render — they
 * are data, not rows of this table. Being an edit, New board also decides who
 * sees the submenu: a viewer loses it, and the board list along with it.
 */
const MOVE_TO: ContextSubmenu = {
  submenu: 'moveTo',
  label: 'Move to',
  items: ['moveToNewBoard'],
  listsBoards: true,
};

/** Where the style controls live: docked at the side, or over the selection. */
const STYLE_PANEL: ContextSubmenu = {
  submenu: 'stylePanel',
  label: 'Style panel',
  items: ['stylePanelInspector', 'stylePanelHalo'],
  compact: true,
};

/**
 * Right-click on a shape, or inside what is already selected.
 *
 * The four z-order rows stay out in the open rather than in a submenu: they
 * work today, and reaching them is most of what this menu is for so far.
 * Delete is last and on its own, being the one row that discards work.
 */
export const SELECTION_MENU: readonly ContextMenuGroup[] = [
  ['cut', 'copy', 'paste', 'pasteHere', 'duplicate'],
  [COPY_AS, 'exportImage'],
  [EDIT, MOVE_TO],
  ['bringToFront', 'bringForward', 'sendBackward', 'sendToBack'],
  ['flipHorizontal', 'flipVertical'],
  ['addLink', 'copyLinkToSelection'],
  ['addToLibrary'],
  ['hide', 'lock'],
  ['deleteSelection'],
];

/** Right-click on empty board: nothing is selected, so these act on the board. */
export const CANVAS_MENU: readonly ContextMenuGroup[] = [
  ['paste', 'pasteHere'],
  [COPY_AS, 'exportImage'],
  ['selectAll', 'unlockAll'],
  ['showGrid', 'snapToObjects', 'snapToMidpoints', 'arrowBinding'],
  ['focusMode', 'viewMode', STYLE_PANEL, 'canvasStats', 'showComments'],
  ['commandPalette'],
];

/** What the right-click landed on, which decides the menu it opens. */
export type ContextMenuTarget = 'selection' | 'canvas';

/**
 * The rows to draw, with anything this person cannot use taken out.
 *
 * A submenu left with nothing in it goes too, and so does a group — the rule
 * between two groups would otherwise sit over an empty space.
 */
export function contextMenuFor(
  target: ContextMenuTarget,
  { readOnly }: { readOnly: boolean },
): ContextMenuGroup[] {
  const layout = target === 'selection' ? SELECTION_MENU : CANVAS_MENU;
  const usable = (id: ContextMenuItemId) => !(readOnly && CONTEXT_MENU_ITEMS[id].edits);

  const groups: ContextMenuGroup[] = [];
  for (const group of layout) {
    const entries: ContextMenuEntry[] = [];
    for (const entry of group) {
      if (typeof entry === 'string') {
        if (usable(entry)) entries.push(entry);
        continue;
      }
      const items = entry.items.filter(usable);
      if (items.length > 0) entries.push({ ...entry, items });
    }
    if (entries.length > 0) groups.push(entries);
  }
  return groups;
}

/**
 * Handlers for the rows, in the same three states as the sidebar's
 * `MenuActions`:
 *
 * - a function — the row is live.
 * - `null` — the feature exists but does not apply to this selection: z-order
 *   with two shapes picked, Select all on an empty board. Disabled, and the
 *   shortcut hint stays.
 * - absent — the feature is not built. Disabled, and it reads "Soon".
 */
export type ContextMenuActions = Partial<Record<ContextMenuItemId, (() => void) | null>>;

/** Whether each toggle row is ticked, and which choice row is in effect. */
export type ContextMenuChecks = Partial<Record<ContextMenuItemId, boolean>>;
