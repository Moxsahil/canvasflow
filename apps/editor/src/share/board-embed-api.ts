import { env } from '../lib/env';

/**
 * Share → Embed on a website: the switch, and the code it hands out.
 *
 * Talks to the gateway with the editor's own token, as the rest of what the
 * board owns does. The id is what the code carries: it opens a read-only
 * picture of the board's shapes and nothing else, and turning embedding off
 * stops it everywhere at once.
 */

/** The gateway said no, in words meant for the person: shown as they are. */
export class EmbedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbedRefusedError';
  }
}

function embedUrl(boardId: string): string {
  return `${env.VITE_API_URL}/boards/${boardId}/embed`;
}

async function readEmbedId(response: Response, action: string): Promise<string | null> {
  if (!response.ok) throw new Error(`${action} (${response.status})`);
  const { data } = (await response.json()) as { data: { id: string } | null };
  return data?.id ?? null;
}

/** The board's embed id, or null while embedding is off. */
export async function fetchBoardEmbed(token: string, boardId: string): Promise<string | null> {
  const response = await fetch(embedUrl(boardId), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readEmbedId(response, 'Could not read the embed setting');
}

/** Turn embedding on; the id it answers with is the one the code carries. */
export async function enableBoardEmbed(token: string, boardId: string): Promise<string> {
  const response = await fetch(embedUrl(boardId), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
  // An address not confirmed yet, most likely: the answer says what to do.
  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    if (typeof body?.message === 'string') throw new EmbedRefusedError(body.message);
  }
  const id = await readEmbedId(response, 'Could not turn embedding on');
  if (!id) throw new Error('Could not turn embedding on');
  return id;
}

export async function disableBoardEmbed(token: string, boardId: string): Promise<void> {
  const response = await fetch(embedUrl(boardId), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Could not turn embedding off (${response.status})`);
}

/** Where the embed page for an id lives: this editor, under /embed/. */
export function embedPageUrl(embedId: string, origin = window.location.origin): string {
  return `${origin}/embed/${encodeURIComponent(embedId)}`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** The code to paste into another site: a frame around the embed page. */
export function embedCode(embedId: string, boardName: string, origin?: string): string {
  return (
    `<iframe src="${escapeAttribute(embedPageUrl(embedId, origin))}"` +
    ` title="${escapeAttribute(boardName)}" width="800" height="500"` +
    ` style="border:0;border-radius:12px" loading="lazy" allowfullscreen></iframe>`
  );
}
