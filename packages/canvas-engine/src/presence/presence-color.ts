import { CURSOR_COLORS, type CursorColor } from '@canvasflow/types';

export type PresenceTheme = 'light' | 'dark';

export interface PresenceColor {
  /** Deep enough to read on the light board. */
  readonly light: string;
  /** Light enough to read on the dark board. */
  readonly dark: string;
  /** Stable identifier — the form a person's choice is stored in. */
  readonly name: CursorColor;
}

/**
 * The two shades each colour is drawn in.
 *
 * Indigo is deliberately absent: the selection UI draws in #6366f1, and a
 * collaborator wearing the same colour as your own selection outline is the one
 * collision that actively misleads.
 */
const SHADES: Record<CursorColor, { readonly light: string; readonly dark: string }> = {
  red: { light: '#DC2626', dark: '#F87171' },
  orange: { light: '#EA580C', dark: '#FB923C' },
  amber: { light: '#A16207', dark: '#FBBF24' },
  lime: { light: '#4D7C0F', dark: '#A3E635' },
  green: { light: '#16A34A', dark: '#4ADE80' },
  teal: { light: '#0D9488', dark: '#2DD4BF' },
  sky: { light: '#0284C7', dark: '#38BDF8' },
  blue: { light: '#2563EB', dark: '#60A5FA' },
  fuchsia: { light: '#C026D3', dark: '#E879F9' },
  pink: { light: '#DB2777', dark: '#F472B6' },
};

/**
 * Ten hues, far enough apart to stay tellable apart on a small arrow.
 *
 * Built from the stored colour names rather than written out again, so the two
 * cannot drift: the id hash below indexes this array, and a colour present on
 * one side only would shift everyone who has never chosen one.
 */
export const PRESENCE_PALETTE: readonly PresenceColor[] = CURSOR_COLORS.map((name) => ({
  name,
  light: SHADES[name].light,
  dark: SHADES[name].dark,
}));

const BY_NAME = new Map<CursorColor, PresenceColor>(
  PRESENCE_PALETTE.map((entry) => [entry.name, entry]),
);

function hashUserId(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The palette entry a user falls on by id. Stable for the lifetime of the account. */
export function presenceColor(userId: string): PresenceColor {
  const index = hashUserId(userId) % PRESENCE_PALETTE.length;
  // The modulo cannot exceed the array, but the index signature is optional
  // under noUncheckedIndexedAccess.
  return PRESENCE_PALETTE[index] ?? PRESENCE_PALETTE[0]!;
}

/**
 * The entry a person should be drawn in: the colour they chose, or the one
 * their id lands on.
 *
 * A name this build does not know resolves to the id colour rather than to
 * nothing, so a peer running ahead of us is still drawn.
 */
export function presenceColorOf(userId: string, chosen?: CursorColor | null): PresenceColor {
  const picked = chosen ? BY_NAME.get(chosen) : undefined;
  return picked ?? presenceColor(userId);
}

/** A user's colour resolved for one theme. */
export function presenceColorFor(
  userId: string,
  theme: PresenceTheme,
  chosen?: CursorColor | null,
): string {
  const color = presenceColorOf(userId, chosen);
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
