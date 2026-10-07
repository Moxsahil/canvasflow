import { Module } from '@nestjs/common';
import { AvatarsModule } from '../avatars/avatars.module.js';
import { WorkspaceMembersController } from './workspace-members.controller.js';

/**
 * Running a workspace: who is in it, and — as it grows — inviting people,
 * their roles, and leaving. Listing workspaces and their boards is still the
 * web app's, which the editor's board switcher reads.
 */
@Module({
  imports: [AvatarsModule],
  controllers: [WorkspaceMembersController],
})
export class WorkspacesModule {}
