import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { getProfile, resolveBoardAccess } from '@canvasflow/db';
import { parseEnv } from '../../config/env.js';
import { safeRedirect } from '../../common/safe-redirect.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { EditorTokenService, type MintedBoardToken } from './editor-token.service.js';
import { SessionRenewalService } from './session-renewal.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where somebody lands when a resumed session was not headed anywhere in particular. */
const DEFAULT_NEXT = '/open';

/**
 * The two places a session is kept alive without the browser doing anything.
 *
 * Both live under `/auth` because that is the only path the refresh cookie is
 * sent to, and both renew the session themselves when it needs it. Between
 * them they cover the two ways somebody comes back to CanvasFlow: an editor
 * that has been open for hours, and a page opened days later.
 */
@Controller('auth')
export class SessionController {
  constructor(
    private readonly renewal: SessionRenewalService,
    private readonly database: DatabaseService,
    private readonly editorTokens: EditorTokenService,
  ) {}

  /**
   * A board token for a signed-in account, renewing the session if it needs it.
   *
   * The editor re-mints its board token every few minutes. Routing that through
   * here is what keeps an editor open all day signed in: each re-mint that
   * lands near the end of the access token's life replaces it, so the session
   * never lapses while the board is open. After a laptop has slept for hours,
   * the first re-mint renews from the refresh cookie and the editor reconnects.
   *
   * Accounts only. A guest's session is a cookie the web app sets on its own
   * host, which never reaches this service, so guests keep using the web app's
   * route. The editor picks between the two from the token it already holds.
   *
   * Refusals mirror the web route exactly, because the editor reads the
   * status: 401 means no session, and 404 covers both a missing board and one
   * this account cannot open, so board ids cannot be probed for existence.
   *
   * Generously throttled. The editor calls this every few minutes per open
   * board, and several tabs behind one office address add up.
   */
  @Get('editor-token')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async editorToken(
    @Query('boardId') boardId: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MintedBoardToken> {
    const session = await this.renewal.resolve(request, response);
    if (!session) throw new UnauthorizedException('Not authenticated');

    if (!boardId) throw new BadRequestException('boardId is required');
    // Malformed ids never reach the database.
    if (!UUID.test(boardId)) throw new NotFoundException('Board not found');

    const db = this.database.db;
    const profile = await getProfile(db, session.userId);
    if (!profile || profile.isGuest) throw new UnauthorizedException('Not authenticated');

    const access = await resolveBoardAccess(db, session.userId, boardId);
    if (!access) throw new NotFoundException('Board not found');

    return this.editorTokens.mint(
      { id: profile.id, email: profile.email, name: profile.name, isGuest: false },
      access,
    );
  }

  /**
   * Pick up a session where it was left, then carry on to the page asked for.
   *
   * The web app sends somebody here when a page load finds no usable access
   * token. That app cannot renew anything itself — the refresh cookie is
   * scoped to this service's `/auth` routes and never reaches it — so it hands
   * the browser over, this renews from the refresh cookie, and the browser
   * goes back where it was going with fresh credentials. Somebody who has been
   * away for two days sees a redirect, not a sign-in form.
   *
   * With nothing to renew from, it goes to the sign-in page instead, carrying
   * the same destination so signing in finishes the trip.
   *
   * The destination is a path on the web app and nothing else: `safeRedirect`
   * reduces it before either redirect is built, the same rule the web app
   * applies, so this cannot be turned into an open redirect.
   */
  @Get('resume')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async resume(
    @Query('next') next: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const destination = safeRedirect(next, DEFAULT_NEXT);
    const webUrl = parseEnv().WEB_URL;

    const session = await this.renewal.resolve(request, response);

    if (session) {
      response.redirect(new URL(destination, webUrl).toString());
      return;
    }

    const signIn = new URL('/login', webUrl);
    signIn.searchParams.set('next', destination);
    response.redirect(signIn.toString());
  }
}
