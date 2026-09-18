import { Module } from '@nestjs/common';
import { TokenService } from './token.service.js';
import { EmailService } from './email.service.js';
import { VerificationService } from './verification.service.js';
import { ResendRateLimiter } from './resend-rate-limit.service.js';
import { EmailVerificationController } from './email-verification.controller.js';
import { VerificationStatusController } from './verification-status.controller.js';

@Module({
  controllers: [EmailVerificationController, VerificationStatusController],
  providers: [TokenService, EmailService, VerificationService, ResendRateLimiter],
  exports: [VerificationService],
})
export class EmailVerificationModule {}
