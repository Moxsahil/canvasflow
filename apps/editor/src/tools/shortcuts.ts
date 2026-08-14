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
