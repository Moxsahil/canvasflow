import type { TranslationKey } from '../i18n';

/**
 * Every choice the preferences menu offers.
 *
 * All of them are booleans on purpose — that is what lets the menu render its
 * items from a table rather than writing each one out, and what keeps adding a
 * preference to one entry here and one in `PREFERENCE_GROUPS`.
 */
export interface EditorPreferences {
  showGrid: boolean;
  snapToObjects: boolean;
  snapToMidpoints: boolean;
  edgeScrolling: boolean;
  toolLock: boolean;
  selectOnWrap: boolean;
  arrowBinding: boolean;
  dynamicSize: boolean;
  pasteAtCursor: boolean;
  penMode: boolean;
  focusMode: boolean;
  viewMode: boolean;
  floatingStyleBar: boolean;
  canvasStats: boolean;
  showComments: boolean;
  debugMode: boolean;
}

export type PreferenceId = keyof EditorPreferences;

/**
 * What a board starts with.
 *
 * The five that start on are the ones whose absence people read as a bug
 * rather than as a setting: an arrow that won't follow the shape it points at,
 * a drag that stops dead at the edge of the viewport, a comment somebody left
 * that is nowhere to be seen. The rest start off
 * because they change what the canvas does under you, and a canvas that
 * behaves plainly is the one to arrive at.
 */
export const DEFAULT_PREFERENCES: EditorPreferences = {
  showGrid: false,
  snapToObjects: false,
  snapToMidpoints: true,
  edgeScrolling: true,
  toolLock: false,
  selectOnWrap: true,
  arrowBinding: true,
  dynamicSize: false,
  pasteAtCursor: false,
  penMode: false,
  focusMode: false,
  viewMode: false,
  floatingStyleBar: false,
  canvasStats: false,
  showComments: true,
  debugMode: false,
};

export const PREFERENCES_STORAGE_KEY = 'cf:preferences';

/**
 * The stored preferences, laid over the defaults.
 *
 * Anything unrecognised is dropped rather than kept: a preference removed in a
 * later version would otherwise sit in storage forever, and one whose value
 * has been hand-edited to something that isn't a boolean would flow straight
 * into a checkbox as an uncontrolled value.
 */
export function readPreferences(): EditorPreferences {
  try {
    const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!stored) return DEFAULT_PREFERENCES;

    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFERENCES;

    const values = { ...DEFAULT_PREFERENCES };
    for (const key of Object.keys(DEFAULT_PREFERENCES) as PreferenceId[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === 'boolean') values[key] = value;
    }
    return values;
  } catch {
    // Unreadable storage just means this session starts from the defaults.
    return DEFAULT_PREFERENCES;
  }
}

export function storePreferences(values: EditorPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // The choices just won't survive a reload.
  }
}

export const PEN_SEEN_STORAGE_KEY = 'cf:pen-seen';

/**
 * Whether a pen has touched this device's screen before.
 *
 * Kept apart from the preferences because it is not a choice: it is what lets
 * the first pen put pen mode on by itself, once, and then leave it to the
 * person. Turned off after that, pen mode stays off.
 */
export function readPenSeen(): boolean {
  try {
    return localStorage.getItem(PEN_SEEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function storePenSeen(): void {
  try {
    localStorage.setItem(PEN_SEEN_STORAGE_KEY, '1');
  } catch {
    // The next pen will put pen mode on again, which is the right way round.
  }
}

export interface PreferenceItemMeta {
  readonly id: PreferenceId;
  readonly labelKey: TranslationKey;
  /** Key combo in the `mod+o` notation of help/platform, formatted for display. */
  readonly shortcut?: string;
  /**
   * What the preference does, for the item's tooltip. A menu has room for a
   * name and nothing else, and half of these names — "dynamic size", "select on
   * wrap" — mean nothing until they are spelled out somewhere.
   */
  readonly hintKey: TranslationKey;
}

export interface PreferenceGroupMeta {
  readonly id: string;
  readonly items: readonly PreferenceItemMeta[];
}

/**
 * The menu, in the order it reads. The groups are separated by a rule and
 * nothing else — they divide the list by what a preference acts on without
 * spending a row each on saying so.
 */
export const PREFERENCE_GROUPS: readonly PreferenceGroupMeta[] = [
  {
    id: 'canvas',
    items: [
      {
        id: 'showGrid',
        labelKey: 'preferences.showGrid',
        shortcut: "mod+'",
        hintKey: 'preferences.showGrid.hint',
      },
      {
        id: 'snapToObjects',
        labelKey: 'preferences.snapToObjects',
        shortcut: 'alt+s',
        hintKey: 'preferences.snapToObjects.hint',
      },

      {
        id: 'edgeScrolling',
        labelKey: 'preferences.edgeScrolling',
        hintKey: 'preferences.edgeScrolling.hint',
      },
    ],
  },
  {
    id: 'drawing',
    items: [
      {
        id: 'toolLock',
        labelKey: 'preferences.toolLock',
        shortcut: 'q',
        hintKey: 'preferences.toolLock.hint',
      },
      {
        id: 'selectOnWrap',
        labelKey: 'preferences.selectOnWrap',
        hintKey: 'preferences.selectOnWrap.hint',
      },
      {
        id: 'arrowBinding',
        labelKey: 'preferences.arrowBinding',
        hintKey: 'preferences.arrowBinding.hint',
      },
      {
        id: 'dynamicSize',
        labelKey: 'preferences.dynamicSize',
        hintKey: 'preferences.dynamicSize.hint',
      },
      {
        id: 'pasteAtCursor',
        labelKey: 'preferences.pasteAtCursor',
        hintKey: 'preferences.pasteAtCursor.hint',
      },
      {
        id: 'penMode',
        labelKey: 'preferences.penMode',
        hintKey: 'preferences.penMode.hint',
      },
    ],
  },
  {
    id: 'view',
    items: [
      {
        id: 'focusMode',
        labelKey: 'preferences.focusMode',
        shortcut: 'alt+z',
        hintKey: 'preferences.focusMode.hint',
      },
      {
        id: 'viewMode',
        labelKey: 'preferences.viewMode',
        shortcut: 'alt+r',
        hintKey: 'preferences.viewMode.hint',
      },
      {
        id: 'floatingStyleBar',
        labelKey: 'preferences.floatingStyleBar',
        hintKey: 'preferences.floatingStyleBar.hint',
      },
      {
        id: 'canvasStats',
        labelKey: 'preferences.canvasStats',
        shortcut: 'alt+/',
        hintKey: 'preferences.canvasStats.hint',
      },
      {
        id: 'showComments',
        labelKey: 'preferences.showComments',
        shortcut: 'shift+c',
        hintKey: 'preferences.showComments.hint',
      },
      {
        id: 'debugMode',
        labelKey: 'preferences.debugMode',
        hintKey: 'preferences.debugMode.hint',
      },
    ],
  },
];
