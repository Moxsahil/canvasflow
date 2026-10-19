import {
  cleanText,
  MAX_DESCRIPTION_LENGTH,
  MAX_SITE_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  type PageMeta,
} from './page-meta.js';

/**
 * The sites whose own "describe this link" address is asked before their page
 * is read.
 *
 * Those answers are made for exactly this — a title, who made it, a
 * thumbnail — and they arrive where the page would not: a video page served to
 * a server is often a consent screen rather than the video. Each address here
 * is the site's own, built from a fixed origin, so the link only ever goes in
 * as a query value.
 */
const ENDPOINTS: readonly { readonly hosts: readonly string[]; readonly endpoint: string }[] = [
  {
    hosts: ['youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'],
    endpoint: 'https://www.youtube.com/oembed?format=json&url=',
  },
  { hosts: ['vimeo.com', 'player.vimeo.com'], endpoint: 'https://vimeo.com/api/oembed.json?url=' },
  { hosts: ['open.spotify.com'], endpoint: 'https://open.spotify.com/oembed?url=' },
  { hosts: ['loom.com'], endpoint: 'https://www.loom.com/v1/oembed?url=' },
  { hosts: ['figma.com'], endpoint: 'https://www.figma.com/api/oembed?url=' },
  { hosts: ['miro.com'], endpoint: 'https://miro.com/api/v1/oembed?url=' },
  { hosts: ['canva.com'], endpoint: 'https://www.canva.com/_oembed?url=' },
];

/** Where to ask about a link, or null for a site with no address listed here. */
export function oembedEndpointFor(url: URL): URL | null {
  const host = url.hostname.replace(/^www\./, '');
  const match = ENDPOINTS.find((entry) => entry.hosts.includes(host));
  return match ? new URL(`${match.endpoint}${encodeURIComponent(url.href)}`) : null;
}

/** The answer, read the way a page's preview tags are; null when it is not one. */
export function readOembed(body: Buffer): PageMeta | null {
  let data: unknown;
  try {
    data = JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const fields = data as Record<string, unknown>;
  const text = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string) : null);

  const thumbnail = text('thumbnail_url');
  let image: string | null = null;
  if (thumbnail) {
    try {
      const url = new URL(thumbnail);
      if (url.protocol === 'https:' || url.protocol === 'http:') image = url.href;
    } catch {
      // Not an address; the preview goes without a picture.
    }
  }

  return {
    title: cleanText(text('title'), MAX_TITLE_LENGTH),
    // Who made it is what these answers have in place of a description.
    description: cleanText(text('author_name'), MAX_DESCRIPTION_LENGTH),
    siteName: cleanText(text('provider_name'), MAX_SITE_NAME_LENGTH),
    image,
  };
}
