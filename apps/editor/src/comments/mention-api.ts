import { env } from '@/lib/env';

/**
 * Tell the API gateway a comment naming people was just posted or edited, so
 * they are emailed. Says which comment and nothing more: the gateway reads
 * the comment off the board itself, so nothing typed here reaches an email
 * any other way.
 *
 * Sent and forgotten. An email nobody gets is not worth interrupting the
 * person who wrote the comment over, and the comment itself is already on the
 * board for everyone.
 */
export function reportMentions(
  token: string | null,
  boardId: string,
  threadId: string,
  commentId: string,
): void {
  void fetch(`${env.VITE_API_URL}/boards/${boardId}/mentions`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ threadId, commentId }),
    keepalive: true,
  }).catch(() => {});
}
