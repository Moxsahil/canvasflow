import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  listWorkspaceGuests,
  listWorkspaceMembers,
  workspaceRoleOf,
  type AvatarSource,
  type GuestBoard,
  type WorkspaceRole,
} from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { AvatarsService } from '../avatars/avatars.service.js';

/** One person in the workspace, as the editor's Settings shows them. */
export interface WorkspaceMemberView {
  userId: string;
  name: string;
  username: string | null;
  /** Only for an owner or admin, who may need to tell two Sams apart. Null otherwise. */
  email: string | null;
  role: WorkspaceRole;
  joinedAt: Date;
  /** A URL to draw their photo from, or null for the letters of their name. */
  photo: string | null;
}

/** Somebody on some of its boards by share link, without being in the workspace. */
export interface WorkspaceGuestView {
  userId: string;
  name: string;
  username: string | null;
  /** As for members — and always null for someone with no account, whose address is a placeholder. */
  email: string | null;
  /** Joined by link without an account. */
  isGuest: boolean;
  photo: string | null;
  boards: GuestBoard[];
}

export interface WorkspacePeople {
  members: WorkspaceMemberView[];
  guests: WorkspaceGuestView[];
}

/**
 * Who is in a workspace, and who else is on its boards.
 *
 * Any member may read it — knowing who you share boards with is part of being
 * in a workspace. Anyone else gets 404, the same as for a workspace that does
 * not exist or has been deleted, so ids cannot be probed.
 */
@Controller('workspaces/:workspaceId/people')
export class WorkspacePeopleController {
  constructor(
    private readonly database: DatabaseService,
    private readonly avatars: AvatarsService,
  ) {}

  /**
   * Sixty a minute per account. Settings asks when the Workspace tab opens and
   * again when somebody changes the workspace, so nobody using it comes close.
   */
  @Get()
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  // Somebody joining or leaving makes any stored copy wrong.
  @Header('Cache-Control', 'private, no-store')
  async list(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: WorkspacePeople }> {
    const db = this.database.db;
    const role = await workspaceRoleOf(db, user.id, workspaceId);
    if (!role) throw new NotFoundException('Workspace not found');

    const administers = role === 'owner' || role === 'admin';
    const [members, guests] = await Promise.all([
      listWorkspaceMembers(db, workspaceId),
      listWorkspaceGuests(db, workspaceId),
    ]);

    return {
      data: {
        members: await Promise.all(
          members.map(async ({ avatar, email, ...member }) => ({
            ...member,
            email: administers ? email : null,
            photo: await this.photo(member.userId, avatar),
          })),
        ),
        guests: await Promise.all(
          guests.map(async ({ avatar, email, ...guest }) => ({
            ...guest,
            email: administers && !guest.isGuest ? email : null,
            photo: await this.photo(guest.userId, avatar),
          })),
        ),
      },
    };
  }

  /** A photo that cannot be signed leaves the letters showing; it is no reason to withhold the list. */
  private async photo(userId: string, avatar: AvatarSource): Promise<string | null> {
    const resolved = await this.avatars.urlFor(userId, avatar).catch(() => null);
    return resolved?.url ?? null;
  }
}
