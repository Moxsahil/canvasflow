import { Module } from '@nestjs/common';
import { AvatarsModule } from '../avatars/avatars.module.js';
import { EmailModule } from '../email/email.module.js';
import { SharedBoardsController } from './shared-boards.controller.js';
import { WorkspaceEventsService } from './workspace-events.service.js';
import { WorkspaceInvitesController } from './workspace-invites.controller.js';
import { WorkspaceMembersController } from './workspace-members.controller.js';
import { WorkspacePeopleController } from './workspace-people.controller.js';

/**
 * Running a workspace: who is in it, and — as it grows — inviting people,
 * their roles, and leaving. Listing workspaces and their boards is still the
 * web app's, which the editor's board switcher reads.
 */
@Module({
  imports: [AvatarsModule, EmailModule],
  controllers: [
    WorkspacePeopleController,
    WorkspaceInvitesController,
    WorkspaceMembersController,
    SharedBoardsController,
  ],
  providers: [WorkspaceEventsService],
})
export class WorkspacesModule {}
