import { env } from '../lib/env';

/**
 * Transport for the embed page: an embedded board and the pictures it draws.
 *
 * No sign-in and no cookies — whoever is reading the page the board sits on
 * has neither here. The embed id in the address is what the gateway lets
 * them in by, and it answers only with what the board draws.
 */

export interface EmbeddedBoard {
  boardId: string;
  title: string;
  /** Shapes as the board's document stores them, read back by `sceneShapes`. */
  shapes: unknown[];
}

/** The embed id is gone: turned off, or the board deleted. */
export class EmbedMissingError extends Error {
  constructor() {
    super('This board is not embedded');
    this.name = 'EmbedMissingError';
  }
}

function embedUrl(embedId: string, path = ''): string {
  return `${env.VITE_API_URL}/embeds/${encodeURIComponent(embedId)}${path}`;
}

/**
 * The board as it is now. Revalidated with the gateway every time, which
 * answers "not changed" from its ETag when nothing has, so asking again is
 * cheap.
 */
export async function fetchEmbeddedBoard(embedId: string): Promise<EmbeddedBoard> {
  const response = await fetch(embedUrl(embedId), { cache: 'no-cache', credentials: 'omit' });
  if (response.status === 404) throw new EmbedMissingError();
  if (!response.ok) throw new Error(`Could not load the board (${response.status})`);
  const { data } = (await response.json()) as { data: EmbeddedBoard };
  return data;
}

/** A board image's or a preview picture's bytes; null when it is not there. */
export async function fetchEmbedPicture(
  embedId: string,
  kind: 'images' | 'previews',
  name: string,
): Promise<Blob | null> {
  const authorization = await fetch(embedUrl(embedId, `/${kind}/${encodeURIComponent(name)}/url`), {
    credentials: 'omit',
  });
  if (authorization.status === 400 || authorization.status === 404) return null;
  if (!authorization.ok)
    throw new Error(`Could not load picture ${name} (${authorization.status})`);
  const { data } = (await authorization.json()) as { data: { url: string } };

  const bytes = await fetch(data.url);
  if (bytes.status === 404) return null;
  if (!bytes.ok) throw new Error(`Could not read picture ${name} (${bytes.status})`);
  return bytes.blob();
}
