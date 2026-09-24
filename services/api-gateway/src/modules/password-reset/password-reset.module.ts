import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetService } from './password-reset.service.js';
import { ResetRequestLimiter } from './reset-request-limiter.service.js';
import { ResetTokenService } from './reset-token.service.js';

/**
 * Forgot password and reset password.
 *
 * Its own module rather than part of AuthModule, because nothing here signs
 * anybody in — it replaces a credential and ends sessions, using the pieces
 * AuthModule exports for exactly that.
 */
@Module({
  imports: [AuthModule, EmailModule],
  controllers: [PasswordResetController],
  providers: [PasswordResetService, ResetTokenService, ResetRequestLimiter],
})
export class PasswordResetModule {}
