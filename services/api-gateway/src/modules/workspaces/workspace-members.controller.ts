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
import { listWorkspaceMembers, workspaceRoleOf, type WorkspaceRole } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { AvatarsService } from '../avatars/avatars.service.js';

/** One person in the list, as the editor's Settings shows them. */
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

/**
 * Who is in a workspace.
 *
 * Any member may read it — knowing who you share boards with is part of being
 * in a workspace. Anyone else gets 404, the same as for a workspace that does
 * not exist or has been deleted, so ids cannot be probed.
 */
@Controller('workspaces/:workspaceId/members')
export class WorkspaceMembersController {
  constructor(
    private readonly database: DatabaseService,
    private readonly avatars: AvatarsService,
  ) {}

  /**
   * Sixty a minute per account. Settings asks once each time the Workspace tab
   * opens, so nobody using it comes close.
   */
  @Get()
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  // Somebody joining or leaving makes any stored copy wrong.
  @Header('Cache-Control', 'private, no-store')
  async list(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: WorkspaceMemberView[] }> {
    const db = this.database.db;
    const role = await workspaceRoleOf(db, user.id, workspaceId);
    if (!role) throw new NotFoundException('Workspace not found');

    const administers = role === 'owner' || role === 'admin';
    const members = await listWorkspaceMembers(db, workspaceId);

    const data = await Promise.all(
      members.map(async ({ avatar, email, ...member }) => ({
        ...member,
        email: administers ? email : null,
        // A photo that cannot be signed leaves the letters showing; it is no
        // reason to withhold the list.
        photo: (await this.avatars.urlFor(member.userId, avatar).catch(() => null))?.url ?? null,
      })),
    );
    return { data };
  }
}
