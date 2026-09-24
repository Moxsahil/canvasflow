import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { parseEnv } from '../../config/env.js';
import {
  passwordChangedEmail,
  passwordResetEmail,
  passwordSetupEmail,
  providerNoticeEmail,
  verificationEmail,
  type PasswordChangedContent,
  type PasswordResetContent,
  type PasswordSetupContent,
  type ProviderNoticeContent,
  type RenderedEmail,
} from './templates.js';

export interface VerificationMessage {
  to: string;
  verificationUrl: string;
  expiresAt: Date;
}

/**
 * Who a message is for. The id is what gets logged when delivery fails, so a
 * failure can be traced to an account without writing the address into logs.
 */
interface Recipient {
  to: string;
  userId: string;
}

/**
 * The only place in the service that speaks to the mail provider.
 *
 * A boundary rather than a call inlined where it is needed, because the thing
 * most likely to change here is how a message is dispatched. Putting a queue
 * and a worker behind this later is then a change to one class rather than to
 * the shape of account creation or password recovery.
 *
 * Shared by email verification and password recovery, which is why it lives in
 * its own module rather than inside either.
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
    return this.deliver(
      message.to,
      verificationEmail(message.verificationUrl, message.expiresAt),
      // Kept as it was: the verification flow logged the address before this
      // service was shared, and changing that is not this module's business.
      `Verification email to ${message.to}`,
    );
  }

  /** A reset link. Carries a live credential, so it is never logged. */
  async sendPasswordReset(recipient: Recipient, content: PasswordResetContent): Promise<boolean> {
    return this.deliver(
      recipient.to,
      passwordResetEmail(content),
      `Password reset email for user ${recipient.userId}`,
    );
  }

  /** A link to add a password, for an account that signs in only with a provider. */
  async sendPasswordSetup(recipient: Recipient, content: PasswordSetupContent): Promise<boolean> {
    return this.deliver(
      recipient.to,
      passwordSetupEmail(content),
      `Password setup email for user ${recipient.userId}`,
    );
  }

  /** For an account with no password: how they actually sign in. */
  async sendProviderNotice(recipient: Recipient, content: ProviderNoticeContent): Promise<boolean> {
    return this.deliver(
      recipient.to,
      providerNoticeEmail(content),
      `Provider sign-in notice for user ${recipient.userId}`,
    );
  }

  /** Every time a password changes, to the address on the account. */
  async sendPasswordChanged(
    recipient: Recipient,
    content: PasswordChangedContent,
  ): Promise<boolean> {
    return this.deliver(
      recipient.to,
      passwordChangedEmail(content),
      `Password changed email for user ${recipient.userId}`,
    );
  }

  /**
   * Hand one message to the provider, reporting whether it was accepted.
   *
   * Never throws, for every message and not only verification: each of these
   * is sent beside something that has already happened, and a mail outage
   * must not turn into that thing failing.
   *
   * `description` is what a failure is logged as. It never includes the
   * message body, because the body of a reset mail is a working credential and
   * a log file is exactly the kind of place a token should never come to rest.
   */
  private async deliver(to: string, email: RenderedEmail, description: string): Promise<boolean> {
    if (!this.client) {
      this.logger.warn(`RESEND_API_KEY is unset, so this was not sent: ${description}`);
      return false;
    }

    try {
      const { error } = await this.client.emails.send({
        from: this.env.EMAIL_FROM,
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      // The SDK reports a refusal in the result rather than by throwing, so a
      // rejected message has to be looked for here or it reads as sent.
      if (error) {
        this.logger.error(`${description} was not accepted: ${error.name}: ${error.message}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(`${description} was not accepted`, error);
      return false;
    }
  }
}
