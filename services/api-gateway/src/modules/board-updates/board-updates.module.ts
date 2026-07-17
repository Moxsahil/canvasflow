import { Module } from '@nestjs/common';
import { BoardUpdatesController } from './board-updates.controller';
import { BoardUpdatesService } from './board-updates.service';

@Module({
  controllers: [BoardUpdatesController],
  providers: [BoardUpdatesService],
})
export class BoardUpdatesModule {}
