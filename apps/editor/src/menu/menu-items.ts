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
import type { TranslationKey } from '../i18n';

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
  readonly labelKey: TranslationKey;
  readonly icon: LucideIcon;
  /** Key combo in the `mod+o` notation of help/platform, formatted for display. */
  readonly shortcut?: string;
  /** Renders in the danger colour and sits alone in its group. */
  readonly destructive?: boolean;
}

/**
 * Every entry the menu can show, in one place — the labels' keys and shortcut
 * hints are the whole vocabulary of the menu, so the rail, the board dropdown and
 * the account dropdown all read from here rather than inlining strings.
 *
 * Nothing here says whether an item is usable: an item is live exactly when
 * the caller passes a handler for it (see `MenuActions`), and renders disabled
 * with a "soon" badge otherwise. That keeps the menu visually complete while
 * the features behind it land one at a time.
 */
export const MENU_ITEMS: Readonly<Record<MenuItemId, MenuItemMeta>> = {
  open: { id: 'open', labelKey: 'menu.open', icon: FolderOpen, shortcut: 'mod+o' },
  saveTo: { id: 'saveTo', labelKey: 'menu.saveTo', icon: Save, shortcut: 'mod+s' },
  // The ellipsis is the promise of a dialog: this one also carries the board's
  // colour tag, which is more than the label alone would lead you to expect.
  renameBoard: { id: 'renameBoard', labelKey: 'menu.renameBoard', icon: Pencil },
  exportImage: {
    id: 'exportImage',
    labelKey: 'menu.exportImage',
    icon: ImageDown,
    shortcut: 'mod+shift+e',
  },
  liveCollaboration: { id: 'liveCollaboration', labelKey: 'menu.liveCollaboration', icon: Users },
  copyLink: { id: 'copyLink', labelKey: 'menu.copyLink', icon: Link2 },
  resetCanvas: { id: 'resetCanvas', labelKey: 'menu.resetCanvas', icon: Trash2, destructive: true },
  commandPalette: {
    id: 'commandPalette',
    labelKey: 'menu.commandPalette',
    icon: Command,
    shortcut: 'mod+/',
  },
  findOnCanvas: {
    id: 'findOnCanvas',
    labelKey: 'menu.findOnCanvas',
    icon: Search,
    shortcut: 'mod+f',
  },
  // Spelled with the modifier because that's what you actually press — the
  // handler accepts Shift+/ as well as a bare '?' from layouts that have one.
  help: { id: 'help', labelKey: 'menu.help', icon: CircleQuestionMark, shortcut: 'shift+?' },
  preferences: { id: 'preferences', labelKey: 'menu.preferences', icon: Settings2 },
  settings: { id: 'settings', labelKey: 'menu.settings', icon: Settings },
  signOut: { id: 'signOut', labelKey: 'menu.signOut', icon: LogOut, destructive: true },
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

export interface LearnMoreItem {
  readonly id: string;
  readonly labelKey: TranslationKey;
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
  [{ id: 'about', labelKey: 'menu.learnMore.about', icon: ExternalLink, path: '/' }],
  [
    { id: 'usagePolicy', labelKey: 'menu.learnMore.usagePolicy', icon: ExternalLink },
    {
      id: 'privacyPolicy',
      labelKey: 'menu.learnMore.privacyPolicy',
      icon: ExternalLink,
      path: '/privacy',
    },
    {
      id: 'termsOfService',
      labelKey: 'menu.learnMore.termsOfService',
      icon: ExternalLink,
      path: '/terms',
    },
    { id: 'privacyChoices', labelKey: 'menu.learnMore.privacyChoices' },
  ],
  // The shortcuts dialog is what Help opens: the one action it has.
  [
    {
      id: 'keyboardShortcuts',
      labelKey: 'menu.learnMore.keyboardShortcuts',
      icon: Keyboard,
      action: 'help',
    },
  ],
];

/**
 * Handlers for menu items, in four states:
 *
 * - a function — the item is live.
 * - `false` — not for this person at all: copying the board's link, for
 *   someone who does not run its sharing. The item is left out.
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
export type MenuActions = Partial<Record<MenuItemId, (() => void) | null | false>>;

/**
 * A handler as a row takes it: `false` — not offered to this person — reads
 * as disabled for any row that cannot leave itself out.
 */
export function liveAction(action: MenuActions[MenuItemId]): (() => void) | null | undefined {
  return action === false ? null : action;
}
