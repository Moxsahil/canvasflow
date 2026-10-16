import { Module } from '@nestjs/common';
import { AvatarsModule } from '../avatars/avatars.module.js';
import { EmailModule } from '../email/email.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SharedBoardsController } from './shared-boards.controller.js';
import { WorkspaceBoardsController } from './workspace-boards.controller.js';
import { WorkspaceEventsService } from './workspace-events.service.js';
import { WorkspaceInvitesController } from './workspace-invites.controller.js';
import { WorkspaceMembersController } from './workspace-members.controller.js';
import { WorkspacePeopleController } from './workspace-people.controller.js';

/**
 * Running a workspace: who is in it, inviting people, their roles, leaving,
 * and the boards it holds. Listing, creating, renaming and deleting
 * workspaces themselves is still the web app's.
 */
@Module({
  imports: [AvatarsModule, EmailModule, NotificationsModule],
  controllers: [
    WorkspacePeopleController,
    WorkspaceInvitesController,
    WorkspaceMembersController,
    SharedBoardsController,
    WorkspaceBoardsController,
  ],
  providers: [WorkspaceEventsService],
  // The board routes tell the workspace about a rename or a delete as well.
  exports: [WorkspaceEventsService],
})
export class WorkspacesModule {}
