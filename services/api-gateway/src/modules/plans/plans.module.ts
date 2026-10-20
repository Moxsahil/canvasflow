import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { PlansService } from './plans.service.js';

/**
 * Plans: which one a workspace is on, and moving it to another. The rules for
 * what each plan allows live in `@canvasflow/types`, where the editor reads
 * them too.
 */
@Module({
  imports: [WorkspacesModule],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
