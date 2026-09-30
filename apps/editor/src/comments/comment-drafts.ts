/**
 * What was being typed into a composer, kept after the composer has gone.
 *
 * A composer closes on a press anywhere else, with no "discard?" in the way —
 * which is only fair if what was typed is still there when it opens again. One
 * draft a thread, and one more for a thread that does not exist yet.
 *
 * For the life of the tab and no longer: a half-written reply is not worth
 * finding a week later under a pin nobody remembers clicking.
 */
const drafts = new Map<string, string>();

/** The key for the comment being placed, which has no thread to be filed under. */
export const NEW_THREAD_DRAFT = 'new';

export function commentDraft(key: string): string {
  return drafts.get(key) ?? '';
}

export function saveCommentDraft(key: string, body: string): void {
  if (body.length > 0) drafts.set(key, body);
  else drafts.delete(key);
}

export function clearCommentDraft(key: string): void {
  drafts.delete(key);
}
