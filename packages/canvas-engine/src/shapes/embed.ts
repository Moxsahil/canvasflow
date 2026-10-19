import type { Rect } from '../math.js';
import { MAX_LINK_LENGTH } from './link.js';
import type { EmbedShape } from './shape.js';
import { resolveBaseStyle, type BaseStyleInput } from './style.js';

/**
 * Pages from other sites, played or used in place on the board.
 *
 * The board stores only the address someone pasted. What the frame actually
 * loads — the site's player, its viewer, its embed page — is worked out from
 * that address every time it is read, by a short list of sites this file
 * knows. Two things follow from doing it that way round.
 *
 * Anyone on a board can write any string into a shape, and nothing on the way
 * checks it, so the address a frame loads must never be one somebody wrote.
 * Each site below picks the identifiers it needs out of the pasted address,
 * checks them against what that site's identifiers look like, and builds the
 * player address from scratch. An address no site recognises loads nothing.
 *
 * And a site that changes where its player lives is one edit here, not a
 * migration of every board that holds one of its links.
 */

/** What a site's frame holds, which decides what the card on the board shows. */
export type EmbedMedium = 'video' | 'audio' | 'page';

export interface EmbedProvider {
  readonly id: string;
  /** The site's own name, shown on the card and in the insert window. */
  readonly name: string;
  readonly medium: EmbedMedium;
  /** The size a new embed from this site is placed at, in world units. */
  readonly width: number;
  readonly height: number;
}

/**
 * What the frame loads: a page on the site's own origin, or — for a site whose
 * embed is a script rather than a page — a document written here that runs it.
 */
export type EmbedFrame = { readonly src: string } | { readonly srcdoc: string };

export interface ResolvedEmbed {
  readonly provider: EmbedProvider;
  /** The address as stored, which is also the page to open in a tab. */
  readonly url: string;
  readonly frame: EmbedFrame;
  /** The size this particular link is placed at; a Short is tall, a track is short. */
  readonly width: number;
  readonly height: number;
}

interface ProviderDefinition extends EmbedProvider {
  /** Host names without `www.` or `m.`. */
  readonly hosts: readonly string[];
  readonly resolve: (url: URL) => ResolvedFrame | null;
}

interface ResolvedFrame {
  readonly frame: EmbedFrame;
  readonly width?: number;
  readonly height?: number;
}

const VIDEO_WIDTH = 560;
const VIDEO_HEIGHT = 315;
const PAGE_WIDTH = 720;
const PAGE_HEIGHT = 480;

/** The smallest an embed may be resized to, below which no site's player is usable. */
export const MIN_EMBED_SIZE = 80;

/** How long the address a shape stores may be. The same cap a link has. */
export const MAX_EMBED_URL_LENGTH = MAX_LINK_LENGTH;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_LIST = /^[A-Za-z0-9_-]{10,64}$/;
const DIGITS = /^\d{1,20}$/;
const HEX_32 = /^[a-f0-9]{32}$/i;
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
const GOOGLE_ID = /^[A-Za-z0-9_-]{20,128}$/;
const FIGMA_KEY = /^[A-Za-z0-9]{16,128}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const GIST_ID = /^[a-f0-9]{20,40}$/i;
const MIRO_ID = /^[A-Za-z0-9_-]{8,40}=?$/;

/** Path segments, empty ones dropped, so a trailing slash changes nothing. */
function segments(url: URL): string[] {
  return url.pathname.split('/').filter((part) => part.length > 0);
}

/**
 * Seconds from `t=90`, `t=90s` or `t=1h2m3s`. Zero when there is no time or it
 * cannot be read, which starts the video at the beginning.
 */
