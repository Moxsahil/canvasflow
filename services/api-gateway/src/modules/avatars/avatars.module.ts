import { Module } from '@nestjs/common';
import { BoardAvatarsController, MyAvatarController } from './avatars.controller.js';
import { AvatarsService } from './avatars.service.js';

@Module({
  controllers: [MyAvatarController, BoardAvatarsController],
  providers: [AvatarsService],
  // The workspace member list draws everyone's photo through it.
  exports: [AvatarsService],
})
export class AvatarsModule {}
