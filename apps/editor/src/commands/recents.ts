import { COMMANDS_BY_ID, type CommandId } from './commands';

export const RECENTS_STORAGE_KEY = 'cf:command-recents';

/**
 * Few enough that the recents stay a shortcut rather than a second list to
 * read past on the way to the one you wanted.
 */
export const RECENTS_LIMIT = 5;

/**
 * The commands last run from the palette, most recent first.
 *
 * Ids that no longer exist are dropped on the way out rather than on the way
 * in: a command renamed or removed in a later version would otherwise sit in
 * storage forever, and resolve to nothing every time the palette opened.
 */
export function readRecents(): CommandId[] {
  try {
    const stored = localStorage.getItem(RECENTS_STORAGE_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<CommandId>();
    const ids: CommandId[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const id = entry as CommandId;
      if (!COMMANDS_BY_ID.has(id) || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length === RECENTS_LIMIT) break;
    }
    return ids;
  } catch {
    // Unreadable or unparseable storage just means no recents this session.
    return [];
  }
}

/** The list `id` would produce at the front of `current`, without writing it. */
export function withRecent(current: readonly CommandId[], id: CommandId): CommandId[] {
  return [id, ...current.filter((entry) => entry !== id)].slice(0, RECENTS_LIMIT);
}

export function storeRecents(ids: readonly CommandId[]): void {
  try {
    localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // The order just won't survive a reload.
  }
}