export function readStartTime(value: string | null): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || value === '') return 0;
  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function youtube(url: URL): ResolvedFrame | null {
  const parts = segments(url);
  const start = readStartTime(url.searchParams.get('t') ?? url.searchParams.get('start'));
  const at = start > 0 ? `&start=${start}` : '';

  let id: string | undefined;
  let tall = false;
  if (url.hostname.endsWith('youtu.be')) {
    id = parts[0];
  } else if (parts[0] === 'watch') {
    id = url.searchParams.get('v') ?? undefined;
  } else if (parts[0] === 'shorts') {
    id = parts[1];
    tall = true;
  } else if (parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v') {
    id = parts[1];
  }

  if (id === 'videoseries' || parts[0] === 'playlist') {
    const list = url.searchParams.get('list');
    if (!list || !YOUTUBE_LIST.test(list)) return null;
    return {
      frame: { src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}` },
    };
  }

  if (!id || !YOUTUBE_ID.test(id)) return null;
  // The no-cookie host: the same player, which leaves nothing in the viewer's
  // browser until they press play.
  return {
    frame: { src: `https://www.youtube-nocookie.com/embed/${id}?rel=0${at}` },
    ...(tall && { width: 315, height: 560 }),
  };
}

function vimeo(url: URL): ResolvedFrame | null {
  const parts = segments(url);
  // player.vimeo.com/video/ID?h=HASH, or vimeo.com/ID/HASH for an unlisted one.
  const fromPlayer = parts[0] === 'video';
  const id = fromPlayer ? parts[1] : parts.find((part) => DIGITS.test(part));
  if (!id || !DIGITS.test(id)) return null;
  const after = parts[parts.indexOf(id) + 1];
  const hash =
    url.searchParams.get('h') ?? (after && /^[a-f0-9]{6,20}$/i.test(after) ? after : null);
  const unlisted = hash && /^[a-f0-9]{6,20}$/i.test(hash) ? `?h=${hash}` : '';
  return { frame: { src: `https://player.vimeo.com/video/${id}${unlisted}` } };
}

function loom(url: URL): ResolvedFrame | null {
  const [kind, id] = segments(url);
  if ((kind !== 'share' && kind !== 'embed') || !id || !HEX_32.test(id)) return null;
  return { frame: { src: `https://www.loom.com/embed/${id}` } };
}

function figma(url: URL): ResolvedFrame | null {
  const [kind, key] = segments(url);
  const kinds = ['file', 'design', 'proto', 'board', 'slides', 'deck', 'make'];
  if (!kind || !kinds.includes(kind) || !key || !FIGMA_KEY.test(key)) return null;
  // The address goes along whole, as the site's embed page asks for it. Its
  // host was checked on the way in, so it can only ever point back at Figma.
  return {
    frame: {
      src: `https://www.figma.com/embed?embed_host=canvasflow&url=${encodeURIComponent(url.href)}`,
    },
  };
}

/** docs.google.com/<kind>/d/<id>/…, with the viewer each kind has for embedding. */
/**
 * docs.google.com/<kind>/d/<id>/…, with the viewer each kind has for embedding.
 * A file published to the web (File ▸ Share ▸ Publish to web) lives at
 * /<kind>/d/e/<id>/pub instead, and has a viewer of its own.
 */
function googleDocument(kind: string, viewer: string, publishedViewer: string) {
  return (url: URL): ResolvedFrame | null => {
    const parts = segments(url);
    if (parts[0] !== kind || parts[1] !== 'd') return null;
    const published = parts[2] === 'e';
    const id = published ? parts[3] : parts[2];
    if (!id || !GOOGLE_ID.test(id)) return null;
    return {
      frame: {
        src: published
          ? `https://docs.google.com/${kind}/d/e/${id}/${publishedViewer}`
          : `https://docs.google.com/${kind}/d/${id}/${viewer}`,
      },
    };
  };
}

function googleForm(url: URL): ResolvedFrame | null {
  const parts = segments(url);
  // Only the address a form is answered at. The one it is edited at shows a
  // sign-in page to everybody but its owners.
  if (parts[0] !== 'forms' || parts[1] !== 'd' || parts[2] !== 'e') return null;
  const id = parts[3];
  if (!id || !GOOGLE_ID.test(id)) return null;
  return {
    frame: { src: `https://docs.google.com/forms/d/e/${id}/viewform?embedded=true` },
  };
}

function googleDrive(url: URL): ResolvedFrame | null {
  const parts = segments(url);
  const id =
    parts[0] === 'file' && parts[1] === 'd'
      ? parts[2]
      : parts[0] === 'open' || parts[0] === 'uc'
        ? (url.searchParams.get('id') ?? undefined)
        : undefined;
  if (!id || !GOOGLE_ID.test(id)) return null;
  return { frame: { src: `https://drive.google.com/file/d/${id}/preview` } };
}

/** A latitude or longitude: a plain decimal, and nothing that could be more. */
const COORDINATE = /^-?\d{1,3}(?:\.\d{1,12})?$/;

function googleMaps(url: URL): ResolvedFrame | null {
  const parts = segments(url);
  if (url.hostname !== 'maps.google.com' && parts[0] !== 'maps') return null;

  // An address copied from the site's own Share ▸ Embed is already a player.
  if (parts[1] === 'embed') {
    const pb = url.searchParams.get('pb');
    if (!pb || pb.length > 1500) return null;
    return { frame: { src: `https://www.google.com/maps/embed?pb=${encodeURIComponent(pb)}` } };
  }

  // `@lat,lng,15z` in the path is where the map was looking when it was copied.
  const view = /@(-?[\d.]+),(-?[\d.]+),(\d{1,2}(?:\.\d+)?)z/.exec(url.pathname);
  const placeIndex = parts.indexOf('place');
  const place = placeIndex !== -1 ? parts[placeIndex + 1] : undefined;
  const query = url.searchParams.get('q');

  let q: string | null = null;
  if (place) q = decodeComponent(place).replace(/\+/g, ' ');
  else if (query) q = query;
  else if (view && COORDINATE.test(view[1]!) && COORDINATE.test(view[2]!)) {
    q = `${view[1]},${view[2]}`;
  }
  if (!q || q.length > 300) return null;

  const zoom = view ? Math.min(21, Math.max(1, Math.round(Number(view[3])))) : null;
  const z = zoom ? `&z=${zoom}` : '';
  return {
    frame: { src: `https://maps.google.com/maps?q=${encodeURIComponent(q)}${z}&output=embed` },
  };
}

function spotify(url: URL): ResolvedFrame | null {
  const parts = segments(url);
  // A link from another market carries it first: /intl-de/track/ID.
  if (parts[0]?.startsWith('intl-')) parts.shift();
  if (parts[0] === 'embed') parts.shift();
  const [kind, id] = parts;
  const kinds = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];
  if (!kind || !kinds.includes(kind) || !id || !SPOTIFY_ID.test(id)) return null;
  // One song or one episode is a single row of controls; anything with a
  // track list needs the room to show it.
  const single = kind === 'track' || kind === 'episode';
  return {
    frame: { src: `https://open.spotify.com/embed/${kind}/${id}` },
    width: 400,
    height: single ? 152 : 352,
  };
}

