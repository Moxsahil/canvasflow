import type { IncomingHttpHeaders } from 'node:http';
import type { Request } from 'express';

/**
 * Where and when a request came from, in words a person would recognise.
 *
 * Used only where the owner of an account reads it — the mail they are sent,
 * and their own list of signed-in devices ("Chrome on Windows · New Delhi,
 * India") — so they can tell their own activity from somebody else's. Nothing
 * is ever decided by it: the device comes from a header the caller writes.
 */
export interface RequestOrigin {
  at: Date;
  device: string | null;
  /** "New Delhi, Delhi, India", or as much of it as the edge said. */
  location: string | null;
}

export interface EdgeTrust {
  /** True only while the origin lock guarantees every request came through the edge. */
  trustEdgeHeaders: boolean;
}

export function requestOrigin(
  request: Request,
  options: EdgeTrust,
  now = new Date(),
): RequestOrigin {
  return {
    at: now,
    device: describeDevice(request.headers['user-agent']),
    location: requestLocation(request, options),
  };
}

/**
 * Roughly where a request came from, read from the edge's location headers
 * only when they can be believed.
 *
 * Cloudflare sets these on every request it forwards and overwrites any a
 * client sent: `CF-IPCountry` always, and `CF-IPCity` and `CF-Region` once the
 * zone's "Add visitor location headers" managed transform is on. They only mean
 * something when every request is known to have come through Cloudflare —
 * which is what the origin lock guarantees. With the lock off (development, or
 * a deployment without the edge), anybody can send them, so they are ignored
 * rather than repeated back to somebody as fact.
 */
export function requestLocation(request: Request, options: EdgeTrust): string | null {
  return options.trustEdgeHeaders ? locationFromEdgeHeaders(request.headers) : null;
}

export function locationFromEdgeHeaders(headers: IncomingHttpHeaders): string | null {
  const city = headerText(headers['cf-ipcity']);
  const region = headerText(headers['cf-region']);
  const code = headers['cf-ipcountry'];
  const country = typeof code === 'string' ? countryName(code) : null;

  // "Singapore, Singapore, Singapore" says nothing the first word did not.
  const parts = [city, region, country].filter(
    (part, index, all): part is string => Boolean(part) && all.indexOf(part) === index,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * A header value made safe to store and show: decoded if the edge
 * percent-encoded a non-ASCII name, stripped of control characters, trimmed and
 * bounded. It is still somebody else's string; this only keeps it tidy.
 */
function headerText(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  let text = value;
  if (/%[0-9A-F]{2}/i.test(text)) {
    try {
      text = decodeURIComponent(text);
    } catch {
      // Not really encoded; keep it as it arrived.
    }
  }
  text = text.replace(CONTROL_CHARACTERS, '').trim().slice(0, 64);
  return text.length > 0 ? text : null;
}

// Matching control characters is the point, so the rule against it is off here.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

/**
 * What the lookup answers for a code it does not know — "Unknown Region",
 * rather than throwing. Read from the runtime instead of written out, so it is
 * right whatever ICU data the process ships with.
 */
const UNKNOWN_REGION = REGION_NAMES.of('ZZ');

/**
 * "IN" → "India". Cloudflare's own codes for "unknown" and "Tor" are not
 * countries and are handled rather than looked up.
 */
export function countryName(code: string): string | null {
  const upper = code.trim().toUpperCase();
  if (upper === 'T1') return 'the Tor network';
  if (!/^[A-Z]{2}$/.test(upper) || upper === 'XX') return null;
  try {
    const name = REGION_NAMES.of(upper);
    // An unknown code comes back as itself, or as the runtime's placeholder
    // name, rather than throwing.
    return name && name !== upper && name !== UNKNOWN_REGION ? name : null;
  } catch {
    return null;
  }
}

/**
 * First match wins, so order matters: Edge and Opera also say "Chrome", Chrome
 * also says "Safari", and Android and iOS also say "Linux" and "Mac OS X".
 */
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

/**
 * A short, recognisable label for a browser: "Chrome on Windows".
 *
 * Deliberately coarse. It exists so somebody can say "that wasn't me", not to
 * fingerprint anyone, and a User-Agent is whatever the caller chose to send.
 */
export function describeDevice(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.slice(0, 512);

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const os = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}
