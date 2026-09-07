import type { Tool } from './tool';
import { TOOLS } from './tool';

/**
 * Both the letter and the digit select a tool, matching the two labels the
 * toolbar advertises (tooltip and superscript badge).
 */
export const KEY_TO_TOOL: Readonly<Record<string, Tool>> = Object.fromEntries(
  TOOLS.flatMap((t) =>
    t.numericKey
      ? ([
          [t.shortcut.toLowerCase(), t.id],
          [t.numericKey, t.id],
        ] as const)
      : ([[t.shortcut.toLowerCase(), t.id]] as const),
  ),
);

/** The fields a shortcut test reads, so DOM and React events both satisfy it. */
interface ShortcutEvent {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * The combo that summons the command palette — and, because the palette reads
 * it too, the one that dismisses it again.
 *
 * Two spellings: Cmd/Ctrl+/ is the primary, and Cmd/Ctrl+Shift+P is the other
 * combo people arrive expecting. The shifted '?' is there because that is what
 * the '/' key reports on layouts that put a question mark on it.
 *
 * Shared rather than written out at both ends: the editor's own handler is
 * switched off while the palette is up, so if these two ever disagreed the
 * palette would become a thing you could open but not close.
 */
export function isCommandPaletteShortcut(event: ShortcutEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  if (event.key === '/') return true;
  return event.shiftKey && (event.key === 'p' || event.key === 'P' || event.key === '?');
}

export function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;

  const tag = target.tagName;
  // Only text-entry inputs swallow shortcuts. Toolbar tool buttons are radio
  // inputs and keep focus after a click, so treating every INPUT as writable
  // would disable shortcuts for the rest of the session.
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    if (type !== 'radio' && type !== 'checkbox' && type !== 'range') return true;
  }
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;

  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  return false;
}