function codepen(url: URL): ResolvedFrame | null {
  const [user, kind, id] = segments(url);
  if (!user || !TOKEN.test(user) || !id || !/^[A-Za-z0-9]{3,20}$/.test(id)) return null;
  if (!kind || !['pen', 'full', 'details', 'embed'].includes(kind)) return null;
  return { frame: { src: `https://codepen.io/${user}/embed/${id}?default-tab=result` } };
}

function codesandbox(url: URL): ResolvedFrame | null {
  const parts = segments(url);
  let id: string | undefined;
  if (parts[0] === 's' || parts[0] === 'embed') id = parts[1];
  else if (parts[0] === 'p' && (parts[1] === 'sandbox' || parts[1] === 'devbox')) id = parts[2];
  if (!id || !/^[A-Za-z0-9-]{3,80}$/.test(id)) return null;
  return { frame: { src: `https://codesandbox.io/embed/${id}` } };
}

function gist(url: URL): ResolvedFrame | null {
  const [user, rawId] = segments(url);
  const id = rawId?.replace(/\.js$/, '');
  if (!user || !TOKEN.test(user) || !id || !GIST_ID.test(id)) return null;
  // A gist is embedded by a script that writes it into the page it runs in,
  // so the frame is given a page of its own to run in. Both parts were
  // checked against patterns that hold nothing but letters, digits and dashes.
  return {
    frame: {
      srcdoc:
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<style>html,body{margin:0}body .gist .gist-file{margin:0;border:0;border-radius:0}</style>' +
        `</head><body><script src="https://gist.github.com/${user}/${id}.js"></script></body></html>`,
    },
  };
}

