import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { MentionsController } from './mentions.controller.js';
import { DigestController } from './digest.controller.js';
import { DigestService } from './digest.service.js';
import { InternalNotifyController } from './internal-notify.controller.js';
import { MentionsService } from './mentions.service.js';
import { NotifyService } from './notify.service.js';
import { NotificationsController } from './notifications.controller.js';
import { UnsubscribeController } from './unsubscribe.controller.js';

/**
 * What an account may be emailed about, and the emails that read it: the
 * switches under `users/me/notifications`, the mention emails a comment's
 * author reports, the emails about joins and access changes, the weekly
 * digest, and turning one kind off from an email's own link.
 */
@Module({
  imports: [EmailModule],
  controllers: [
    NotificationsController,
    MentionsController,
    UnsubscribeController,
    InternalNotifyController,
    DigestController,
  ],
  providers: [MentionsService, NotifyService, DigestService],
  exports: [NotifyService],
})
export class NotificationsModule {}
