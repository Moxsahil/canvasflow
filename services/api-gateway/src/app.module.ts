import { Module } from '@nestjs/common';
import { DatabaseModule } from './infra/database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { BoardsModule } from './modules/boards/boards.module.js';
import { BoardUpdatesModule } from './modules/board-updates/board-updates.module.js';
import { ImagesModule } from './modules/images/images.module.js';
import { AppController } from './app.controller.js';

@Module({
  imports: [DatabaseModule, HealthModule, BoardsModule, BoardUpdatesModule, ImagesModule],
  controllers: [AppController],
})
export class AppModule {}