function miro(url: URL): ResolvedFrame | null {
  const parts = segments(url);
  if (parts[0] !== 'app' || (parts[1] !== 'board' && parts[1] !== 'live-embed')) return null;
  const id = parts[2];
  if (!id || !MIRO_ID.test(id)) return null;
  return { frame: { src: `https://miro.com/app/live-embed/${id}/` } };
}

function canva(url: URL): ResolvedFrame | null {
  const parts = segments(url);
  if (parts[0] !== 'design') return null;
  const id = parts[1];
  if (!id || !TOKEN.test(id)) return null;
  // A link shared to view carries a key after the design's id; one without it
  // only opens for the design's own people.
  const key = parts[2] && TOKEN.test(parts[2]) && parts[2] !== 'view' ? `/${parts[2]}` : '';
  return { frame: { src: `https://www.canva.com/design/${id}${key}/view?embed` } };
}

function desmos(url: URL): ResolvedFrame | null {
  const [kind, id] = segments(url);
  if (!kind || !['calculator', 'geometry', '3d'].includes(kind)) return null;
  if (!id || !/^[A-Za-z0-9]{4,40}$/.test(id)) return null;
  return { frame: { src: `https://www.desmos.com/${kind}/${id}?embed` } };
}

const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    medium: 'video',
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
    resolve: youtube,
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    medium: 'video',
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    hosts: ['vimeo.com', 'player.vimeo.com'],
    resolve: vimeo,
  },
  {
    id: 'loom',
    name: 'Loom',
    medium: 'video',
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    hosts: ['loom.com'],
    resolve: loom,
  },
  {
    id: 'figma',
    name: 'Figma',
    medium: 'page',
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    hosts: ['figma.com'],
    resolve: figma,
  },
  {
    id: 'google-docs',
    name: 'Google Docs',
    medium: 'page',
    width: 640,
    height: 800,
    hosts: ['docs.google.com'],
    resolve: googleDocument('document', 'preview', 'pub?embedded=true'),
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    medium: 'page',
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    hosts: ['docs.google.com'],
    resolve: googleDocument('spreadsheets', 'preview', 'pubhtml?widget=true&headers=false'),
  },
  {
    id: 'google-slides',
    name: 'Google Slides',
    medium: 'page',
    width: PAGE_WIDTH,
    height: 435,
    hosts: ['docs.google.com'],
    resolve: googleDocument('presentation', 'embed', 'embed'),
  },
  {
    id: 'google-forms',
    name: 'Google Forms',
    medium: 'page',
    width: 640,
    height: 800,
    hosts: ['docs.google.com'],
    resolve: googleForm,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    medium: 'page',
    width: 640,
    height: PAGE_HEIGHT,
    hosts: ['drive.google.com'],
    resolve: googleDrive,
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    medium: 'page',
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    hosts: ['google.com', 'maps.google.com'],
    resolve: googleMaps,
  },
  {
    id: 'spotify',
    name: 'Spotify',
    medium: 'audio',
    width: 400,
    height: 352,
    hosts: ['open.spotify.com'],
    resolve: spotify,
  },
  {
    id: 'codepen',
    name: 'CodePen',
    medium: 'page',
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    hosts: ['codepen.io'],
    resolve: codepen,
  },
  {
    id: 'codesandbox',
    name: 'CodeSandbox',
    medium: 'page',
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    hosts: ['codesandbox.io'],
    resolve: codesandbox,
  },
  {
    id: 'github-gist',
    name: 'GitHub Gist',
    medium: 'page',
    width: 560,
    height: 400,
    hosts: ['gist.github.com'],
    resolve: gist,
  },
  {
    id: 'miro',
    name: 'Miro',
    medium: 'page',
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    hosts: ['miro.com'],
    resolve: miro,
  },
  {
    id: 'canva',
    name: 'Canva',
    medium: 'page',
    width: PAGE_WIDTH,
    height: 405,
    hosts: ['canva.com'],
    resolve: canva,
  },
  {
    id: 'desmos',
    name: 'Desmos',
    medium: 'page',
    width: 600,
    height: 400,
    hosts: ['desmos.com'],
    resolve: desmos,
  },
];

