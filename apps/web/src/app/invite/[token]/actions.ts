'use server';

import { redirect } from 'next/navigation';
import {
  createClient,
  redeemShareLink,
  redeemShareLinkAsGuest,
  resolveBoardAccess,
} from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { editorUrlFor, mintEditorToken } from '@/lib/auth/editor-token';
import { setGuestSession } from '@/lib/auth/guest-session';
import { checkBoardAccess } from '@/lib/boards/access';

const db = createClient(env.DATABASE_URL);

export interface JoinResult {
  error: string;
}

/**
 * Redeeming mints a `users` row flagged `isGuest` and a `board_members` row
 * for exactly this board. The guest is a real principal from that point on, so
 * their edits persist, attribute, and audit like anyone else's; what they
 * cannot do is reach any other board.
 *
 * Returns only on failure — success redirects into the editor, which throws.
 */
export async function joinAsGuest(token: string, formData: FormData): Promise<JoinResult> {
  const displayName = String(formData.get('name') ?? '');

  const outcome = await redeemShareLinkAsGuest(db, token, displayName);
  if (!outcome.ok) {
    return { error: describeRejection(outcome.reason) };
  }

  // Read the grant back rather than assembling a BoardAccess by hand: the
  // workspace and owner ids belong in the token, and inventing empty strings
  // for them puts a lie in a signed credential.
  const access = await resolveBoardAccess(db, outcome.userId, outcome.boardId);
  if (!access) return { error: 'That board is no longer available.' };

  // Without this the guest's board stops syncing five minutes from now: editor
  // tokens are short-lived by design, and the silent re-mint needs something to
  // identify the caller. See guest-session.
  await setGuestSession(outcome.userId);

  const minted = await mintEditorToken(
    { id: outcome.userId, email: null, name: displayName.trim() || 'Guest', isGuest: true },
    access,
  );

  redirect(editorUrlFor(outcome.boardId, minted.token));
}

/**
 * Join a board as the signed-in user.
 *
 * Grants a board_members row — never a workspace membership, which would hand
 * over every other board in that workspace.
 */
export async function joinAsUser(token: string): Promise<JoinResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'You need to sign in first.' };

  const outcome = await redeemShareLink(db, token, session.user.id);
  if (!outcome.ok) return { error: describeRejection(outcome.reason) };

  // Read the access back rather than trusting the redemption's own answer:
  // the user may already have had a higher role here, and this is the same
  // resolution the sync-server will perform on connect.
  const access = await checkBoardAccess(session.user.id, outcome.boardId);
  if (!access) return { error: 'That board is no longer available.' };

  const minted = await mintEditorToken(
    {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      isGuest: false,
    },
    access,
  );

  redirect(editorUrlFor(outcome.boardId, minted.token));
}

function describeRejection(reason: string): string {
  switch (reason) {
    case 'revoked':
      return 'This link has been turned off by the board owner.';
    case 'expired':
      return 'This link has expired.';
    case 'exhausted':
      return 'This link has reached its limit of uses.';
    case 'board-deleted':
      return 'That board has been deleted.';
    case 'guests-not-allowed':
      return 'This link needs you to sign in first.';
    default:
      return 'This link is not valid.';
  }
}
