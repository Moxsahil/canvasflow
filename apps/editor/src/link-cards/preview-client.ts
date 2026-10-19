import { env } from '../lib/env';

/**
 * Transport for link previews: what a page says about itself, read by the
 * gateway, and the picture it kept from the page.
 *
 * The gateway does the fetching, so a pasted link never makes this browser
 * contact the site behind it, and everyone asking about the same link gets
 * the same answer from the gateway's store.
 */

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  image: { name: string; width: number | null; height: number | null } | null;
}

/** The preview of a link, or null when its page gave nothing to show. */
export async function fetchLinkPreview(token: string, url: string): Promise<LinkPreview | null> {
  const response = await fetch(`${env.VITE_API_URL}/link-previews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  });
  // A link the gateway will not read is a card that shows its address.
  if (response.status === 400) return null;
  if (!response.ok) throw new Error(`Could not read the link (${response.status})`);
  const { data } = (await response.json()) as { data: LinkPreview | null };
  return data;
}

/** A preview picture's bytes, by its object name; null when it is not there. */
export async function fetchPreviewImage(token: string, name: string): Promise<Blob | null> {
  const authorization = await fetch(
    `${env.VITE_API_URL}/link-previews/images/${encodeURIComponent(name)}/url`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (authorization.status === 400 || authorization.status === 404) return null;
  if (!authorization.ok) {
    throw new Error(`Could not load picture ${name} (${authorization.status})`);
  }
  const { data } = (await authorization.json()) as { data: { url: string } };

  const bytes = await fetch(data.url);
  if (bytes.status === 404) return null;
  if (!bytes.ok) throw new Error(`Could not read picture ${name} (${bytes.status})`);
  return bytes.blob();
}
