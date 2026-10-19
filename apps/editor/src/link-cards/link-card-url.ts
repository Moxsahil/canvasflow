import { parseLinkInput, readBookmarkUrl } from '@canvasflow/canvas-engine';

/**
 * The page a paste is a link to, when the paste is a link and nothing else —
 * the case a board turns into a link card rather than writing out.
 *
 * Only a full web address on its own: a paste that starts with http:// or
 * https:// and holds no spaces. Without the scheme, "Node.js" or "e.g." would
 * read as addresses, and turning someone's words into a card is worse than
 * leaving a link as text.
 */
export function pastedLinkCardUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!/^https?:\/\//i.test(trimmed) || /\s/.test(trimmed)) return null;
  const parsed = parseLinkInput(trimmed);
  return parsed.ok ? readBookmarkUrl(parsed.link) : null;
}

/**
 * The page a link typed into the embed field is, when it is a web address —
 * forgiving there, as the field is for embeds: `example.com` gains https://.
 */
export function typedLinkCardUrl(text: string): string | null {
  const parsed = parseLinkInput(text);
  return parsed.ok ? readBookmarkUrl(parsed.link) : null;
}
