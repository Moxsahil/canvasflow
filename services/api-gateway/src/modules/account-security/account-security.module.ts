import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { PasswordResetModule } from '../password-reset/password-reset.module.js';
import { AccountSecurityController } from './account-security.controller.js';
import { AccountSecurityService } from './account-security.service.js';

/**
 * Account & Security for a signed-in account: its password, how it signs in,
 * and where it is signed in. Signing out everywhere stays in AuthModule, beside
 * signing out.
 */
@Module({
  imports: [AuthModule, EmailModule, PasswordResetModule],
  controllers: [AccountSecurityController],
  providers: [AccountSecurityService],
})
export class AccountSecurityModule {}
