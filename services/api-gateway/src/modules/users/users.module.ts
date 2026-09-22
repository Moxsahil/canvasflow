import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';

/**
 * Its own module rather than a route bolted onto the auth one.
 *
 * Authentication decides whether a caller may act; this reports what their
 * account currently says. Keeping them apart is what lets the account endpoint
 * be guarded by the ordinary token guard without the auth module growing a
 * dependency on the profile it does not otherwise need.
 *
 * Shares the `users/me` prefix with the verification-status route next door,
 * which is deliberate: they are two facts about one account, and a client
 * should not have to learn two shapes of URL to ask for them.
 */
@Module({
  controllers: [UsersController],
})
export class UsersModule {}
