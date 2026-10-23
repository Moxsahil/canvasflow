import {
  ALargeSmall,
  AppWindow,
  Bookmark,
  Crop,
  Layers,
  Lightbulb,
  ListTree,
  MousePointerClick,
  Network,
  PanelRight,
  PenTool,
  RectangleEllipsis,
  RemoveFormatting,
  Spline,
  SquarePlus,
  TextCursorInput,
  VenetianMask,
  WrapText,
} from 'lucide-react';
import { COMMANDS_BY_ID, type CommandIcon, type CommandId } from '../commands/commands';
import type { TranslationKey } from '../i18n';
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
  // Mind maps
  | 'selectBranch'
  | 'expandWithAi'
  // Clipboard
  | 'cut'
  | 'copy'
  | 'paste'
  | 'pasteHere'
  | 'pasteAsMindMap'
  | 'duplicate'
  // Copy as
  | 'copyAsPng'
  | 'copyAsSvg'
  | 'copyAsText'
  | 'copyAsMermaid'
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
  | 'turnIntoMindMap'
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
  | 'showAll'
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
  readonly labelKey: TranslationKey;
  /** At the right-hand end of the row. A toggle draws its on/off box there instead. */
  readonly icon?: CommandIcon;
  /**
   * Key combo in the `mod+o` notation of help/platform. Only on rows that work.
   * Not drawn — the row has room for its icon alone — but announced to
   * assistive technology through `aria-keyshortcuts`.
   */
  readonly shortcut?: string;
  /** Discards work, so it is drawn in red. It still runs on a plain click. */
  readonly destructive?: boolean;
  /** Switches a setting, showing a box that says whether it is on. */
  readonly toggle?: boolean;
  /**
   * One of the rows of its submenu, of which exactly one is in effect: that
   * one is ticked, and picking another switches to it.
   */
  readonly choice?: boolean;
  /** Says what the row does, on hover, where its label alone may not. */
  readonly hintKey?: TranslationKey;
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
function fromCommand(id: CommandId, labelKey: TranslationKey, edits = true): ContextMenuItemMeta {
  const command = COMMANDS_BY_ID.get(id);
  return {
    labelKey,
    icon: command?.icon,
    shortcut: command?.shortcut,
    destructive: command?.destructive,
    edits,
  };
}

/** Likewise for a row the sidebar already has. */
function fromMenu(id: MenuItemId): ContextMenuItemMeta {
  const { labelKey, icon, shortcut } = MENU_ITEMS[id];
  return { labelKey, icon, shortcut };
}

/** A preference ticked on and off from here, labelled as the preferences menu labels it. */
function fromPreference(
  id: PreferenceId,
  labelKey: TranslationKey,
  edits = false,
): ContextMenuItemMeta {
  const preference = PREFERENCE_GROUPS.flatMap((group) => group.items).find(
    (item) => item.id === id,
  );
  return {
    labelKey: preference?.labelKey ?? labelKey,
    shortcut: preference?.shortcut,
    toggle: true,
    edits,
  };
}

/** A row whose feature is not built. It says "Soon" before its icon. */
const soon = (labelKey: TranslationKey, icon: CommandIcon, edits = true): ContextMenuItemMeta => ({
  labelKey,
  icon,
  edits,
});

