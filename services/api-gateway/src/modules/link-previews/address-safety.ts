import { BlockList, isIP } from 'node:net';

/**
 * Which addresses the preview reader may connect to, and which links it may
 * be asked to read.
 *
 * The reader fetches whatever link somebody pastes, from inside our own
 * network. Left alone, that is a way to make this server read things only it
 * can reach: the cloud's metadata service, a database on a private address,
 * the gateway's own health route. So every address a host name resolves to is
 * checked here, on every request and every redirect, and anything that is not
 * a public internet address is refused.
 */

const blocked = new BlockList();

// IPv4: "this network", private ranges, shared address space, loopback,
// link-local (where cloud metadata lives), protocol assignments, the
// documentation ranges, benchmarking, multicast and everything reserved above.
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}

// IPv6: unspecified and loopback, NAT64, discard, Teredo and 6to4,
// documentation, unique local, link-local, site-local and multicast. An
// IPv4-mapped address is judged by the IPv4 address inside it, below; the
// mapped range is not listed, because the list would then match every IPv4
// address too.
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/** The IPv4 address inside an IPv4-mapped or NAT64 IPv6 one, if it carries one. */
function embeddedIpv4(address: string): string | null {
  const dotted = /^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (dotted) return dotted[1]!;
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return null;
  const high = parseInt(hex[1]!, 16);
  const low = parseInt(hex[2]!, 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/** Whether an IP address is one on the public internet, and so may be connected to. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) {
    const inner = embeddedIpv4(address);
    if (inner && blocked.check(inner, 'ipv4')) return false;
    return !blocked.check(address, 'ipv6');
  }
  return false;
}

/** Longer than any address worth reading, and short enough to keep a key cheap. */
export const MAX_PREVIEW_URL_LENGTH = 2048;

/**
 * The link to read, or null when it is not one the reader will fetch.
 *
 * Only http and https on their usual ports, with no user name or password in
 * it, and a host that is a name rather than an address — a numeric host would
 * pass the DNS check by never making one, so it is refused outright. The
 * fragment is dropped: it never reaches the server, and keeping it would give
 * one page as many cache entries as it has anchors.
 */
export function normalizePreviewUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_PREVIEW_URL_LENGTH || /\s/.test(text)) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return null;
  // A single label is somebody's local network name, not a site on the web.
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal')) return null;

  url.hash = '';
  return url;
}
