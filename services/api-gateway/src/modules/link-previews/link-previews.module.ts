import { Module } from '@nestjs/common';
import { LinkPreviewsController } from './link-previews.controller.js';
import { LinkPreviewsService } from './link-previews.service.js';

@Module({
  controllers: [LinkPreviewsController],
  providers: [LinkPreviewsService],
  // Board embeds hand out the same pictures to whoever is reading an embed.
  exports: [LinkPreviewsService],
})
export class LinkPreviewsModule {}
