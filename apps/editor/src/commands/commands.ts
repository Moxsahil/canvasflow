import {
  ArrowDownToLine,
  ArrowUpToLine,
  BoxSelect,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crosshair,
  Expand,
  Focus,
  MoveDown,
  MoveUp,
  Redo2,
  Scissors,
  SunMoon,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { MENU_ITEMS, type MenuItemId } from '../menu/menu-items';
import { TOOLS, VIEW_ONLY_TOOLS, type Tool } from '../tools/tool';

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
  | 'sendToBack';

/** Array order is the order the palette lists the groups in. */
export const COMMAND_CATEGORIES = ['Tools', 'View', 'Edit', 'Arrange', 'Board', 'App'] as const;

export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

/**
 * What the editor looks like at the moment the palette opens. Commands read it
 * to say whether they apply — "Bring to front" is meaningless with nothing
 * selected, and every drawing command is meaningless to a viewer.
 */
export interface CommandContext {
  readOnly: boolean;
  selectionCount: number;
  shapeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  /** False on a board this account may edit but not retitle. */
  canRename: boolean;
}

export interface CommandMeta {
  readonly id: CommandId;
  readonly label: string;
  readonly icon: CommandIcon;
  readonly category: CommandCategory;
  /** Key combo in the `mod+o` notation of help/platform. */
  readonly shortcut?: string;
  /** Matched against alongside the label, but never shown. */
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
const hasSelection = (context: CommandContext) => !context.readOnly && context.selectionCount > 0;
/** The z-order operations act on one shape; the document ignores them otherwise. */
const hasOneSelected = (context: CommandContext) =>
  !context.readOnly && context.selectionCount === 1;
const hasShapes = (context: CommandContext) => context.shapeCount > 0;

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
  const { label, icon, shortcut, destructive } = MENU_ITEMS[id];
  return { id, label, icon, category, shortcut, keywords, destructive, available };
}

const TOOL_COMMANDS: readonly CommandMeta[] = TOOLS.map((tool) => ({
  id: `tool:${tool.id}` as const,
  label: tool.label,
  icon: tool.icon,
  category: 'Tools' as const,
  // The toolbar advertises the letter; the digit works too but two hints on
  // one row reads as a combination rather than as a choice.
  shortcut: tool.shortcut.toLowerCase(),
  keywords: ['tool', ...(TOOL_KEYWORDS[tool.id] ?? [])],
  // Matching the toolbar, which drops the drawing tools for a viewer rather
  // than disabling them.
  available: VIEW_ONLY_TOOLS.has(tool.id) ? undefined : canEdit,
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
    label: 'Zoom in',
    icon: ZoomIn,
    category: 'View',
    shortcut: 'mod+=',
    keywords: ['magnify', 'closer', 'bigger'],
  },
  {
    id: 'zoomOut',
    label: 'Zoom out',
    icon: ZoomOut,
    category: 'View',
    shortcut: 'mod+-',
    keywords: ['shrink', 'further', 'smaller'],
  },
  {
    id: 'zoomTo100',
    label: 'Zoom to 100%',
    icon: Focus,
    category: 'View',
    shortcut: 'mod+1',
    keywords: ['reset zoom', 'actual size', 'default'],
  },
  {
    id: 'zoomToFit',
    label: 'Zoom to fit',
    icon: Expand,
    category: 'View',
    shortcut: 'mod+2',
    keywords: ['fit all', 'show everything', 'overview'],
    available: hasShapes,
  },
  {
    id: 'zoomToSelection',
    label: 'Zoom to selection',
    icon: Crosshair,
    category: 'View',
    shortcut: 'mod+3',
    keywords: ['focus', 'fit selection'],
    available: (context) => context.selectionCount > 0,
  },
  {
    id: 'toggleTheme',
    label: 'Toggle light / dark theme',
    icon: SunMoon,
    category: 'View',
    shortcut: 'alt+shift+d',
    keywords: ['dark mode', 'light mode', 'appearance', 'colour scheme', 'color scheme'],
  },

  {
    id: 'undo',
    label: 'Undo',
    icon: Undo2,
    category: 'Edit',
    shortcut: 'mod+z',
    keywords: ['revert', 'back'],
    available: (context) => !context.readOnly && context.canUndo,
  },
  {
    id: 'redo',
    label: 'Redo',
    icon: Redo2,
    category: 'Edit',
    shortcut: 'mod+shift+z',
    keywords: ['forward', 'again'],
    available: (context) => !context.readOnly && context.canRedo,
  },
  {
    id: 'cut',
    label: 'Cut selection',
    icon: Scissors,
    category: 'Edit',
    shortcut: 'mod+x',
    keywords: ['clipboard'],
    available: hasSelection,
  },
  {
    id: 'copy',
    label: 'Copy selection',
    icon: Copy,
    category: 'Edit',
    shortcut: 'mod+c',
    keywords: ['clipboard', 'duplicate'],
    available: (context) => context.selectionCount > 0,
  },
  {
    id: 'paste',
    label: 'Paste',
    icon: ClipboardPaste,
    category: 'Edit',
    shortcut: 'mod+v',
    keywords: ['clipboard', 'insert'],
    available: canEdit,
  },
  {
    id: 'duplicate',
    label: 'Duplicate selection',
    icon: CopyPlus,
    category: 'Edit',
    shortcut: 'mod+d',
    keywords: ['clone', 'copy'],
    available: hasSelection,
  },
  {
    id: 'selectAll',
    label: 'Select all',
    icon: BoxSelect,
    category: 'Edit',
    shortcut: 'mod+a',
    keywords: ['everything'],
    available: (context) => !context.readOnly && context.shapeCount > 0,
  },
  {
    id: 'deleteSelection',
    label: 'Delete selection',
    icon: Trash2,
    category: 'Edit',
    shortcut: 'delete',
    keywords: ['remove', 'erase', 'clear'],
    destructive: true,
    available: hasSelection,
  },

  {
    id: 'bringForward',
    label: 'Bring forward',
    icon: MoveUp,
    category: 'Arrange',
    shortcut: ']',
    keywords: ['layer', 'up', 'raise', 'z-order'],
    available: hasOneSelected,
  },
  {
    id: 'sendBackward',
    label: 'Send backward',
    icon: MoveDown,
    category: 'Arrange',
    shortcut: '[',
    keywords: ['layer', 'down', 'lower', 'z-order'],
    available: hasOneSelected,
  },
  {
    id: 'bringToFront',
    label: 'Bring to front',
    icon: ArrowUpToLine,
    category: 'Arrange',
    shortcut: 'mod+]',
    keywords: ['layer', 'top', 'z-order'],
    available: hasOneSelected,
  },
  {
    id: 'sendToBack',
    label: 'Send to back',
    icon: ArrowDownToLine,
    category: 'Arrange',
    shortcut: 'mod+[',
    keywords: ['layer', 'bottom', 'z-order'],
    available: hasOneSelected,
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
  fromMenu('copyLink', 'Board', ['url', 'share', 'clipboard']),
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
  fromMenu('settings', 'App', ['preferences', 'account', 'profile', 'options']),
  fromMenu('signOut', 'App', ['log out', 'logout', 'leave', 'exit']),
];

/** Every command by id, for resolving a stored list of recents. */
export const COMMANDS_BY_ID: ReadonlyMap<CommandId, CommandMeta> = new Map(
  COMMANDS.map((command) => [command.id, command]),
);
