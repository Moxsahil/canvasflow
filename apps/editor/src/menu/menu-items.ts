import {
  CircleQuestionMark,
  Command,
  ExternalLink,
  FolderOpen,
  ImageDown,
  Keyboard,
  Link2,
  LogOut,
  Pencil,
  Save,
  Search,
  Settings,
  Settings2,
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
  | 'settings'
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
  settings: { id: 'settings', label: 'Settings', icon: Settings },
  signOut: { id: 'signOut', label: 'Sign out', icon: LogOut },
};

/**
 * The open board's card in the sidebar: the actions people reach for most, as
 * a row of icons under the board's name. Each carries its label as a tooltip
 * and an accessible name.
 */
export const BOARD_CARD_ITEMS: readonly MenuItemId[] = [
  'open',
  'saveTo',
  'exportImage',
  'renameBoard',
  'copyLink',
];

/**
 * The rest of what can be done to the board, behind the card's More button.
 * Reset stays last and on its own — it is the one entry that discards work.
 */
export const BOARD_MORE_GROUPS: readonly (readonly MenuItemId[])[] = [
  ['liveCollaboration', 'findOnCanvas', 'commandPalette'],
  ['resetCanvas'],
];

/** Rows that stand on their own, at the foot of the sidebar. */
export const SIDEBAR_ITEMS: readonly MenuItemId[] = ['help'];

/** Account actions, behind the avatar at the bottom of the sidebar. */
export const ACCOUNT_MENU_GROUPS: readonly (readonly MenuItemId[])[] = [['settings'], ['signOut']];

export interface LanguageOption {
  /** BCP 47, as `<html lang>` would take it. */
  readonly code: string;
  /**
   * In its own language: a language menu is read by someone who may not read
   * the one the app is in right now.
   */
  readonly label: string;
}

/**
 * The account menu's Language list. The editor is only written in English so
 * far, so English is the one choice and the rest read "Soon" until the app
 * is translated.
 */
export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh-CN', label: '中文' },
];

export const CURRENT_LANGUAGE = 'en';

export interface LearnMoreItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  /**
   * A page of the web app, opened in a new tab — the icon of every such row
   * says so. A page row with no path is one not written yet, and reads "Soon".
   */
  readonly path?: string;
  /** Runs one of the menu's own actions instead of opening a page. */
  readonly action?: MenuItemId;
}

/**
 * The account menu's Learn more list, in groups: who makes this, the terms
 * it is offered on, and how to drive it. Only pages the web app actually
 * serves carry a path.
 */
export const LEARN_MORE_GROUPS: readonly (readonly LearnMoreItem[])[] = [
  [{ id: 'about', label: 'About CanvasFlow', icon: ExternalLink, path: '/' }],
  [
    { id: 'usagePolicy', label: 'Usage policy', icon: ExternalLink },
    { id: 'privacyPolicy', label: 'Privacy policy', icon: ExternalLink, path: '/privacy' },
    { id: 'termsOfService', label: 'Terms of service', icon: ExternalLink, path: '/terms' },
    { id: 'privacyChoices', label: 'Your privacy choices' },
  ],
  // The shortcuts dialog is what Help opens: the one action it has.
  [{ id: 'keyboardShortcuts', label: 'Keyboard shortcuts', icon: Keyboard, action: 'help' }],
];

/**
 * Handlers for menu items, in three states:
 *
 * - a function — the item is live.
 * - `null` — the feature exists, but does not apply right now: nothing to
 *   reset on an empty board, nothing to rename without the rights. The row
 *   disables itself and keeps its shortcut hint.
 * - absent — the feature isn't built. The row disables itself and reads
 *   "Soon".
 *
 * The distinction matters because those last two look identical to the caller
 * and must not look identical to the reader: telling someone a shipped
 * feature is "coming soon" because their board happens to be empty is worse
 * than saying nothing at all.
 */
export type MenuActions = Partial<Record<MenuItemId, (() => void) | null>>;
