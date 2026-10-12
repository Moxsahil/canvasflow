import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';
import {
  acceptOwnership,
  changeMemberRole,
  isAssignableRole,
  isGuestRole,
  leaveWorkspace,
  offerOwnership,
  removeGuest,
  removeMember,
  setGuestRole,
  users,
  withdrawOwnershipOffer,
  workspaceRoleOf,
  workspaces,
} from '@canvasflow/db';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { EmailService } from '../email/email.service.js';
import { describeMemberRefusal, type MemberAction, type MemberRefusal } from './member-rules.js';
import { WorkspaceEventsService } from './workspace-events.service.js';

/** What leaving or removing someone did with what they owned. */
export interface DepartureView {
  /** How many boards passed to the workspace's owner. */
  boardsPassed: number;
}

/**
 * Who is in a workspace and as what: changing someone between member and
 * admin, removing them, leaving, and handing the ownership over.
 *
 * Anyone outside the workspace gets 404 for all of it, as for every route
 * about a workspace, so ids cannot be probed. What each role may do is the
 * table in `@canvasflow/types`, applied again inside each change's own locked
 * transaction — the check here only turns away the plainly outside early.
 *
 * Every change is told to the sync-server, so the people in the workspace see
 * it at once; somebody taken out also loses the boards they have open within
 * a second, rather than at the next sweep.
 */
