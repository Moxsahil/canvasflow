import { Module } from '@nestjs/common';
import { LinkPreviewsController } from './link-previews.controller.js';
import { LinkPreviewsService } from './link-previews.service.js';

@Module({
  controllers: [LinkPreviewsController],
  providers: [LinkPreviewsService],
})
export class LinkPreviewsModule {}
