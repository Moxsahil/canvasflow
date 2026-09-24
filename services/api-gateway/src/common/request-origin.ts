import type { Request } from 'express';

/**
 * Where and when a request came from, in words a person would recognise.
 *
 * Used only in mail sent to the owner of an account ("requested 23 September
 * at 14:05 UTC, Chrome on Windows, India") so they can tell their own request
 * from somebody else's. Nothing is ever decided by it: the device comes from a
 * header the caller writes.
 */
export interface RequestOrigin {
  at: Date;
  device: string | null;
  country: string | null;
}

/**
 * The edge's country header, read only when it can be believed.
 *
 * Cloudflare sets `CF-IPCountry` on every request it forwards and overwrites
 * any a client sent. That only means something when every request is known to
 * have come through Cloudflare — which is what the origin lock guarantees. With
 * the lock off (development, or a deployment without the edge), anybody can
 * send the header, so it is ignored rather than repeated back as fact.
 */
export function requestOrigin(
  request: Request,
  options: { trustEdgeHeaders: boolean },
  now = new Date(),
): RequestOrigin {
  const country = options.trustEdgeHeaders ? request.headers['cf-ipcountry'] : undefined;
  return {
    at: now,
    device: describeDevice(request.headers['user-agent']),
    country: typeof country === 'string' ? countryName(country) : null,
  };
}

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
