import { Module } from '@nestjs/common';
import { UsernamesController } from './usernames.controller.js';

/**
 * Usernames, on their own. Under the `users/me` prefix with the account and
 * its photo, as another fact about one account; a module of its own because
 * it needs nothing from them, and they nothing from it.
 */
@Module({
  controllers: [UsernamesController],
})
export class UsernamesModule {}
