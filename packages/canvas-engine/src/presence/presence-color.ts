/**
 * Collaborator colours.
 *
 * Derived from the user id by hash rather than handed out by the server: every
 * client computes the same colour for the same person with no coordination, and
 * it survives a reconnect — which a server-assigned slot would not, since the
 * awareness client id changes on every socket.
 *
 * Excalidraw derives the hue arithmetically, `hsl((hash % 37) * 10, 100%, 83%)`.
 * That keeps the determinism but produces 37 hues tuned for a white canvas,
 * several of which are indistinguishable from each other. We resolve the hash
 * against a fixed palette instead, so every entry is picked for legibility and
 * carries a variant per theme.
 *
 * Both variants are authored as the colour the user actually sees: the presence
 * layer is drawn outside the dark-mode inversion filter (see CanvasStack), so
 * nothing here is pre-compensated for `--theme-filter`.
 */

export type PresenceTheme = 'light' | 'dark';

export interface PresenceColor {
  /** For the light board — deep enough to read on white. */
  readonly light: string;
  /** For the dark board — light enough to read on near-black. */
  readonly dark: string;
  /** Stable identifier, for tests and debugging. */
  readonly name: string;
}

/**
 * Ten hues, spread far enough apart to stay tellable apart at cursor size.
 *
 * Indigo is deliberately absent: the selection UI draws in #6366f1, and a
 * collaborator wearing the same colour as your own selection outline is the
 * one collision that actively misleads.
 */
export const PRESENCE_PALETTE: readonly PresenceColor[] = [
  { name: 'red', light: '#DC2626', dark: '#F87171' },
  { name: 'orange', light: '#EA580C', dark: '#FB923C' },
  { name: 'amber', light: '#A16207', dark: '#FBBF24' },
  { name: 'lime', light: '#4D7C0F', dark: '#A3E635' },
  { name: 'green', light: '#16A34A', dark: '#4ADE80' },
  { name: 'teal', light: '#0D9488', dark: '#2DD4BF' },
  { name: 'sky', light: '#0284C7', dark: '#38BDF8' },
  { name: 'blue', light: '#2563EB', dark: '#60A5FA' },
  { name: 'fuchsia', light: '#C026D3', dark: '#E879F9' },
  { name: 'pink', light: '#DB2777', dark: '#F472B6' },
];

/**
 * FNV-1a, 32-bit. Chosen over the shift-and-add hash Excalidraw uses because
 * user ids are UUIDs, which share long common prefixes — a weak hash clusters
 * them and hands the same colour to people who joined together.
 */
function hashUserId(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The palette entry for a user. Stable for the lifetime of the account. */
export function presenceColor(userId: string): PresenceColor {
  const entry = PRESENCE_PALETTE[hashUserId(userId) % PRESENCE_PALETTE.length];
  // The modulo can't exceed the array, but the index signature is optional
  // under noUncheckedIndexedAccess.
  return entry ?? PRESENCE_PALETTE[0]!;
}

/** The user's colour resolved for one theme. */
export function presenceColorFor(userId: string, theme: PresenceTheme): string {
  const color = presenceColor(userId);
  return theme === 'dark' ? color.dark : color.light;
}

/**
 * Text colour for a name pill filled with a presence colour.
 *
 * The palette's light-theme entries are deep and its dark-theme entries are
 * pale, so one rule per theme covers every entry — no per-colour luminance
 * check needed.
 */
export function presencePillTextColor(theme: PresenceTheme): string {
  return theme === 'dark' ? '#101014' : '#FFFFFF';
}

/**
 * Colour of the halo drawn under a cursor.
 *
 * Matches the board ground rather than always being white (as Excalidraw's is),
 * so the halo reads as separation from the shapes underneath in both themes
 * instead of as a white sticker on a dark board.
 */
export function presenceHaloColor(theme: PresenceTheme): string {
  return theme === 'dark' ? '#121212' : '#FFFFFF';
}