/** Every site an embed can come from, in the order the insert window lists them. */
export const EMBED_PROVIDERS: readonly EmbedProvider[] = PROVIDERS.map(
  ({ id, name, medium, width, height }) => ({ id, name, medium, width, height }),
);

function bareHost(hostname: string): string {
  return hostname.replace(/^(?:www\.|m\.)/, '');
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Read from every frame painted, so it remembers what it has worked out. A
 * board holds a handful of embeds, and the cap only keeps a long session from
 * growing it without end.
 */
const resolved = new Map<string, ResolvedEmbed | null>();
const RESOLVED_CAP = 500;

/**
 * What a stored address embeds, or null where it embeds nothing.
 *
 * Strict in the way `readLink` is: anything but an http or https address of a
 * site listed above, of a sensible length and with no whitespace in it, is
 * no embed at all rather than one that is repaired.
 */
export function resolveEmbed(value: unknown): ResolvedEmbed | null {
  if (typeof value !== 'string') return null;
  const known = resolved.get(value);
  if (known !== undefined) return known;

  const result = resolveUncached(value);
  if (resolved.size >= RESOLVED_CAP) resolved.clear();
  resolved.set(value, result);
  return result;
}

function resolveUncached(value: string): ResolvedEmbed | null {
  if (value.length === 0 || value.length > MAX_EMBED_URL_LENGTH || /\s/.test(value)) return null;
  const url = parseUrl(value);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
  // Credentials and ports are never part of a link to any of these sites, and
  // a host that only resembles one is the commonest way to pass for it.
  if (url.username || url.password || url.port) return null;

  const host = bareHost(url.hostname);
  for (const provider of PROVIDERS) {
    if (!provider.hosts.includes(host)) continue;
    const found = provider.resolve(url);
    if (!found) continue;
    return {
      provider: EMBED_PROVIDERS.find((listed) => listed.id === provider.id)!,
      url: value,
      frame: found.frame,
      width: found.width ?? provider.width,
      height: found.height ?? provider.height,
    };
  }
  return null;
}

/** `src="…"` inside a pasted `<iframe>` tag. */
const IFRAME_SRC = /^<iframe\b[^>]*?\ssrc=["']([^"']+)["'][^>]*>/i;

/**
 * What someone typed or pasted into the embed field, as the address to store —
 * or null when no site above would embed it.
 *
 * Forgiving where the meaning is plain: a missing scheme gains `https://`, an
 * `http://` address is stored as `https://`, and the `<iframe>` code a site
 * offers to copy is read for the address inside it.
 */
export function parseEmbedInput(raw: string): string | null {
  let text = raw.trim();
  const tag = IFRAME_SRC.exec(text);
  if (tag) text = tag[1]!.replace(/&amp;/g, '&');
  if (text === '' || /\s/.test(text)) return null;

  if (/^http:\/\//i.test(text)) text = `https://${text.slice(7)}`;
  else if (!/^https:\/\//i.test(text)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^[^:]+\.[^:]+:\d/.test(text)) return null;
    text = `https://${text}`;
  }

  const url = parseUrl(text);
  if (!url) return null;
  const href = url.href;
  return resolveEmbed(href) ? href : null;
}

export function createEmbed(
  input: BaseStyleInput & {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    url: string;
  },
): EmbedShape {
  return {
    kind: 'embed',
    id: input.id,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    url: input.url,
    ...resolveBaseStyle(input),
    // A card around somebody else's page: no fill or stroke of its own for
    // the properties panel to offer controls for.
    fillColor: null,
    strokeWidth: 1,
  };
}

export function embedBounds(s: EmbedShape): Rect {
  return { x: s.x, y: s.y, width: s.width, height: s.height };
}
