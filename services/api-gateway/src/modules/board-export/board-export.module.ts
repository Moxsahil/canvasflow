import { Module } from '@nestjs/common';
import { BoardExportController } from './board-export.controller.js';

@Module({
  controllers: [BoardExportController],
})
export class BoardExportModule {}
