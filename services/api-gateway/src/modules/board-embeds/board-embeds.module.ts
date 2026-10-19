import { Module } from '@nestjs/common';
import { LinkPreviewsModule } from '../link-previews/link-previews.module.js';
import { BoardEmbedSettingsController, EmbedsController } from './board-embeds.controller.js';
import { BoardEmbedsService } from './board-embeds.service.js';

@Module({
  imports: [LinkPreviewsModule],
  controllers: [BoardEmbedSettingsController, EmbedsController],
  providers: [BoardEmbedsService],
})
export class BoardEmbedsModule {}
