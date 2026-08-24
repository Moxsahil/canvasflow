import {
  CircleQuestionMark,
  CircleUser,
  Command,
  Files,
  FolderOpen,
  Frame,
  ImageDown,
  Link2,
  LogOut,
  Pencil,
  Save,
  Search,
  Settings2,
  Share2,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type MenuItemId =
  | 'renameBoard'
  | 'open'
  | 'saveTo'
  | 'exportImage'
  | 'liveCollaboration'
  | 'copyLink'
  | 'resetCanvas'
  | 'commandPalette'
  | 'findOnCanvas'
  | 'help'
  | 'preferences'
  | 'profile'
  | 'signOut';

export interface MenuItemMeta {
  readonly id: MenuItemId;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Key combo in the `mod+o` notation of help/platform, formatted for display. */
  readonly shortcut?: string;
  /** Renders in the danger colour and sits alone in its group. */
  readonly destructive?: boolean;
}

/**
 * Every entry the menu can show, in one place — the labels and shortcut hints
 * are the whole vocabulary of the menu, so the rail, the board dropdown and
 * the account dropdown all read from here rather than inlining strings.
 *
 * Nothing here says whether an item is usable: an item is live exactly when
 * the caller passes a handler for it (see `MenuActions`), and renders disabled
 * with a "soon" badge otherwise. That keeps the menu visually complete while
 * the features behind it land one at a time.
 */
export const MENU_ITEMS: Readonly<Record<MenuItemId, MenuItemMeta>> = {
  open: { id: 'open', label: 'Open', icon: FolderOpen, shortcut: 'mod+o' },
  saveTo: { id: 'saveTo', label: 'Save to…', icon: Save, shortcut: 'mod+s' },
  // The ellipsis is the promise of a dialog: this one also carries the board's
  // colour tag, which is more than the label alone would lead you to expect.
  renameBoard: { id: 'renameBoard', label: 'Rename board…', icon: Pencil },
  exportImage: {
    id: 'exportImage',
    label: 'Export image…',
    icon: ImageDown,
    shortcut: 'mod+shift+e',
  },
  liveCollaboration: { id: 'liveCollaboration', label: 'Live collaboration…', icon: Users },
  copyLink: { id: 'copyLink', label: 'Copy board link', icon: Link2 },
  resetCanvas: { id: 'resetCanvas', label: 'Reset the canvas', icon: Trash2, destructive: true },
  commandPalette: {
    id: 'commandPalette',
    label: 'Command palette',
    icon: Command,
    shortcut: 'mod+/',
  },
  findOnCanvas: { id: 'findOnCanvas', label: 'Find on canvas', icon: Search, shortcut: 'mod+f' },
  // Spelled with the modifier because that's what you actually press — the
  // handler accepts Shift+/ as well as a bare '?' from layouts that have one.
  help: { id: 'help', label: 'Help', icon: CircleQuestionMark, shortcut: 'shift+?' },
  preferences: { id: 'preferences', label: 'Preferences', icon: Settings2 },
  profile: { id: 'profile', label: 'Profile', icon: CircleUser },
  signOut: { id: 'signOut', label: 'Sign out', icon: LogOut },
};

export interface MenuSection {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly items: readonly MenuItemId[];
  /** Expanded on first render. Only the first section is, as the design has it. */
  readonly defaultOpen?: boolean;
}

/**
 * The sidebar body: a named, collapsible section per group of actions, each
 * expanding to its own items.
 *
 * Board-level actions sit here rather than behind the board badge: a menu you
 * have to discover by clicking a board id isn't a menu. Reset stays last within
 * its section — it is the one entry that discards work.
 */
export const SIDEBAR_SECTIONS: readonly MenuSection[] = [
  {
    id: 'board',
    label: 'Board',
    icon: Files,
    defaultOpen: true,
    items: ['open', 'saveTo', 'exportImage', 'renameBoard'],
  },
  { id: 'share', label: 'Share', icon: Share2, items: ['liveCollaboration', 'copyLink'] },
  {
    id: 'canvas',
    label: 'Canvas',
    icon: Frame,
    items: ['commandPalette', 'findOnCanvas', 'resetCanvas'],
  },
];

/** Rows that stand on their own, under the sections. */
export const SIDEBAR_ITEMS: readonly MenuItemId[] = ['help'];

/** Account actions, behind the avatar at the bottom of the sidebar. */
export const ACCOUNT_MENU_GROUPS: readonly (readonly MenuItemId[])[] = [['profile'], ['signOut']];

/**
 * Handlers for menu items. An item with no entry here renders disabled — so
 * wiring a feature up later is a one-line change at the call site, with no
 * edit to the menu itself.
 */
export type MenuActions = Partial<Record<MenuItemId, () => void>>;
