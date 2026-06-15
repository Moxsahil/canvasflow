import { resend, EMAIL_FROM } from './client';

export async function sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: 'Verify your CanvasFlow account',
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 40px auto; padding: 24px;">
        <h1 style="font-size: 24px; margin-bottom: 16px; color: #0F172A;">Welcome to CanvasFlow</h1>
        <p style="color: #475569; line-height: 1.6;">
          Click the button below to verify your email address.
          This link expires in 24 hours.
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
    `,
  });
}
