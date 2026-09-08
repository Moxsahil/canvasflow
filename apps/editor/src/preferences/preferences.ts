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
  zenMode: boolean;
  viewMode: boolean;
  canvasStats: boolean;
  debugMode: boolean;
}

export type PreferenceId = keyof EditorPreferences;

/**
 * What a board starts with.
 *
 * The four that start on are the ones whose absence people read as a bug
 * rather than as a setting: an arrow that won't follow the shape it points at,
 * a drag that stops dead at the edge of the viewport. The rest start off
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
  zenMode: false,
  viewMode: false,
  canvasStats: false,
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

export interface PreferenceItemMeta {
  readonly id: PreferenceId;
  readonly label: string;
  /** Key combo in the `mod+o` notation of help/platform, formatted for display. */
  readonly shortcut?: string;
  /**
   * What the preference does, for the item's tooltip. A menu has room for a
   * name and nothing else, and half of these names — "dynamic size", "select on
   * wrap" — mean nothing until they are spelled out somewhere.
   */
  readonly hint: string;
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
        label: 'Show grid',
        shortcut: "mod+'",
        hint: 'A grid of dots behind the board',
      },
      {
        id: 'snapToObjects',
        label: 'Snap to objects',
        shortcut: 'alt+s',
        hint: 'Line up with nearby shapes as you draw',
      },
      {
        id: 'snapToMidpoints',
        label: 'Snap to midpoints',
        hint: 'Snap to the centre of an edge as well as its ends',
      },
      {
        id: 'edgeScrolling',
        label: 'Edge scrolling',
        hint: 'Pan the board when a drag reaches its edge',
      },
    ],
  },
  {
    id: 'drawing',
    items: [
      {
        id: 'toolLock',
        label: 'Tool lock',
        shortcut: 'q',
        hint: 'Keep the tool after a shape, instead of returning to select',
      },
      {
        id: 'selectOnWrap',
        label: 'Select on wrap',
        hint: 'Take only the shapes a marquee encloses, not every one it touches',
      },
      {
        id: 'arrowBinding',
        label: 'Arrow binding',
        hint: 'Arrows stay attached to the shapes they touch',
      },
      {
        id: 'dynamicSize',
        label: 'Dynamic size',
        hint: 'Strokes and text keep their size on screen as you zoom',
      },
      {
        id: 'pasteAtCursor',
        label: 'Paste at cursor',
        hint: 'Paste where the pointer is, not in the middle of the view',
      },
    ],
  },
  {
    id: 'view',
    items: [
      {
        id: 'zenMode',
        label: 'Zen mode',
        shortcut: 'alt+z',
        hint: 'Put away everything but the canvas and the tools',
      },
      {
        id: 'viewMode',
        label: 'View mode',
        shortcut: 'alt+r',
        hint: 'Look around the board without editing it',
      },
      {
        id: 'canvasStats',
        label: 'Canvas stats',
        shortcut: 'alt+/',
        hint: 'Dimensions and coordinates for the canvas and the selection',
      },
      {
        id: 'debugMode',
        label: 'Debug mode',
        hint: 'Draw the geometry the editor works from over the board',
      },
    ],
  },
];
