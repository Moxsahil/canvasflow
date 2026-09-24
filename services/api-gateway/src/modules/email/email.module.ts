import { Module } from '@nestjs/common';
import { EmailService } from './email.service.js';

/** The mail boundary, shared by email verification and password recovery. */
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
