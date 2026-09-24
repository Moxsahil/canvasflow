import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  minutesUntil,
  passwordChangedEmail,
  passwordResetEmail,
  passwordSetupEmail,
  providerNoticeEmail,
} from './templates.js';

const origin = {
  at: new Date('2026-09-24T14:05:00Z'),
  device: '<img src=x onerror=alert(1)> on Windows',
  location: 'New Delhi, Delhi, India',
};

describe('escapeHtml', () => {
  it('neutralises markup', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('minutesUntil', () => {
  it('rounds to whole minutes and never promises less than one', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    expect(minutesUntil(new Date(now + 30 * 60_000), now)).toBe(30);
    expect(minutesUntil(new Date(now + 5_000), now)).toBe(1);
  });
});

describe('passwordResetEmail', () => {
  const email = passwordResetEmail({
    resetUrl: 'https://canvasflowapp.com/reset-password#token=abc',
    expiresAt: new Date(Date.now() + 30 * 60_000),
    accountName: 'Mallory <script>',
    providers: ['google'],
    requestedFrom: origin,
  });

  it('carries the link in both parts', () => {
    expect(email.html).toContain('https://canvasflowapp.com/reset-password#token=abc');
    expect(email.text).toContain('https://canvasflowapp.com/reset-password#token=abc');
  });

  it('escapes every value that came from somebody else', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('Mallory &lt;script&gt;');
  });

  it('says when it expires, where it was asked for, and mentions the provider', () => {
    expect(email.text).toContain('expires in 30 minutes');
    expect(email.text).toContain('24 September 2026');
    expect(email.text).toContain('India');
    expect(email.text).toContain('Google');
  });
});

describe('providerNoticeEmail', () => {
  it('names the provider and carries no reset link', () => {
    const email = providerNoticeEmail({
      providers: ['github'],
      signInUrl: 'https://canvasflowapp.com/login',
      requestedFrom: origin,
    });
    expect(email.text).toContain('GitHub');
    expect(email.html).not.toContain('reset-password');
  });
});

describe('passwordChangedEmail', () => {
  it('says what happened and where to go if it was not them', () => {
    const email = passwordChangedEmail({
      accountName: 'Ada',
      changedFrom: origin,
      forgotPasswordUrl: 'https://canvasflowapp.com/forgot-password',
      signedOut: 'everywhere',
    });
    expect(email.text).toContain('signed out everywhere');
    expect(email.html).toContain('https://canvasflowapp.com/forgot-password');
    expect(email.html).not.toContain('<img');
  });
});

describe('passwordChangedEmail, from Settings', () => {
  const base = {
    accountName: 'Ada',
    changedFrom: origin,
    forgotPasswordUrl: 'https://canvasflowapp.com/forgot-password',
  };

  it('says other devices were signed out when they were', () => {
    const email = passwordChangedEmail({ ...base, signedOut: 'other-devices' });
    expect(email.text).toContain('Every other device has been signed out.');
  });

  it('does not claim a sign-out that did not happen', () => {
    const email = passwordChangedEmail({ ...base, signedOut: 'nowhere' });
    expect(email.text).not.toContain('signed out');
    expect(email.text).toContain('stay signed in');
  });
});

describe('passwordSetupEmail', () => {
  it('carries the link, names the provider and escapes the account name', () => {
    const email = passwordSetupEmail({
      setupUrl: 'https://canvasflowapp.com/reset-password#token=abc',
      expiresAt: new Date(Date.now() + 30 * 60_000),
      accountName: 'Mallory <b>',
      providers: ['github'],
      requestedFrom: origin,
    });
    expect(email.html).toContain('reset-password#token=abc');
    expect(email.text).toContain('GitHub');
    expect(email.html).toContain('Mallory &lt;b&gt;');
    expect(email.text).toContain('expires in 30 minutes');
  });
});
