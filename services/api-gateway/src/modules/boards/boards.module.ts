import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller.js';
import { BoardsService } from './boards.service.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';

@Module({
  imports: [WorkspacesModule],
  controllers: [BoardsController],
  providers: [BoardsService],
})
export class BoardsModule {}
