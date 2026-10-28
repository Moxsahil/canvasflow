'use server';

import { redirect } from 'next/navigation';
import { acceptWorkspaceInvite, boardToOpenInWorkspace, createClient } from '@canvasflow/db';
import { env } from '@/lib/env';
import { currentUser } from '@/lib/auth/session';
import { editorUrlFor, mintEditorToken } from '@/lib/auth/editor-token';
import { checkBoardAccess } from '@/lib/boards/access';
import { notifyGateway } from '@/lib/gateway/internal';
import { notifyWorkspaceChanged } from '@/lib/sync/internal';

const db = createClient(env.DATABASE_URL);

export interface AcceptResult {
  error: string;
}

/**
 * Accept a workspace invitation as the signed-in user, and open the
 * workspace's most recent board.
 *
 * Here beside the page, as the share-link join is, rather than a gateway
 * route: it ends in a redirect into the editor with a freshly minted board
 * token, which is this app's job. Everything it decides is in
 * `acceptWorkspaceInvite`, shared with anything else that ever accepts one.
 *
 * Returns only on failure — success redirects, which throws.
 */
export async function acceptInvite(token: string): Promise<AcceptResult> {
  const user = await currentUser();
  if (!user) return { error: 'You need to sign in first.' };

  const outcome = await acceptWorkspaceInvite(db, token, user.id);
  if (!outcome.ok) return { error: describeRefusal(outcome.reason) };

  // Made before telling anyone, in case the workspace had no board and this
  // is its first: the sidebars re-read once and see both.
  const board = await boardToOpenInWorkspace(db, user.id, outcome.workspaceId);

  // Everyone already in the workspace sees the new face in their member list,
  // and the person joining has the workspace appear in any other tab they
  // have open.
  if (outcome.joined) {
    await notifyWorkspaceChanged(outcome.workspaceId, [user.id]);
    // Whoever sent the invitation may be emailed that it was accepted,
    // and a Team plan adds a seat for the person joining.
    await notifyGateway({
      event: 'workspace-joined',
      inviteId: outcome.inviteId,
      workspaceId: outcome.workspaceId,
    });
  }

  const access = board && (await checkBoardAccess(user.id, board.id));
  if (!board || !access) return { error: 'That workspace is no longer available.' };

  const minted = await mintEditorToken(
    { id: user.id, email: user.email, name: user.name, isGuest: false },
    access,
    user.sessionId,
  );

  redirect(editorUrlFor(board.id, minted.token));
}

function describeRefusal(reason: string): string {
  switch (reason) {
    case 'wrong-account':
      return 'This invitation is for a different email address. Sign in with that one to accept it.';
    case 'no-account':
      return 'Sign in with an account to accept this invitation.';
    case 'revoked':
      return 'This invitation was taken back.';
    case 'expired':
      return 'This invitation has expired. Ask for a new one.';
    case 'accepted':
      return 'This invitation has already been used.';
    case 'workspace-deleted':
      return 'That workspace has been deleted.';
    default:
      return 'This invitation is not valid.';
  }
}
