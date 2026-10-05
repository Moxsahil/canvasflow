/**
 * The addresses a shape may link to, decided in one place.
 *
 * A link is written by whoever is typing, but it is read by everyone on the
 * board — and opened by them, in their own browser, with their own session.
 * Nothing on the way checks it: the sync server stores the document as it
 * arrives, so a value another client wrote reaches this one untouched. That
 * makes reading the boundary that matters. Every reader goes through
 * `readLink`, and anything it does not recognise as an ordinary web or mail
 * address is treated as no link at all rather than repaired.
 */

/** Longer than any address worth clicking, and short enough to keep a board small. */
export const MAX_LINK_LENGTH = 2048;

/**
 * Only addresses that leave the board for a page or an email. Everything else
 * a browser will follow — `javascript:`, `data:`, `file:` and the rest — can
 * run something or reach something on the reader's machine.
 */
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** A scheme at the very start, e.g. `https:` or `mailto:`. */
const SCHEME = /^[a-z][a-z\d+.-]*:/i;

/** An address with no scheme that is plainly an email. */
const EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/;

/**
 * A stored link, or null where there is none to trust.
 *
 * Strict on purpose: a value written by this client is always one
 * `parseLinkInput` produced, so anything that fails here came from somewhere
 * else, and showing no link is the only safe reading of it.
 */
export function readLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_LINK_LENGTH) return null;
  if (hasUnsafeCharacter(value)) return null;

  const url = parseUrl(value);
  return url && isLinkUrl(url) ? value : null;
}

export type ParsedLinkInput =
  /** `link` is null when the field was left empty, which removes the link. */
  { readonly ok: true; readonly link: string | null } | { readonly ok: false };

/**
 * What someone typed or pasted into the link field, as the link to store.
 *
 * Forgiving where the meaning is plain: `example.com` gains `https://`, an
 * email address gains `mailto:`, and a paste that doubled the scheme
 * (`https://https://…`) loses the extra one. Anything else that is not an
 * http, https or mail address is refused rather than guessed at. The result
 * is the address in its canonical form, so what is stored is exactly what
 * `readLink` will accept back.
 */
export function parseLinkInput(raw: string): ParsedLinkInput {
  const text = raw.trim().replace(/^(?:https?:\/\/)+(https?:\/\/)/i, '$1');
  if (text === '') return { ok: true, link: null };

  if (SCHEME.test(text)) {
    const url = parseUrl(text);
    if (url && isLinkUrl(url)) return accept(url);
    // `localhost:3000` and `example.com:8080` read as a scheme too, so a
    // failed parse falls through to being tried as a bare address below.
  }

  if (EMAIL.test(text)) {
    const url = parseUrl(`mailto:${text}`);
    return url ? accept(url) : { ok: false };
  }

  // A prefix can only ever produce https, so this cannot smuggle in another
  // scheme. The dot is what tells an address from a stray word: `hello`
  // would otherwise become a link to a host of that name.
  const url = parseUrl(`https://${text}`);
  if (!url || !(url.hostname.includes('.') || url.hostname === 'localhost')) {
    return { ok: false };
  }
  return accept(url);
}

/**
 * A link as it reads on screen: the address without its scheme, or the email
 * address alone. Decoded where that is safe, so a path in another script
 * reads as written rather than as percent signs.
 */
export function linkLabel(link: string): string {
  const url = parseUrl(link);
  if (!url) return link;
  if (url.protocol === 'mailto:') return decode(url.pathname);

  const path = url.pathname === '/' ? '' : url.pathname;
  return decode(`${url.host}${path}${url.search}${url.hash}`);
}

function accept(url: URL): ParsedLinkInput {
  const link = url.href;
  return readLink(link) === null ? { ok: false } : { ok: true, link };
}

function isLinkUrl(url: URL): boolean {
  if (!LINK_PROTOCOLS.has(url.protocol)) return false;
  // A web address without a host leads nowhere; a mail address has no host
  // to check, only someone to write to.
  return url.protocol === 'mailto:' ? url.pathname.length > 0 : url.hostname.length > 0;
}

/** Whitespace or a control character, neither of which a URL holds literally. */
function hasUnsafeCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return /\s/.test(value);
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function decode(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}
