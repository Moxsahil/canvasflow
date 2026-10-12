import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';

/**
 * What an account may be emailed about. Under the `users/me` prefix with the
 * account's other facts; a module of its own because the email that reads
 * these switches will grow here, not in the account's.
 */
@Module({
  controllers: [NotificationsController],
})
export class NotificationsModule {}
