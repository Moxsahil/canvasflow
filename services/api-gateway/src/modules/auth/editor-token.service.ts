import { Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import type { BoardAccess } from '@canvasflow/db';
import { parseEnv } from '../../config/env.js';

/**
 * How long a board token lives.
 *
 * Short on purpose: it is the window in which revoked board access still
 * works. The editor re-mints silently before expiry, so nobody sees the edge.
 */
export const BOARD_TOKEN_TTL_SECONDS = 5 * 60;

export interface BoardTokenIdentity {
  id: string;
  email: string | null;
  name: string | null;
  isGuest: boolean;
}

/**
 * The response shape the editor already reads, unwrapped.
 *
 * Every other route in this service answers `{ data: ... }`. This one does
 * not, because it replaces the web app's `/api/editor-token` for signed-in
 * accounts and the editor parses the body without knowing which served it.
 */
export interface MintedBoardToken {
  token: string;
  expiresAt: number;
  boardId: string;
}

/**
 * Signs a board-scoped token for the editor and the sync-server.
 *
 * Claim for claim what the web app has always minted, signed with the same
 * secret, so the sync-server and this service's own guard accept it without
 * knowing where it came from. Change one side and the other has to follow.
 *
 * `role` is the caller's role on the board, re-derived from the database on
 * every mint and re-checked on every socket connect, so the token is never the
 * source of truth for permission — only a short-lived statement of what was
 * true a moment ago.
 */
@Injectable()
export class EditorTokenService {
  private readonly secret = new TextEncoder().encode(parseEnv().AUTH_SECRET);

  /**
   * `sessionId` is the signed-in session the token is minted from. It goes in
   * as `sid`, so the board token stops working — here and at the sync-server —
   * the moment that session is ended, instead of living out its five minutes.
   */
  async mint(
    identity: BoardTokenIdentity,
    access: BoardAccess,
    sessionId: string,
  ): Promise<MintedBoardToken> {
    const expiresAt = Date.now() + BOARD_TOKEN_TTL_SECONDS * 1000;

    const token = await new SignJWT({
      sid: sessionId,
      id: identity.id,
      email: identity.email,
      name: identity.name,
      isGuest: identity.isGuest,
      boardId: access.boardId,
      workspaceId: access.workspaceId,
      role: access.role,
      accessSource: access.source,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .setIssuedAt()
      .sign(this.secret);

    return { token, expiresAt, boardId: access.boardId };
  }
}
