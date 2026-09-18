import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { parseEnv } from '../../config/env.js';

export interface VerificationMessage {
  to: string;
  verificationUrl: string;
  expiresAt: Date;
}

/**
 * The only place in the service that speaks to the mail provider.
 *
 * A boundary rather than a call inlined where it is needed, because the thing
 * most likely to change here is how a message is dispatched. Putting a queue
 * and a worker behind this later is then a change to one class rather than to
 * the shape of account creation.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly env = parseEnv();
  private readonly client = this.env.RESEND_API_KEY ? new Resend(this.env.RESEND_API_KEY) : null;

  /**
   * Send a verification link, reporting whether the provider took it.
   *
   * Never throws. A provider that is down, rate limiting us, or simply not
   * configured must not undo an account that was just created: the address
   * stays unconfirmed, and the resend flow is how the person recovers. A
   * caller that treated delivery as required would turn an outage into
   * failed signups.
   */
  async sendVerification(message: VerificationMessage): Promise<boolean> {
    if (!this.client) {
      this.logger.warn('RESEND_API_KEY is unset, so no verification email was sent');
      return false;
    }

    const minutes = Math.max(1, Math.round((message.expiresAt.getTime() - Date.now()) / 60_000));

    try {
      await this.client.emails.send({
        from: this.env.EMAIL_FROM,
        to: message.to,
        subject: 'Verify your CanvasFlow account',
        html: this.render(message.verificationUrl, minutes),
      });
      return true;
    } catch (error) {
      // Deliberately without the URL. That string carries the raw token, and a
      // log file is exactly the kind of place a token should never come to rest.
      this.logger.error(`Verification email to ${message.to} was not accepted`, error);
      return false;
    }
  }

  /**
   * The expiry is rendered from the caller's own `expiresAt` rather than from a
   * number written here, so the mail cannot promise a window the token does not
   * actually have.
   */
  private render(verificationUrl: string, minutes: number): string {
    return `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 40px auto; padding: 24px;">
        <h1 style="font-size: 24px; margin-bottom: 16px; color: #0F172A;">Welcome to CanvasFlow</h1>
        <p style="color: #475569; line-height: 1.6;">
          Confirm your email address to finish setting up your account.
          This link expires in ${minutes} minutes.
        </p>
        <p style="margin-top: 24px;">
          <a href="${verificationUrl}"
             style="display: inline-block; background: #6366F1; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-weight: 500;">
            Verify email
          </a>
        </p>
        <p style="color: #94A3B8; font-size: 13px; margin-top: 32px;">
          If you didn't sign up for CanvasFlow, you can safely ignore this email.
        </p>
      </div>
    `;
  }
}
