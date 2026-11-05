import { FONT_FAMILIES } from '../properties/palette';
import type { TranslationKey } from '../i18n';

/** The groups the font list is shown in, in the order they are listed. */
export const FONT_CATEGORIES = ['handwriting', 'sans', 'serif', 'mono', 'display'] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

export const FONT_CATEGORY_LABELS: Record<FontCategory, TranslationKey> = {
  handwriting: 'style.font.category.handwriting',
  sans: 'style.font.category.sans',
  serif: 'style.font.category.serif',
  mono: 'style.font.category.mono',
  display: 'style.font.category.display',
};

export interface FontChoice {
  /** The CSS font stack written to the shape. */
  readonly value: string;
  /** The font's own name, shown as is in every language. */
  readonly name?: string;
  /** For the three the editor has always had, which are named by what they are for. */
  readonly labelKey?: TranslationKey;
  readonly category: FontCategory;
}

const [HAND_DRAWN, NORMAL, CODE] = FONT_FAMILIES;

/** A font served with the editor, with the fallback its group falls back to. */
function served(name: string, category: FontCategory): FontChoice {
  const fallback =
    category === 'serif'
      ? 'Georgia, serif'
      : category === 'mono'
        ? 'monospace'
        : category === 'handwriting'
          ? 'cursive'
          : 'system-ui, sans-serif';
  return { value: `"${name}", ${fallback}`, name, category };
}

/**
 * Every font the Font row offers.
 *
 * The first three are the stacks shapes have always been written with, kept
 * exactly as they were so a board drawn before the list grew still finds its
 * fonts in it. The fonts named first in those stacks are deliberately not
 * served here: loading them would change how every existing board reads.
 *
 * The rest are served from the editor itself (see `web-fonts.ts`) rather than
 * left to whatever is installed, so everyone on a board sees the same letters.
 */
export const FONT_CATALOG: readonly FontChoice[] = [
  { value: HAND_DRAWN.value, labelKey: HAND_DRAWN.labelKey, category: 'handwriting' },
  served('Kalam', 'handwriting'),
  served('Patrick Hand', 'handwriting'),
  served('Indie Flower', 'handwriting'),
  served('Architects Daughter', 'handwriting'),
  served('Shadows Into Light', 'handwriting'),
  served('Gochi Hand', 'handwriting'),
  served('Permanent Marker', 'handwriting'),

  { value: NORMAL.value, labelKey: NORMAL.labelKey, category: 'sans' },
  { value: '"Inter Variable", Inter, system-ui, sans-serif', name: 'Inter', category: 'sans' },
  served('Roboto', 'sans'),
  served('Open Sans', 'sans'),
  served('Lato', 'sans'),
  served('Montserrat', 'sans'),
  served('Poppins', 'sans'),
  served('Nunito', 'sans'),
  served('Work Sans', 'sans'),
  served('Raleway', 'sans'),

  served('Merriweather', 'serif'),
  served('Playfair Display', 'serif'),
  served('Lora', 'serif'),
  served('EB Garamond', 'serif'),
  served('Libre Baskerville', 'serif'),
  served('Roboto Slab', 'serif'),

  { value: CODE.value, labelKey: CODE.labelKey, category: 'mono' },
  served('Source Code Pro', 'mono'),
  served('IBM Plex Mono', 'mono'),
  served('Roboto Mono', 'mono'),
  served('Space Mono', 'mono'),

  served('Bebas Neue', 'display'),
  served('Orbitron', 'display'),
  served('Comfortaa', 'display'),
  served('Righteous', 'display'),
  served('Lobster', 'display'),
  served('Pacifico', 'display'),
  served('Press Start 2P', 'display'),
];

/** The entry for a stack, or undefined for one the list doesn't have (pasted in, say). */
export function findFont(value: string): FontChoice | undefined {
  return FONT_CATALOG.find((font) => font.value === value);
}

/**
 * The font a stack asks for first, unquoted — what a stack the list doesn't
 * know is shown as.
 */
export function firstFontName(value: string): string {
  return (value.split(',')[0] ?? value).trim().replace(/^["']|["']$/g, '');
}