export const CONTEXT_MENU_ITEMS: Readonly<Record<ContextMenuItemId, ContextMenuItemMeta>> = {
  // Built, and run from this menu alone. Picking things out changes nothing,
  // so a viewer keeps it.
  selectBranch: { labelKey: 'contextMenu.selectBranch', icon: ListTree },
  // Built, and run from this menu alone: ideas under the topic, from the
  // month's AI diagrams.
  expandWithAi: { labelKey: 'contextMenu.expandWithAi', icon: Lightbulb, edits: true },

  cut: fromCommand('cut', 'contextMenu.cut'),
  copy: fromCommand('copy', 'contextMenu.copy', false),
  paste: fromCommand('paste', 'contextMenu.paste'),
  // Built, but run from this menu alone: there is no command to take an icon
  // and a key from, and no key of its own.
  pasteHere: { labelKey: 'contextMenu.pasteHere', icon: MousePointerClick, edits: true },
  // Built, and run from this menu alone, as Paste here is: the words on the
  // clipboard as a new map, where the menu was opened.
  pasteAsMindMap: { labelKey: 'contextMenu.pasteAsMindMap', icon: Network, edits: true },
  duplicate: fromCommand('duplicate', 'contextMenu.duplicate'),

  copyAsPng: fromCommand('copyAsPng', 'contextMenu.copyAsPng', false),
  copyAsSvg: fromCommand('copyAsSvg', 'contextMenu.copyAsSvg', false),
  copyAsText: fromCommand('copyAsText', 'contextMenu.copyAsText', false),
  // Named for its format, as the rows around it are: "Code" alone would not
  // say which.
  copyAsMermaid: {
    ...fromCommand('copyAsMermaid', 'contextMenu.copyAsMermaid', false),
    hintKey: 'contextMenu.copyAsMermaid.hint',
  },
  copyAsJson: fromCommand('copyAsJson', 'contextMenu.copyAsJson', false),
  exportImage: fromMenu('exportImage'),

  flatten: soon('contextMenu.flatten', Layers),
  outlineStroke: soon('contextMenu.outlineStroke', PenTool),
  useAsMask: soon('contextMenu.useAsMask', VenetianMask),
  editLine: soon('contextMenu.editLine', Spline),
  cropImage: soon('contextMenu.cropImage', Crop),
  textAutoSize: soon('contextMenu.textAutoSize', ALargeSmall),
  bindText: soon('contextMenu.bindText', TextCursorInput),
  unbindText: soon('contextMenu.unbindText', RemoveFormatting),
  wrapTextInContainer: soon('contextMenu.wrapTextInContainer', WrapText),
  // Built, and run from this menu alone: a link card and an embed of the same
  // page, each turned into the other where it stands.
  convertToEmbed: { labelKey: 'contextMenu.convertToEmbed', icon: AppWindow, edits: true },
  convertToBookmark: { labelKey: 'contextMenu.convertToBookmark', icon: Bookmark, edits: true },
  // A text box holding a list, turned into the map the list describes.
  turnIntoMindMap: { labelKey: 'contextMenu.turnIntoMindMap', icon: Network, edits: true },

  moveToNewBoard: soon('contextMenu.moveToNewBoard', SquarePlus),

  bringToFront: fromCommand('bringToFront', 'contextMenu.bringToFront'),
  bringForward: fromCommand('bringForward', 'contextMenu.bringForward'),
  sendBackward: fromCommand('sendBackward', 'contextMenu.sendBackward'),
  sendToBack: fromCommand('sendToBack', 'contextMenu.sendToBack'),

  flipHorizontal: fromCommand('flipHorizontal', 'contextMenu.flipHorizontal'),
  flipVertical: fromCommand('flipVertical', 'contextMenu.flipVertical'),

  addLink: fromCommand('editLink', 'contextMenu.addLink'),
  copyLinkToSelection: fromCommand('copyLinkToSelection', 'contextMenu.copyLinkToSelection', false),

  addToLibrary: fromCommand('addToLibrary', 'contextMenu.addToLibrary', false),

  hide: fromCommand('hideSelection', 'contextMenu.hide'),
  lock: fromCommand('toggleLock', 'contextMenu.lock'),
  unlockAll: fromCommand('unlockAll', 'contextMenu.unlockAll'),
  showAll: fromCommand('showAll', 'contextMenu.showAll'),
  deleteSelection: fromCommand('deleteSelection', 'contextMenu.deleteSelection'),

  selectAll: fromCommand('selectAll', 'contextMenu.selectAll'),
  showGrid: fromPreference('showGrid', 'preferences.showGrid'),
  snapToObjects: fromPreference('snapToObjects', 'preferences.snapToObjects', true),
  // Not in the preferences menu, which dropped it; still read by snapping.
  snapToMidpoints: fromPreference('snapToMidpoints', 'contextMenu.snapToMidpoints', true),
  arrowBinding: fromPreference('arrowBinding', 'preferences.arrowBinding', true),
  focusMode: fromPreference('focusMode', 'preferences.focusMode'),
  viewMode: fromPreference('viewMode', 'preferences.viewMode'),
  canvasStats: fromPreference('canvasStats', 'preferences.canvasStats'),
  showComments: fromPreference('showComments', 'preferences.showComments'),
  commandPalette: fromMenu('commandPalette'),

  // A viewer has no style controls for either to show.
  stylePanelInspector: {
    labelKey: 'contextMenu.stylePanelInspector',
    icon: PanelRight,
    hintKey: 'contextMenu.stylePanelInspector.hint',
    choice: true,
    edits: true,
  },
  stylePanelHalo: {
    labelKey: 'contextMenu.stylePanelHalo',
    icon: RectangleEllipsis,
    hintKey: 'contextMenu.stylePanelHalo.hint',
    choice: true,
    edits: true,
  },
};

/** A row that opens a list of its own. */
export interface ContextSubmenu {
  readonly submenu: string;
  readonly labelKey: TranslationKey;
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
  labelKey: 'contextMenu.submenu.copyAs',
  items: ['copyAsPng', 'copyAsSvg', 'copyAsText', 'copyAsMermaid', 'copyAsJson'],
  compact: true,
};

