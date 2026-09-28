import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { AccountDeletionController } from './account-deletion.controller.js';
import { AccountDeletionService } from './account-deletion.service.js';

/**
 * Asking for your own account to be deleted. The erasure itself runs later, as
 * a scheduled job outside this service.
 */
@Module({
  imports: [AuthModule, EmailModule],
  controllers: [AccountDeletionController],
  providers: [AccountDeletionService],
})
export class AccountDeletionModule {}
