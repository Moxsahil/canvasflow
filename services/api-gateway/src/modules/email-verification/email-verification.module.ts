import { Module } from '@nestjs/common';
import { TokenService } from './token.service.js';
import { VerificationService } from './verification.service.js';
import { ResendRateLimiter } from './resend-rate-limit.service.js';
import { EmailVerificationController } from './email-verification.controller.js';
import { VerificationStatusController } from './verification-status.controller.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [EmailModule],
  controllers: [EmailVerificationController, VerificationStatusController],
  providers: [TokenService, VerificationService, ResendRateLimiter],
  exports: [VerificationService],
})
export class EmailVerificationModule {}
