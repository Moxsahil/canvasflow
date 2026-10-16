import {
  ArrowDownToLine,
  ArrowUpToLine,
  BookPlus,
  BoxSelect,
  Braces,
  ChartColumn,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crosshair,
  Expand,
  Eye,
  EyeOff,
  FileCode,
  FileImage,
  FlipHorizontal,
  FlipVertical,
  Focus,
  Link,
  Link2,
  Lock,
  LockOpen,
  Maximize,
  MessageSquare,
  MoveDown,
  MoveUp,
  Redo2,
  Scissors,
  SunMoon,
  Trash2,
  Type,
  Undo2,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { TranslationKey } from '../i18n';
import { MENU_ITEMS, type MenuItemId } from '../menu/menu-items';
import { TOOLS, VIEW_MODE_TOOL, VIEW_ONLY_TOOLS, type Tool } from '../tools/tool';

/**
 * Both icon families the editor draws with: the menu's are from the icon
 * package, the toolbar's are hand-drawn SVGs. Neither takes props beyond an
 * SVG's own, so the palette can render either without knowing which it has.
 */
export type CommandIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Menu rows that are also commands. Their label, icon and shortcut are read
 * from `MENU_ITEMS` rather than restated here, so renaming a sidebar row
 * renames it in the palette too.
 *
 * Absent on purpose: `commandPalette` itself, which would only ever reopen
 * what you already have open, and `preferences`, which is a panel anchored to
 * its row in the rail rather than an action — there is nothing for a command
 * to run, and a palette entry that only pointed at the sidebar would be a
 * worse way of getting there than the sidebar.
 */
type MenuBackedCommandId = Extract<
  MenuItemId,
  | 'open'
  | 'saveTo'
  | 'exportImage'
  | 'renameBoard'
  | 'liveCollaboration'
  | 'copyLink'
  | 'resetCanvas'
  | 'findOnCanvas'
  | 'help'
  | 'settings'
  | 'signOut'
>;

export type CommandId =
  | MenuBackedCommandId
  | `tool:${Tool}`
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomTo100'
  | 'zoomToFit'
  | 'zoomToSelection'
  | 'toggleTheme'
  | 'toggleFocusMode'
  | 'toggleViewMode'
  | 'toggleCanvasStats'
  | 'toggleComments'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'deleteSelection'
  | 'selectAll'
  | 'bringForward'
  | 'sendBackward'
  | 'bringToFront'
  | 'sendToBack'
  | 'flipHorizontal'
  | 'flipVertical'
  | 'editLink'
  | 'copyLinkToSelection'
  | 'copyAsPng'
  | 'copyAsSvg'
  | 'copyAsText'
  | 'copyAsMermaid'
  | 'copyAsJson'
  | 'toggleLock'
  | 'unlockAll'
  | 'hideSelection'
  | 'showAll'
  | 'addToLibrary';

/** Array order is the order the palette lists the groups in. */
export const COMMAND_CATEGORIES = ['Tools', 'View', 'Edit', 'Arrange', 'Board', 'App'] as const;

export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

/** A category's heading in the palette. */
export const CATEGORY_KEYS: Readonly<Record<CommandCategory, TranslationKey>> = {
  Tools: 'commands.category.tools',
  View: 'commands.category.view',
  Edit: 'commands.category.edit',
  Arrange: 'commands.category.arrange',
  Board: 'commands.category.board',
  App: 'commands.category.app',
};

/**
 * What the editor looks like at the moment the palette opens. Commands read it
 * to say whether they apply — "Bring to front" is meaningless with nothing
 * selected, and every drawing command is meaningless to a viewer.
 */
export interface CommandContext {
  readOnly: boolean;
  /** Read-only by choice, with the hand as the only tool. Implies `readOnly`. */
  viewMode: boolean;
  selectionCount: number;
  /**
   * The selection less its locked shapes — what an edit can change. A locked
   * shape can still be selected, by a right-click, to be unlocked or copied.
   */
  editableSelectionCount: number;
  canFlipSelection: boolean;
  shapeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  /** False on a board this account may edit but not retitle. */
  canRename: boolean;
  /** An account to keep a library in: false for a share-link guest. */
  canUseLibrary: boolean;
  /** There is something for Copy as to copy: a selection, or a board with shapes showing. */
  canCopyAs: boolean;
  /** That, and this browser can put an image on the clipboard. */
  canCopyAsPng: boolean;
  /** Among what Copy as would copy, something has words. */
  canCopyAsText: boolean;
  /** Among what Copy as would copy, a box or an arrow tied at both ends. */
  canCopyAsMermaid: boolean;
  /**
   * Runs this board's sharing — its owner, or whoever runs its workspace. The
   * links to the board are theirs to hand out; nobody else is offered them.
   */
  canShareLinks: boolean;
  /**
   * There is an account in this window. False on the board kept in this
   * browser, which has no settings to open and nobody to sign out.
   */
  hasAccount: boolean;
}

export interface CommandMeta {
  readonly id: CommandId;
  readonly labelKey: TranslationKey;
  readonly icon: CommandIcon;
  readonly category: CommandCategory;
  /** Key combo in the `mod+o` notation of help/platform. */
  readonly shortcut?: string;
  /** Matched against alongside the label, but never shown. English, whatever the language. */
  readonly keywords?: readonly string[];
  readonly destructive?: boolean;
  /**
   * Whether the command applies right now. A command that does not is left out
   * of the list entirely rather than shown greyed: a palette is a place you
   * type at, and dead rows there are just noise between you and a match.
   */
  readonly available?: (context: CommandContext) => boolean;
}

const canEdit = (context: CommandContext) => !context.readOnly;
const hasSelection = (context: CommandContext) =>
  !context.readOnly && context.editableSelectionCount > 0;
/** The z-order operations act on one shape; the document ignores them otherwise. */
const hasOneSelected = (context: CommandContext) =>
  !context.readOnly && context.selectionCount === 1 && context.editableSelectionCount === 1;
const hasShapes = (context: CommandContext) => context.shapeCount > 0;
const canFlipSelection = (context: CommandContext) => !context.readOnly && context.canFlipSelection;

/** Extra words a tool answers to beyond its own name. */
const TOOL_KEYWORDS: Partial<Record<Tool, readonly string[]>> = {
  hand: ['pan', 'scroll', 'move canvas'],
  select: ['pointer', 'cursor', 'arrow'],
  rectangle: ['square', 'box'],
  ellipse: ['circle', 'oval', 'round'],
  diamond: ['rhombus', 'kite'],
  line: ['segment', 'straight'],
  arrow: ['connector', 'pointer', 'link'],
  freehand: ['pencil', 'draw', 'sketch', 'pen'],
  comment: ['note', 'feedback', 'pin', 'thread', 'review', 'annotate'],
  sketch: ['recognise', 'recognize', 'shape', 'convert'],
  text: ['type', 'label', 'write', 'font'],
  image: ['picture', 'photo', 'upload', 'insert'],
  frame: ['artboard', 'section', 'group'],
  laser: ['pointer', 'present', 'highlight'],
  eraser: ['remove', 'rub out'],
};

function fromMenu(
  id: MenuBackedCommandId,
  category: CommandCategory,
  keywords: readonly string[],
  available?: (context: CommandContext) => boolean,
): CommandMeta {
  const { labelKey, icon, shortcut, destructive } = MENU_ITEMS[id];
  return { id, labelKey, icon, category, shortcut, keywords, destructive, available };
}

const TOOL_COMMANDS: readonly CommandMeta[] = TOOLS.map((tool) => ({
  id: `tool:${tool.id}` as const,
  labelKey: tool.labelKey,
  icon: tool.icon,
  category: 'Tools' as const,
  // The toolbar advertises the letter; the digit works too but two hints on
  // one row reads as a combination rather than as a choice.
  shortcut: tool.shortcut.toLowerCase(),
  keywords: ['tool', ...(TOOL_KEYWORDS[tool.id] ?? [])],
  // Matching the toolbar, which drops the drawing tools for a viewer rather
  // than disabling them. View mode keeps the hand and nothing else.
  available: (context) =>
    context.viewMode
      ? tool.id === VIEW_MODE_TOOL
      : VIEW_ONLY_TOOLS.has(tool.id) || canEdit(context),
}));

/**
 * Every command the palette can offer, in the order it lists them within a
 * category. Metadata only — nothing here knows how to run, which is what lets
 * it be a plain table that a test can read.
 */
export const COMMANDS: readonly CommandMeta[] = [
  ...TOOL_COMMANDS,

  {
    id: 'zoomIn',
    labelKey: 'commands.zoomIn',
    icon: ZoomIn,
    category: 'View',
    shortcut: 'mod+=',
    keywords: ['magnify', 'closer', 'bigger'],
  },
  {
    id: 'zoomOut',
    labelKey: 'commands.zoomOut',
    icon: ZoomOut,
    category: 'View',
    shortcut: 'mod+-',
    keywords: ['shrink', 'further', 'smaller'],
  },
  {
    id: 'zoomTo100',
    labelKey: 'commands.zoomTo100',
    icon: Focus,
    category: 'View',
    shortcut: 'mod+1',
    keywords: ['reset zoom', 'actual size', 'default'],
  },
  {
    id: 'zoomToFit',
    labelKey: 'commands.zoomToFit',
    icon: Expand,
    category: 'View',
    shortcut: 'mod+2',
    keywords: ['fit all', 'show everything', 'overview'],
    available: hasShapes,
  },
  {
    id: 'zoomToSelection',
    labelKey: 'commands.zoomToSelection',
    icon: Crosshair,
    category: 'View',
    shortcut: 'mod+3',
    keywords: ['focus', 'fit selection'],
    available: (context) => context.selectionCount > 0,
  },
  {
    id: 'toggleTheme',
    labelKey: 'commands.toggleTheme',
    icon: SunMoon,
    category: 'View',
    shortcut: 'alt+shift+d',
    keywords: ['dark mode', 'light mode', 'appearance', 'colour scheme', 'color scheme'],
  },
  {
    id: 'toggleFocusMode',
    labelKey: 'commands.toggleFocusMode',
    icon: Maximize,
    category: 'View',
    shortcut: 'alt+z',
    keywords: ['zen', 'hide panels', 'distraction free', 'chrome', 'minimal', 'clean'],
  },
  // No `available`: read-only is what this switches on, so it has to stay
  // offered while read-only, or the palette could enter it and not leave it.
  {
    id: 'toggleViewMode',
    labelKey: 'commands.toggleViewMode',
    icon: Eye,
    category: 'View',
    shortcut: 'alt+r',
    keywords: ['read only', 'look', 'present', 'lock editing', 'viewer'],
  },
  {
    id: 'toggleCanvasStats',
    labelKey: 'commands.toggleCanvasStats',
    icon: ChartColumn,
    category: 'View',
    shortcut: 'alt+/',
    keywords: ['properties', 'dimensions', 'coordinates', 'position', 'size', 'width', 'height'],
  },
  {
    id: 'toggleComments',
    labelKey: 'commands.toggleComments',
    icon: MessageSquare,
    category: 'View',
    shortcut: 'shift+c',
    keywords: ['pins', 'threads', 'feedback', 'notes', 'review'],
  },

  {
    id: 'undo',
    labelKey: 'commands.undo',
    icon: Undo2,
    category: 'Edit',
    shortcut: 'mod+z',
    keywords: ['revert', 'back'],
    available: (context) => !context.readOnly && context.canUndo,
  },
  {
    id: 'redo',
    labelKey: 'commands.redo',
    icon: Redo2,
    category: 'Edit',
    shortcut: 'mod+shift+z',
    keywords: ['forward', 'again'],
    available: (context) => !context.readOnly && context.canRedo,
  },
  {
    id: 'cut',
    labelKey: 'commands.cut',
    icon: Scissors,
    category: 'Edit',
    shortcut: 'mod+x',
    keywords: ['clipboard'],
    available: hasSelection,
  },
  {
    id: 'copy',
    labelKey: 'commands.copy',
    icon: Copy,
    category: 'Edit',
    shortcut: 'mod+c',
    keywords: ['clipboard', 'duplicate'],
    available: (context) => context.selectionCount > 0,
  },
  {
    id: 'paste',
    labelKey: 'commands.paste',
    icon: ClipboardPaste,
    category: 'Edit',
    shortcut: 'mod+v',
    keywords: ['clipboard', 'insert'],
    available: canEdit,
  },
  {
    id: 'duplicate',
    labelKey: 'commands.duplicate',
    icon: CopyPlus,
    category: 'Edit',
    shortcut: 'mod+d',
    keywords: ['clone', 'copy'],
    // Locked shapes too: the copies come out unlocked, and the originals are
    // not touched.
    available: (context) => !context.readOnly && context.selectionCount > 0,
  },
  {
    id: 'selectAll',
    labelKey: 'commands.selectAll',
    icon: BoxSelect,
    category: 'Edit',
    shortcut: 'mod+a',
    keywords: ['everything'],
    available: (context) => !context.readOnly && context.shapeCount > 0,
  },
  {
    id: 'deleteSelection',
    labelKey: 'commands.deleteSelection',
    icon: Trash2,
    category: 'Edit',
    shortcut: 'delete',
    keywords: ['remove', 'erase', 'clear'],
    destructive: true,
    available: hasSelection,
  },

  {
    id: 'editLink',
    // Short, so typing "link" reaches it ahead of Copy board link: with a
    // shape selected it is the link that is meant.
    labelKey: 'commands.editLink',
    icon: Link,
    category: 'Edit',
    shortcut: 'mod+k',
    keywords: ['add link', 'url', 'hyperlink', 'website', 'address', 'web', 'email'],
    // One shape: the box it opens belongs to a single shape.
    available: hasOneSelected,
  },
  {
    id: 'copyLinkToSelection',
    labelKey: 'commands.copyLinkToSelection',
    icon: Link2,
    category: 'Edit',
    keywords: ['share', 'url', 'point to', 'shapes', 'deep link', 'go to'],
    // A link to the board is for those who run its sharing to hand out.
    available: (context) => context.canShareLinks && context.selectionCount > 0,
  },
  // Copying changes nothing, so a viewer may do all five. Each covers the
  // selection, or the board when nothing is selected.
  {
    id: 'copyAsPng',
    labelKey: 'commands.copyAsPng',
    icon: FileImage,
    category: 'Edit',
    shortcut: 'alt+shift+c',
    keywords: ['image', 'picture', 'screenshot', 'bitmap', 'clipboard'],
    available: (context) => context.canCopyAsPng,
  },
  {
    id: 'copyAsSvg',
    labelKey: 'commands.copyAsSvg',
    icon: FileCode,
    category: 'Edit',
    keywords: ['vector', 'image', 'picture', 'markup', 'clipboard'],
    available: (context) => context.canCopyAs,
  },
  {
    id: 'copyAsText',
    labelKey: 'commands.copyAsText',
    icon: Type,
    category: 'Edit',
    keywords: ['words', 'plain text', 'labels', 'writing', 'clipboard'],
    available: (context) => context.canCopyAsText,
  },
  {
    id: 'copyAsMermaid',
    labelKey: 'commands.copyAsMermaid',
    icon: Workflow,
    category: 'Edit',
    keywords: ['code', 'diagram', 'flowchart', 'chart', 'markdown', 'clipboard'],
    available: (context) => context.canCopyAsMermaid,
  },
  {
    id: 'copyAsJson',
    labelKey: 'commands.copyAsJson',
    icon: Braces,
    category: 'Edit',
    keywords: ['data', 'code', 'shapes', 'raw', 'clipboard'],
    available: (context) => context.canCopyAs,
  },
  {
    id: 'toggleLock',
    labelKey: 'commands.toggleLock',
    icon: Lock,
    category: 'Edit',
    shortcut: 'shift+l',
    keywords: ['lock', 'unlock', 'freeze', 'protect', 'pin down'],
    available: (context) => !context.readOnly && context.selectionCount > 0,
  },
  {
    id: 'unlockAll',
    labelKey: 'commands.unlockAll',
    icon: LockOpen,
    category: 'Edit',
    keywords: ['lock', 'unlock', 'free', 'everything'],
    // Offered whenever there is something on the board, whether or not any of
    // it is locked: a row that comes and goes is one you cannot learn the
    // place of.
    available: (context) => !context.readOnly && context.shapeCount > 0,
  },
  {
    id: 'hideSelection',
    labelKey: 'commands.hideSelection',
    icon: EyeOff,
    category: 'Edit',
    shortcut: 'mod+shift+h',
    keywords: ['hide', 'invisible', 'conceal', 'visibility'],
    available: (context) => !context.readOnly && context.selectionCount > 0,
  },
  {
    id: 'showAll',
    labelKey: 'commands.showAll',
    icon: Eye,
    category: 'Edit',
    keywords: ['show all', 'unhide', 'reveal', 'visibility'],
    // Like Unlock all: there whenever the board has shapes, hidden or not.
    available: (context) => !context.readOnly && context.shapeCount > 0,
  },
  {
    id: 'addToLibrary',
    labelKey: 'commands.addToLibrary',
    icon: BookPlus,
    category: 'Edit',
    keywords: ['library', 'save', 'keep', 'reuse', 'component', 'template', 'stencil'],
    // The library is the account's, not the board's, so a viewer may keep
    // something from a board they cannot change.
    available: (context) => context.canUseLibrary && context.selectionCount > 0,
  },

  {
    id: 'bringForward',
    labelKey: 'commands.bringForward',
    icon: MoveUp,
    category: 'Arrange',
    shortcut: ']',
    keywords: ['layer', 'up', 'raise', 'z-order'],
    available: hasOneSelected,
  },
  {
    id: 'sendBackward',
    labelKey: 'commands.sendBackward',
    icon: MoveDown,
    category: 'Arrange',
    shortcut: '[',
    keywords: ['layer', 'down', 'lower', 'z-order'],
    available: hasOneSelected,
  },
  {
    id: 'bringToFront',
    labelKey: 'commands.bringToFront',
    icon: ArrowUpToLine,
    category: 'Arrange',
    shortcut: 'mod+]',
    keywords: ['layer', 'top', 'z-order'],
    available: hasOneSelected,
  },
  {
    id: 'sendToBack',
    labelKey: 'commands.sendToBack',
    icon: ArrowDownToLine,
    category: 'Arrange',
    shortcut: 'mod+[',
    keywords: ['layer', 'bottom', 'z-order'],
    available: hasOneSelected,
  },

  {
    id: 'flipHorizontal',
    labelKey: 'commands.flipHorizontal',
    icon: FlipHorizontal,
    category: 'Arrange',
    shortcut: 'shift+h',
    keywords: ['mirror', 'reflect', 'horizontal'],
    available: canFlipSelection,
  },
  {
    id: 'flipVertical',
    labelKey: 'commands.flipVertical',
    icon: FlipVertical,
    category: 'Arrange',
    shortcut: 'shift+v',
    keywords: ['mirror', 'reflect', 'vertical'],
    available: canFlipSelection,
  },

  fromMenu('open', 'Board', ['load', 'file', 'import']),
  fromMenu('saveTo', 'Board', ['download', 'file', 'export']),
  fromMenu('exportImage', 'Board', ['png', 'svg', 'picture', 'download']),
  fromMenu(
    'renameBoard',
    'Board',
    ['title', 'name', 'colour', 'color'],
    (context) => context.canRename,
  ),
  fromMenu('liveCollaboration', 'Board', ['share', 'invite', 'multiplayer', 'collaborate']),
  fromMenu('copyLink', 'Board', ['url', 'share', 'clipboard'], (context) => context.canShareLinks),
  // Last in its category, as it is in the sidebar: it is the one entry here
  // that discards work.
  //
  // Offered on an empty board as well as a full one. It returns the view to
  // where a new board starts as well as clearing it, so it still does
  // something with nothing on the canvas — and a row that comes and goes with
  // the shape count is a row you cannot learn the place of.
  fromMenu(
    'resetCanvas',
    'Board',
    ['clear', 'empty', 'wipe', 'delete all', 'start over', 'blank'],
    canEdit,
  ),

  fromMenu('findOnCanvas', 'App', ['search', 'text', 'locate']),
  fromMenu('help', 'App', ['shortcuts', 'keyboard', 'keys', 'support']),
  fromMenu(
    'settings',
    'App',
    ['preferences', 'account', 'profile', 'options'],
    (context) => context.hasAccount,
  ),
  fromMenu(
    'signOut',
    'App',
    ['sign out', 'signout', 'logout', 'leave', 'exit'],
    (context) => context.hasAccount,
  ),
];

/** Every command by id, for resolving a stored list of recents. */
export const COMMANDS_BY_ID: ReadonlyMap<CommandId, CommandMeta> = new Map(
  COMMANDS.map((command) => [command.id, command]),
);
