export const LIBRARY_RECENT_PREFIX = 'cf:library-recent:';
export const LIBRARY_PINNED_KEY = 'cf:library-pinned';

/** How many placed items Recently used holds. */
export const RECENT_KEPT = 12;

/**
 * Per account, and per device.
 *
 * What someone placed lately is a convenience for whoever is at this screen,
 * not something to carry between devices, so it is kept where the view of a
 * board is kept. Keyed by account, so a second account signed in on the same
 * browser does not see the first one's.
 */
export const libraryRecentKey = (userId: string) => `${LIBRARY_RECENT_PREFIX}${userId}`;

/** Item ids, most recently placed first. */
export function readRecentItems(userId: string): string[] {
  try {
    const stored = localStorage.getItem(libraryRecentKey(userId));
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, RECENT_KEPT);
  } catch {
    // Unreadable storage just means nothing reads as placed lately.
    return [];
  }
}

/** The list with this item moved to the front, as it is stored. */
export function withRecentItem(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((other) => other !== id)].slice(0, RECENT_KEPT);
}

export function storeRecentItems(userId: string, recent: readonly string[]): void {
  try {
    localStorage.setItem(libraryRecentKey(userId), JSON.stringify(recent));
  } catch {
    // What was placed lately just won't be remembered past a reload.
  }
}

/** Whether the library stays open after placing, as last left. Closes by default. */
export function readLibraryPinned(): boolean {
  try {
    return localStorage.getItem(LIBRARY_PINNED_KEY) === '1';
  } catch {
    return false;
  }
}

export function storeLibraryPinned(pinned: boolean): void {
  try {
    if (pinned) localStorage.setItem(LIBRARY_PINNED_KEY, '1');
    else localStorage.removeItem(LIBRARY_PINNED_KEY);
  } catch {
    // The pin just won't survive a reload.
  }
}
