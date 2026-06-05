import { Module } from '@nestjs/common';
import { DatabaseModule } from './infra/database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { BoardsModule } from './modules/boards/boards.module.js';

@Module({
  imports: [DatabaseModule, HealthModule, BoardsModule],
})
export class AppModule {}