const EDIT: ContextSubmenu = {
  submenu: 'edit',
  labelKey: 'contextMenu.submenu.edit',
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
    'turnIntoMindMap',
  ],
};

/**
 * The boards of this workspace follow New board, filled in at render — they
 * are data, not rows of this table. Being an edit, New board also decides who
 * sees the submenu: a viewer loses it, and the board list along with it.
 */
const MOVE_TO: ContextSubmenu = {
  submenu: 'moveTo',
  labelKey: 'contextMenu.submenu.moveTo',
  items: ['moveToNewBoard'],
  listsBoards: true,
};

/** Where the style controls live: docked at the side, or over the selection. */
const STYLE_PANEL: ContextSubmenu = {
  submenu: 'stylePanel',
  labelKey: 'contextMenu.submenu.stylePanel',
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
  ['selectBranch', 'expandWithAi'],
  ['cut', 'copy', 'paste', 'pasteHere', 'pasteAsMindMap', 'duplicate'],
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
  ['paste', 'pasteHere', 'pasteAsMindMap'],
  [COPY_AS, 'exportImage'],
  ['selectAll', 'unlockAll', 'showAll'],
  ['showGrid', 'snapToObjects', 'snapToMidpoints', 'arrowBinding'],
  ['focusMode', 'viewMode', STYLE_PANEL, 'canvasStats', 'showComments'],
  ['commandPalette'],
];

/** The order rows and the flips: how a selection sits among the rest. */
const ARRANGE: ContextSubmenu = {
  submenu: 'arrange',
  labelKey: 'contextMenu.submenu.arrange',
  items: [
    'bringToFront',
    'bringForward',
    'sendBackward',
    'sendToBack',
    'flipHorizontal',
    'flipVertical',
  ],
};

const GRID_AND_SNAPPING: ContextSubmenu = {
  submenu: 'gridAndSnapping',
  labelKey: 'contextMenu.submenu.gridAndSnapping',
  items: ['showGrid', 'snapToObjects', 'snapToMidpoints', 'arrowBinding'],
};

const VIEW: ContextSubmenu = {
  submenu: 'view',
  labelKey: 'contextMenu.submenu.view',
  items: ['focusMode', 'viewMode', 'canvasStats', 'showComments'],
  compact: true,
};

/**
 * The same two menus for a screen too short to stand them at full length — a
 * tablet in landscape loses most of its height to the browser — with the
 * longer runs of rows folded into submenus. Every row is still there; the
 * test holds both forms to that.
 */
export const SHORT_SELECTION_MENU: readonly ContextMenuGroup[] = [
  ['selectBranch', 'expandWithAi'],
  ['cut', 'copy', 'paste', 'pasteHere', 'pasteAsMindMap', 'duplicate'],
  [COPY_AS, 'exportImage'],
  [EDIT, MOVE_TO, ARRANGE],
  ['addLink', 'copyLinkToSelection'],
  ['addToLibrary'],
  ['hide', 'lock'],
  ['deleteSelection'],
];

export const SHORT_CANVAS_MENU: readonly ContextMenuGroup[] = [
  ['paste', 'pasteHere', 'pasteAsMindMap'],
  [COPY_AS, 'exportImage'],
  ['selectAll', 'unlockAll', 'showAll'],
  [GRID_AND_SNAPPING, VIEW, STYLE_PANEL],
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
/** Rows that hand out a link to the board: only for those who run its sharing. */
const SHARING_ROWS: ReadonlySet<ContextMenuItemId> = new Set(['copyLinkToSelection']);
/** Rows about a mind map: only when a topic is among what was right-clicked. */
const MIND_MAP_ROWS: ReadonlySet<ContextMenuItemId> = new Set(['selectBranch', 'expandWithAi']);

export function contextMenuFor(
  target: ContextMenuTarget,
  {
    readOnly,
    canShareLinks = true,
    mindMap = false,
    short = false,
  }: {
    readOnly: boolean;
    canShareLinks?: boolean;
    /** A topic is selected, which puts the mind map rows in. */
    mindMap?: boolean;
    /** The folded form, for a screen without the height for the full one. */
    short?: boolean;
  },
): ContextMenuGroup[] {
  const layout =
    target === 'selection'
      ? short
        ? SHORT_SELECTION_MENU
        : SELECTION_MENU
      : short
        ? SHORT_CANVAS_MENU
        : CANVAS_MENU;
  const usable = (id: ContextMenuItemId) =>
    !(readOnly && CONTEXT_MENU_ITEMS[id].edits) &&
    (canShareLinks || !SHARING_ROWS.has(id)) &&
    (mindMap || !MIND_MAP_ROWS.has(id));

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
