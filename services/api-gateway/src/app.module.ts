import { Module } from '@nestjs/common';
import { DatabaseModule } from './infra/database/database.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { BoardsModule } from './modules/boards/boards.module.js';
import { ImagesModule } from './modules/images/images.module.js';
import { AvatarsModule } from './modules/avatars/avatars.module.js';
import { EmailVerificationModule } from './modules/email-verification/email-verification.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AppController } from './app.controller.js';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    /**
     * A fallback only. Every route that takes the guard names its own budget,
     * because the sensible number for creating an account is not the sensible
     * number for opening a verification link.
     *
     * Counted in this process's memory, which is sound while the service runs
     * as a single always-on machine: one process sees every request. It resets
     * on deploy, which is acceptable for an abuse limit and would not be for
     * anything that has to be exact. A shared store is what changes that, and
     * it is not needed yet.
     */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),

    DatabaseModule,
    StorageModule,
    HealthModule,
    BoardsModule,
    ImagesModule,
    AvatarsModule,
    EmailVerificationModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
