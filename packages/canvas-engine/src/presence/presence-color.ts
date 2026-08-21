export type PresenceTheme = 'light' | 'dark';

export interface PresenceColor {
  /** Deep enough to read on the light board. */
  readonly light: string;
  /** Light enough to read on the dark board. */
  readonly dark: string;
  /** Stable identifier, for tests and debugging. */
  readonly name: string;
}

/**
 * Ten hues, far enough apart to stay tellable apart on a small arrow.
 *
 * Indigo is deliberately absent: the selection UI draws in #6366f1, and a
 * collaborator wearing the same colour as your own selection outline is the one
 * collision that actively misleads.
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
  const index = hashUserId(userId) % PRESENCE_PALETTE.length;
  // The modulo cannot exceed the array, but the index signature is optional
  // under noUncheckedIndexedAccess.
  return PRESENCE_PALETTE[index] ?? PRESENCE_PALETTE[0]!;
}

/** A user's colour resolved for one theme. */
export function presenceColorFor(userId: string, theme: PresenceTheme): string {
  const color = presenceColor(userId);
  return theme === 'dark' ? color.dark : color.light;
}

/**
 * Text colour for a name tag filled with a presence colour.
 *
 * The palette's light-theme entries are all deep and its dark-theme entries all
 * pale, so one rule per theme covers every entry and no per-colour luminance
 * check is needed.
 */
export function presenceTagTextColor(theme: PresenceTheme): string {
  return theme === 'dark' ? '#101014' : '#FFFFFF';
}
