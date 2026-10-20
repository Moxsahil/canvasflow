import { Module } from '@nestjs/common';
import { DatabaseModule } from './infra/database/database.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { SyncModule } from './infra/sync/sync.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { BoardsModule } from './modules/boards/boards.module.js';
import { ImagesModule } from './modules/images/images.module.js';
import { AvatarsModule } from './modules/avatars/avatars.module.js';
import { EmailVerificationModule } from './modules/email-verification/email-verification.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PasswordResetModule } from './modules/password-reset/password-reset.module.js';
import { AccountSecurityModule } from './modules/account-security/account-security.module.js';
import { AccountDeletionModule } from './modules/account-deletion/account-deletion.module.js';
import { LibraryModule } from './modules/library/library.module.js';
import { BoardExportModule } from './modules/board-export/board-export.module.js';
import { UsernamesModule } from './modules/usernames/usernames.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { LinkPreviewsModule } from './modules/link-previews/link-previews.module.js';
import { BoardEmbedsModule } from './modules/board-embeds/board-embeds.module.js';
import { PlansModule } from './modules/plans/plans.module.js';
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
    SyncModule,
    HealthModule,
    BoardsModule,
    ImagesModule,
    AvatarsModule,
    EmailVerificationModule,
    AuthModule,
    PasswordResetModule,
    AccountSecurityModule,
    AccountDeletionModule,
    LibraryModule,
    BoardExportModule,
    UsersModule,
    UsernamesModule,
    WorkspacesModule,
    NotificationsModule,
    LinkPreviewsModule,
    BoardEmbedsModule,
    PlansModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
