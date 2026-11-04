import type { ReactNode } from 'react';
import type { I18n } from '../i18n';
import { formatShortcutKeys } from './platform';
import { SHORTCUTS, type ShortcutEntry } from './shortcuts-registry';

/**
 * Finding a shortcut, by words or by pressing it: shared by the desktop's
 * window and a phone's sheet.
 */

export const TOTAL_SHORTCUTS = SHORTCUTS.reduce(
  (count, category) => count + category.entries.length,
  0,
);

export const ALL_ENTRIES = SHORTCUTS.flatMap((category) => category.entries);

/**
 * What a search looks through for one shortcut: what it does, and its keys by
 * every name someone might type for them.
 */
export function searchTextOf(entry: ShortcutEntry, mac: boolean, t: I18n['t']): string {
  const synonyms: Record<string, string> = {
    mod: mac ? 'cmd command' : 'ctrl control',
    alt: mac ? 'option opt alt' : 'alt',
    shift: 'shift',
  };
  const parts = [entry.keys, entry.altKeys]
    .filter((keys): keys is string => Boolean(keys))
    .flatMap((keys) => {
      const names = formatShortcutKeys(keys);
      return keys.split('+').map((part, index) => `${names[index]} ${synonyms[part] ?? ''}`);
    });
  return [t(entry.descriptionKey), ...parts].join(' ').toLowerCase();
}

/**
 * The shortcut a key press means, in the registry's `mod+shift+z` notation.
 * Null for a modifier pressed on its own.
 */
export function comboOf(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): string | null {
  const named: Record<string, string> = {
    Escape: 'escape',
    Delete: 'delete',
    Backspace: 'backspace',
    Enter: 'enter',
    ArrowLeft: 'arrow-left',
    ArrowRight: 'arrow-right',
    ArrowUp: 'arrow-up',
    ArrowDown: 'arrow-down',
    ' ': 'space',
  };
  const key =
    named[event.key] ??
    (event.code.startsWith('Key') ? event.code.slice(3).toLowerCase() : event.key.toLowerCase());
  if (['control', 'meta', 'alt', 'shift', 'altgraph'].includes(key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  // Shift is part of the name only where it changes nothing else: `?` is
  // already the shifted key, but a letter or a named key is not.
  if (event.shiftKey && (event.key in named || /^[a-z]$/.test(key) || key === '?')) {
    parts.push('shift');
  }
  return [...parts, key].join('+');
}

export function entryFor(combo: string): ShortcutEntry | undefined {
  // Ctrl+Y is written `ctrl+y` in the registry, not `mod+y`.
  const tries = [combo, combo.replace(/^mod\+/, 'ctrl+')];
  return ALL_ENTRIES.find(
    (entry) =>
      tries.includes(entry.keys) ||
      (entry.altKeys !== undefined && tries.includes(entry.altKeys)) ||
      (combo === 'space' && entry.keys.startsWith('space+')),
  );
}

/** The description with what the search matched picked out. */
export function highlight(text: string, terms: string[], markClassName?: string): ReactNode {
  if (terms.length === 0) return text;
  const lower = text.toLowerCase();
  const hits: [number, number][] = [];
  for (const term of terms) {
    let at = lower.indexOf(term);
    while (at !== -1) {
      hits.push([at, at + term.length]);
      at = lower.indexOf(term, at + term.length);
    }
  }
  if (hits.length === 0) return text;
  hits.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of hits) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const out: ReactNode[] = [];
  let at = 0;
  merged.forEach(([start, end], index) => {
    out.push(text.slice(at, start));
    out.push(
      <mark key={index} className={markClassName}>
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  out.push(text.slice(at));
  return out;
}

export type Said = { kind: 'found'; entry: ShortcutEntry } | { kind: 'missed'; combo: string };