@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, AccountThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class WorkspaceMembersController {
  private readonly env = parseEnv();

  constructor(
    private readonly database: DatabaseService,
    private readonly email: EmailService,
    private readonly events: WorkspaceEventsService,
  ) {}

  /** Make someone a member or an admin. */
  @Patch('members/:userId')
  @HttpCode(204)
  async changeRole(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    await this.enter(workspaceId, user, origin);
    const role = (body as { role?: unknown } | null)?.role;
    if (!isAssignableRole(role)) throw new BadRequestException('Choose member or admin.');

    const outcome = await changeMemberRole(this.database.db, {
      workspaceId,
      actorId: user.id,
      userId,
      role,
    });
    if (!outcome.ok) throw refused('role', outcome.reason);
    if (outcome.changed) this.events.changed(workspaceId);
  }

  /** Take someone out of the workspace. Their boards pass to the owner. */
  @Delete('members/:userId')
  async remove(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: DepartureView }> {
    await this.enter(workspaceId, user, origin);

    const outcome = await removeMember(this.database.db, { workspaceId, actorId: user.id, userId });
    if (!outcome.ok) throw refused('remove', outcome.reason);

    this.events.changed(workspaceId, [userId]);
    this.events.boardAccessChanged(outcome.boardIds, userId);
    return { data: { boardsPassed: outcome.boardsPassed } };
  }

  /**
   * Set what a guest — somebody on its boards by share link, not in the
   * workspace — may do, on every board of this workspace they are on.
   */
  @Patch('guests/:userId')
  @HttpCode(204)
  async changeGuestRole(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    await this.enter(workspaceId, user, origin);
    const role = (body as { role?: unknown } | null)?.role;
    if (!isGuestRole(role)) throw new BadRequestException('Choose can edit or can view.');

    const outcome = await setGuestRole(this.database.db, {
      workspaceId,
      actorId: user.id,
      userId,
      role,
    });
    if (!outcome.ok) throw refused('guest', outcome.reason);

    this.events.changed(workspaceId, [userId]);
    // Their open boards turn read-only, or editable, without a reconnect.
    this.events.boardAccessChanged(outcome.boardIds, userId);
  }

  /** Take a guest off every board of this workspace they are on. */
  @Delete('guests/:userId')
  @HttpCode(204)
  async removeGuest(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    await this.enter(workspaceId, user, origin);
    const outcome = await removeGuest(this.database.db, { workspaceId, actorId: user.id, userId });
    if (!outcome.ok) throw refused('guest', outcome.reason);

    // Told too, though no longer on them: the boards leave their shared list.
    this.events.changed(workspaceId, [userId]);
    this.events.boardAccessChanged(outcome.boardIds, userId);
  }

  /** Leave the workspace. The owner hands it over first. */
  @Post('leave')
  @HttpCode(200)
  async leave(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: DepartureView }> {
    await this.enter(workspaceId, user, origin);

    const outcome = await leaveWorkspace(this.database.db, { workspaceId, userId: user.id });
    if (!outcome.ok) throw refused('leave', outcome.reason);

    this.events.changed(workspaceId, [user.id]);
    this.events.boardAccessChanged(outcome.boardIds, user.id);
    return { data: { boardsPassed: outcome.boardsPassed } };
  }

  /**
   * Offer the ownership to another member, replacing any offer already out.
   * They are emailed, and answer in Settings; nothing changes until they do.
   */
  @Post('ownership-offer')
  @HttpCode(204)
  async offer(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    await this.enter(workspaceId, user, origin);
    const toUserId = (body as { userId?: unknown } | null)?.userId;
    if (typeof toUserId !== 'string' || !UUID.test(toUserId)) {
      throw new BadRequestException('Choose who to hand the workspace to.');
    }

    const outcome = await offerOwnership(this.database.db, {
      workspaceId,
      ownerId: user.id,
      toUserId,
    });
    if (!outcome.ok) throw refused('offer', outcome.reason);

    this.events.changed(workspaceId);
    await this.emailOffer(workspaceId, user.id, toUserId);
  }

  /** Take the offer back (the owner) or turn it down (the person offered it). */
  @Delete('ownership-offer')
  @HttpCode(204)
  async withdraw(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    await this.enter(workspaceId, user, origin);
    const outcome = await withdrawOwnershipOffer(this.database.db, {
      workspaceId,
      actorId: user.id,
    });
    if (!outcome.ok) throw refused('withdraw', outcome.reason);
    this.events.changed(workspaceId);
  }

  /** Accept the ownership. The previous owner becomes an admin. */
  @Post('ownership-offer/accept')
  @HttpCode(204)
  async accept(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    await this.enter(workspaceId, user, origin);
    const outcome = await acceptOwnership(this.database.db, { workspaceId, userId: user.id });
    if (!outcome.ok) throw refused('accept', outcome.reason);
    this.events.changed(workspaceId);
  }

  /**
   * The checks every route here starts with: a browser request from one of
   * ours, by someone in the workspace. The session cookie is the credential,
   * so another site must not be able to make these changes from a visitor's
   * signed-in browser.
   */
  private async enter(
    workspaceId: string,
    user: AuthenticatedUser,
    origin: string | undefined,
  ): Promise<void> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }
    if (!(await workspaceRoleOf(this.database.db, user.id, workspaceId))) {
      throw new NotFoundException('Workspace not found');
    }
  }

  /** Never throws: the offer stands whatever the provider does, and Settings shows it. */
  private async emailOffer(workspaceId: string, ownerId: string, toUserId: string): Promise<void> {
    const db = this.database.db;
    const [[workspace], [owner], [recipient]] = await Promise.all([
      db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)),
      db.select({ name: users.name }).from(users).where(eq(users.id, ownerId)),
      db
        .select({ email: users.email, isGuest: users.isGuest })
        .from(users)
        .where(eq(users.id, toUserId)),
    ]);
    if (!workspace || !owner || !recipient || recipient.isGuest) return;

    await this.email.sendOwnershipOffer(
      { to: recipient.email, userId: toUserId },
      {
        openUrl: new URL('/open', this.env.WEB_URL).toString(),
        ownerName: owner.name,
        workspaceName: workspace.name,
      },
    );
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refused(action: MemberAction, reason: MemberRefusal): HttpException {
  const { status, message, code } = describeMemberRefusal(action, reason);
  return new HttpException(code ? { message, statusCode: status, code } : message, status);
}
