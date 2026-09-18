import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationModule } from '../email-verification/email-verification.module.js';

@Module({
  imports: [EmailVerificationModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
