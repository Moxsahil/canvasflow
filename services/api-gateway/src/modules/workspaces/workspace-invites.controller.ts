import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createWorkspaceInvite,
  getProfile,
  isInvitableRole,
  parseInviteEmail,
  resendWorkspaceInvite,
  revokeWorkspaceInvite,
  workspaceRoleOf,
  workspaces,
  type PendingInvite,
} from '@canvasflow/db';
import { eq } from 'drizzle-orm';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { EmailService } from '../email/email.service.js';
import { canInvite, describeCreateRefusal } from './invite-rules.js';
import { WorkspaceEventsService } from './workspace-events.service.js';

const HOUR_MS = 60 * 60 * 1000;

/** An invitation just sent, and whether the mail provider took the email. */
export interface SentInvite {
  invite: PendingInvite;
  /**
   * False when the invitation was saved but its email did not go — the
   * provider was down or refused it. The editor says so, and Resend is how
   * to try again.
   */
  emailSent: boolean;
}

/**
 * Inviting people into a workspace by email, sending an invitation again, and
 * taking one back. Accepting happens on the web app's /join page, which the
 * email links to.
 *
 * Only the people who run the workspace may: anyone else in it is told so,
 * and anyone outside it gets 404, the same as for a workspace that does not
 * exist, so ids cannot be probed. Every route checks Origin, because the
 * session cookie is the credential and another site must not be able to send
 * invitations from a visitor's signed-in browser.
 *
 * The list of open invitations is read with the people, from
 * `workspaces/:id/people`, so the Members window needs one request.
 */
@Controller('workspaces/:workspaceId/invites')
@UseGuards(JwtAuthGuard, AccountThrottlerGuard)
export class WorkspaceInvitesController {
  private readonly env = parseEnv();

  constructor(
    private readonly database: DatabaseService,
    private readonly email: EmailService,
    private readonly events: WorkspaceEventsService,
  ) {}

  /**
   * Invite an address. 409 when it is already in the workspace or already
   * invited. Thirty an hour per account: a team being set up comes nowhere
   * near it, and somebody using us to send mail to strangers stops there.
   */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 30, ttl: HOUR_MS } })
  async invite(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: SentInvite }> {
    this.checkOrigin(origin);
    await this.authorize(workspaceId, user);

    // Inviting sends mail from us to an address somebody typed, so it is the
    // action a confirmed address is required for, as minting a share link is.
    const profile = await getProfile(this.database.db, user.id);
    if (!profile || profile.isGuest) {
      throw new ForbiddenException('Create an account to invite people.');
    }
    if (!profile.emailVerified) {
      throw new ForbiddenException({
        message:
          'Confirm your email address before inviting people. Check your inbox, or send yourself a new link from Settings.',
        error: 'Forbidden',
        code: 'email-not-verified',
      });
    }

    const input = (body ?? {}) as { email?: unknown; role?: unknown };
    const parsed = parseInviteEmail(input.email);
    if (!parsed.ok) throw new BadRequestException(parsed.error);
    const role = input.role === undefined ? 'member' : input.role;
    if (!isInvitableRole(role))
      throw new BadRequestException('Invite people as a member or an admin.');

    const outcome = await createWorkspaceInvite(this.database.db, {
      workspaceId,
      email: parsed.email,
      role,
      invitedBy: user.id,
    });
    if (!outcome.ok) {
      const refusal = describeCreateRefusal(outcome.reason, parsed.email);
      throw new HttpException(
        refusal.code
          ? { message: refusal.message, error: 'Conflict', code: refusal.code }
          : refusal.message,
        refusal.status,
      );
    }

    const emailSent = await this.sendEmail(workspaceId, outcome.invite, outcome.token);
    this.events.changed(workspaceId);
    return { data: { invite: outcome.invite, emailSent } };
  }

  /**
   * Send an invitation again, with a new link and a fresh week. The link in
   * the earlier email stops working. Once a minute per invitation, and twenty
   * an hour per account.
   */
  @Post(':inviteId/resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: HOUR_MS } })
  async resend(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Param('inviteId', new ParseUUIDPipe({ version: '4' })) inviteId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: SentInvite }> {
    this.checkOrigin(origin);
    await this.authorize(workspaceId, user);

    const outcome = await resendWorkspaceInvite(this.database.db, {
      workspaceId,
      inviteId,
      actorId: user.id,
    });
    if (!outcome.ok) {
      if (outcome.reason === 'too-soon') {
        throw new ConflictException('It was sent a moment ago. Give it a minute to arrive.');
      }
      throw new NotFoundException('That invitation was already answered or taken back.');
    }

    const emailSent = await this.sendEmail(workspaceId, outcome.invite, outcome.token);
    this.events.changed(workspaceId);
    return { data: { invite: outcome.invite, emailSent } };
  }

  /** Take an invitation back. Its link stops working at once. */
  @Delete(':inviteId')
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async revoke(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Param('inviteId', new ParseUUIDPipe({ version: '4' })) inviteId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    this.checkOrigin(origin);
    await this.authorize(workspaceId, user);

    const revoked = await revokeWorkspaceInvite(this.database.db, {
      workspaceId,
      inviteId,
      actorId: user.id,
    });
    if (!revoked)
      throw new NotFoundException('That invitation was already answered or taken back.');
    this.events.changed(workspaceId);
  }

  private checkOrigin(origin: string | undefined): void {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }
  }

  private async authorize(workspaceId: string, user: AuthenticatedUser): Promise<void> {
    const role = await workspaceRoleOf(this.database.db, user.id, workspaceId);
    if (!role) throw new NotFoundException('Workspace not found');
    if (!canInvite(role)) {
      throw new ForbiddenException('Only the owner or an admin can invite people.');
    }
  }

  /**
   * The email, built from what the invitation says now. Never throws: the
   * invitation is saved whatever the provider does, and Resend is the way to
   * try the email again.
   */
  private async sendEmail(
    workspaceId: string,
    invite: PendingInvite,
    token: string,
  ): Promise<boolean> {
    const [workspace] = await this.database.db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    return this.email.sendWorkspaceInvite(
      { to: invite.email, inviteId: invite.id },
      {
        joinUrl: new URL(`/join/${token}`, this.env.WEB_URL).toString(),
        expiresAt: invite.expiresAt,
        inviterName: invite.invitedByName,
        workspaceName: workspace?.name ?? 'a workspace',
        role: invite.role,
      },
    );
  }
}
