import type { RequestOrigin } from '../../common/request-origin.js';
import type { OAuthProvider } from '../auth/oauth/oauth.service.js';

export type { RequestOrigin };

/**
 * Every mail this service sends, as subject, HTML and plain text.
 *
 * Kept apart from the sending so the wording can be read and tested without a
 * provider, and so each message is built from what its caller actually knows —
 * an expiry is rendered from the token's own `expiresAt`, never from a number
 * written here, so a mail cannot promise a window the link does not have.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const PROVIDER_NAMES: Record<OAuthProvider, string> = {
  google: 'Google',
  github: 'GitHub',
};

/**
 * Everything interpolated into markup goes through this. The device label is
 * built from a User-Agent header and an account name is whatever somebody
 * typed, so neither is trusted to be free of `<`.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function minutesUntil(expiresAt: Date, now = Date.now()): number {
  return Math.max(1, Math.round((expiresAt.getTime() - now) / 60_000));
}

const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** "23 September 2026 at 14:05 UTC, Chrome on Windows, New Delhi, India" — whatever is known. */
export function describeOrigin(origin: RequestOrigin): string {
  return [`${TIME_FORMAT.format(origin.at)} UTC`, origin.device, origin.location]
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

function layout(heading: string, body: string): string {
  return `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 40px auto; padding: 24px;">
        <h1 style="font-size: 24px; margin-bottom: 16px; color: #0F172A;">${heading}</h1>
        ${body}
      </div>
    `;
}

function paragraph(text: string): string {
  return `<p style="color: #475569; line-height: 1.6;">${text}</p>`;
}

function button(href: string, label: string): string {
  return `
        <p style="margin-top: 24px;">
          <a href="${escapeHtml(href)}"
             style="display: inline-block; background: #6366F1; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-weight: 500;">
            ${label}
          </a>
        </p>`;
}

function footnote(text: string): string {
  return `<p style="color: #94A3B8; font-size: 13px; margin-top: 32px;">${text}</p>`;
}

export function verificationEmail(verificationUrl: string, expiresAt: Date): RenderedEmail {
  const minutes = minutesUntil(expiresAt);
  return {
    subject: 'Verify your CanvasFlow account',
    html: layout(
      'Welcome to CanvasFlow',
      paragraph(
        `Confirm your email address to finish setting up your account. This link expires in ${minutes} minutes.`,
      ) +
        button(verificationUrl, 'Verify email') +
        footnote("If you didn't sign up for CanvasFlow, you can safely ignore this email."),
    ),
    text: [
      'Welcome to CanvasFlow',
      '',
      `Confirm your email address to finish setting up your account. This link expires in ${minutes} minutes:`,
      verificationUrl,
      '',
      "If you didn't sign up for CanvasFlow, you can safely ignore this email.",
    ].join('\n'),
  };
}

export interface PasswordResetContent {
  resetUrl: string;
  expiresAt: Date;
  /** Named so an address shared by two accounts says which one each link is for. */
  accountName: string;
  /** Mentioned when the account can also sign in through a provider. */
  providers: OAuthProvider[];
  requestedFrom: RequestOrigin;
}

export function passwordResetEmail(content: PasswordResetContent): RenderedEmail {
  const minutes = minutesUntil(content.expiresAt);
  const origin = describeOrigin(content.requestedFrom);
  const providers = content.providers.map((p) => PROVIDER_NAMES[p]).join(' or ');
  const providerNote = providers
    ? `You can also keep signing in with ${providers}; that doesn't change.`
    : null;

  return {
    subject: 'Reset your CanvasFlow password',
    html: layout(
      'Reset your password',
      paragraph(
        `Someone asked to reset the password for your CanvasFlow account, <strong>${escapeHtml(
          content.accountName,
        )}</strong>. Choose a new one with the button below. This link expires in ${minutes} minutes and works once.`,
      ) +
        button(content.resetUrl, 'Choose a new password') +
        (providerNote ? paragraph(escapeHtml(providerNote)) : '') +
        paragraph(`Requested ${escapeHtml(origin)}.`) +
        footnote(
          "If you didn't ask for this, you can ignore this email. Your password won't change unless the link is used.",
        ),
    ),
    text: [
      'Reset your password',
      '',
      `Someone asked to reset the password for your CanvasFlow account, ${content.accountName}.`,
      `Choose a new one here. This link expires in ${minutes} minutes and works once:`,
      content.resetUrl,
      '',
      ...(providerNote ? [providerNote, ''] : []),
      `Requested ${origin}.`,
      '',
      "If you didn't ask for this, you can ignore this email. Your password won't change unless the link is used.",
    ].join('\n'),
  };
}

export interface ProviderNoticeContent {
  providers: OAuthProvider[];
  signInUrl: string;
  requestedFrom: RequestOrigin;
}

/**
 * For an account that has no password to reset.
 *
 * Tells them how they actually get in, and carries no link that could change
 * anything — adding a password is something done while signed in.
 */
export function providerNoticeEmail(content: ProviderNoticeContent): RenderedEmail {
  const providers = content.providers.map((p) => PROVIDER_NAMES[p]).join(' or ') || 'a provider';
  const origin = describeOrigin(content.requestedFrom);

  return {
    subject: 'Signing in to CanvasFlow',
    html: layout(
      'Your account uses ' + escapeHtml(providers),
      paragraph(
        `Someone asked to reset the password for this address, but your CanvasFlow account doesn't have one: you sign in with ${escapeHtml(
          providers,
        )}.`,
      ) +
        button(content.signInUrl, `Sign in with ${escapeHtml(providers)}`) +
        paragraph(`Requested ${escapeHtml(origin)}.`) +
        footnote("If you didn't ask for this, you can ignore this email. Nothing has changed."),
    ),
    text: [
      `Your account uses ${providers}`,
      '',
      `Someone asked to reset the password for this address, but your CanvasFlow account doesn't have one: you sign in with ${providers}.`,
      `Sign in here: ${content.signInUrl}`,
      '',
      `Requested ${origin}.`,
      '',
      "If you didn't ask for this, you can ignore this email. Nothing has changed.",
    ].join('\n'),
  };
}

export interface PasswordChangedContent {
  accountName: string;
  changedFrom: RequestOrigin;
  /** Where to start another reset if this was not them. */
  forgotPasswordUrl: string;
  /**
   * What happened to the devices that were signed in: all of them ended (a
   * reset), every one but the device the change was made on, or none — the
   * person chose to stay signed in elsewhere.
   */
  signedOut: 'everywhere' | 'other-devices' | 'nowhere';
}

const SIGNED_OUT: Record<PasswordChangedContent['signedOut'], string> = {
  everywhere: "You've been signed out everywhere.",
  'other-devices': 'Every other device has been signed out.',
  nowhere: 'Devices that were already signed in stay signed in.',
};

/**
 * Sent every time the password changes, to the address on the account.
 *
 * The one mail that reaches the owner when somebody else has taken the
 * account over, so it says plainly what happened and what to do about it.
 */
export function passwordChangedEmail(content: PasswordChangedContent): RenderedEmail {
  const origin = describeOrigin(content.changedFrom);
  const signedOut = SIGNED_OUT[content.signedOut];

  return {
    subject: 'Your CanvasFlow password was changed',
    html: layout(
      'Your password was changed',
      paragraph(
        `The password for your CanvasFlow account, <strong>${escapeHtml(
          content.accountName,
        )}</strong>, was changed ${escapeHtml(origin)}. ${signedOut}`,
      ) +
        paragraph("Wasn't you? Reset your password now to take your account back.") +
        button(content.forgotPasswordUrl, 'Reset your password') +
        footnote('If this was you, there is nothing else to do.'),
    ),
    text: [
      'Your password was changed',
      '',
      `The password for your CanvasFlow account, ${content.accountName}, was changed ${origin}. ${signedOut}`,
      '',
      "Wasn't you? Reset your password now to take your account back:",
      content.forgotPasswordUrl,
      '',
      'If this was you, there is nothing else to do.',
    ].join('\n'),
  };
}

export interface PasswordSetupContent {
  setupUrl: string;
  expiresAt: Date;
  accountName: string;
  /** How they sign in today, named so the mail says what stays the same. */
  providers: OAuthProvider[];
  requestedFrom: RequestOrigin;
}

/**
 * For an account that signs in only with Google or GitHub and has asked, from
 * Settings, to add a password.
 *
 * A link rather than a form in Settings on purpose: adding a password gives an
 * account a new way in, and that should take proof of the inbox, not just a
 * signed-in browser that somebody else might be sitting at.
 */
export function passwordSetupEmail(content: PasswordSetupContent): RenderedEmail {
  const minutes = minutesUntil(content.expiresAt);
  const origin = describeOrigin(content.requestedFrom);
  const providers = content.providers.map((p) => PROVIDER_NAMES[p]).join(' or ') || 'your provider';

  return {
    subject: 'Set a password for your CanvasFlow account',
    html: layout(
      'Set a password',
      paragraph(
        `You asked to add a password to your CanvasFlow account, <strong>${escapeHtml(
          content.accountName,
        )}</strong>. Once it is set you can sign in with your email and password as well as with ${escapeHtml(
          providers,
        )}. This link expires in ${minutes} minutes and works once.`,
      ) +
        button(content.setupUrl, 'Set a password') +
        paragraph(`Requested ${escapeHtml(origin)}.`) +
        footnote(
          "If you didn't ask for this, you can ignore this email. Nothing changes unless the link is used.",
        ),
    ),
    text: [
      'Set a password',
      '',
      `You asked to add a password to your CanvasFlow account, ${content.accountName}.`,
      `Once it is set you can sign in with your email and password as well as with ${providers}.`,
      `This link expires in ${minutes} minutes and works once:`,
      content.setupUrl,
      '',
      `Requested ${origin}.`,
      '',
      "If you didn't ask for this, you can ignore this email. Nothing changes unless the link is used.",
    ].join('\n'),
  };
}
