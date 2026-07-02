import type { Tool } from './tool';
import { TOOLS } from './tool';

export const KEY_TO_TOOL: Readonly<Record<string, Tool>> = Object.fromEntries(
  TOOLS.map((t) => [t.shortcut.toLowerCase(), t.id]),
);

export function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;

  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;

  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  return false;
}
