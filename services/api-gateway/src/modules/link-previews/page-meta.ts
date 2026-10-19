/**
 * What a page says about itself in its preview tags — the ones every chat app
 * reads to draw a link card: Open Graph first, then Twitter's, then the plain
 * title and description.
 *
 * Read with a small scanner rather than a full HTML parser. Only `<meta>`,
 * `<title>` and `<link>` in the top of the page matter, and the page is
 * someone else's, so nothing here builds a document from it or runs anything
 * in it: attributes are read as text and every value comes back as plain text.
 */

export interface PageMeta {
  readonly title: string | null;
  readonly description: string | null;
  readonly siteName: string | null;
  /** Absolute, http or https; still to be checked before it is fetched. */
  readonly image: string | null;
}

export const MAX_TITLE_LENGTH = 300;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_SITE_NAME_LENGTH = 100;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X'
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** One line of plain text, of at most `max` characters, or null when nothing is left. */
export function cleanText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  // Tags first, then entities: a tag written out as `&lt;b&gt;` is words the
  // page meant to show, and stays as words.
  const text = decodeEntities(value.replace(/<[^>]*>/g, ' '))
    // Control characters and the direction overrides a title could use to
    // make itself read as something else. Matching them is the point here.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** The attributes of one tag, names lowercased. Values in either quote, or bare. */
function attributesOf(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([a-z_:][-a-z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;
  // Past the tag's own name.
  const body = tag.replace(/^<\s*[a-z]+/i, '').replace(/\/?>$/, '');
  for (const match of body.matchAll(pattern)) {
    const name = match[1]!.toLowerCase();
    if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** An image address from the page, made absolute against it; null unless http or https. */
function absoluteImage(value: string | undefined, base: URL): string | null {
  if (!value) return null;
  try {
    const url = new URL(decodeEntities(value.trim()), base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function readPageMeta(html: string, pageUrl: URL): PageMeta {
  // The head is where these live; stopping at the body keeps a large page
  // from being scanned for tags it has no reason to repeat further down.
  const headEnd = html.search(/<body[\s>]/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd);

  const meta = new Map<string, string>();
  // A quoted value may hold a '>' of its own, so quotes are skipped whole.
  for (const match of head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attributes = attributesOf(match[0]);
    const key = (attributes.get('property') ?? attributes.get('name') ?? '').toLowerCase();
    const content = attributes.get('content');
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }

  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];

  return {
    title: cleanText(
      meta.get('og:title') ?? meta.get('twitter:title') ?? titleTag,
      MAX_TITLE_LENGTH,
    ),
    description: cleanText(
      meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'),
      MAX_DESCRIPTION_LENGTH,
    ),
    siteName: cleanText(
      meta.get('og:site_name') ?? meta.get('application-name'),
      MAX_SITE_NAME_LENGTH,
    ),
    image: absoluteImage(
      meta.get('og:image:secure_url') ??
        meta.get('og:image') ??
        meta.get('og:image:url') ??
        meta.get('twitter:image') ??
        meta.get('twitter:image:src'),
      pageUrl,
    ),
  };
}

/** A page's text as UTF-8, or as the charset it declares where that is one Node can read. */
export function pageText(body: Buffer, contentTypeHeader: string | undefined): string {
  const declared =
    /charset=["']?([\w-]+)/i.exec(contentTypeHeader ?? '')?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(body.subarray(0, 2048).toString('latin1'))?.[1];
  const charset = (declared ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}
