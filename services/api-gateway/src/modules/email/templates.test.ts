import { describe, expect, it } from 'vitest';
import {
  accountClaimedEmail,
  accountDeletionEmail,
  boardAccessEmail,
  boardJoinedEmail,
  guestAccessEmail,
  workspaceJoinedEmail,
  workspaceRoleEmail,
  commentMentionEmail,
  quoteOf,
  escapeHtml,
  minutesUntil,
  passwordChangedEmail,
  passwordResetEmail,
  passwordSetupEmail,
  providerNoticeEmail,
  ownershipOfferEmail,
  workspaceInviteEmail,
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

describe('accountClaimedEmail', () => {
  const base = {
    accountName: 'Mallory <b>',
    provider: 'google' as const,
    appUrl: 'https://canvasflowapp.com/open',
    claimedFrom: origin,
  };

  it('lists what was removed, and says how to add a password back', () => {
    const email = accountClaimedEmail({ ...base, passwordRemoved: true, providersRemoved: [] });
    expect(email.text).toContain('- removed the password that had been set on it');
    expect(email.text).toContain('- signed out every other device');
    expect(email.text).toContain('add a password again in Settings');
    expect(email.html).toContain('https://canvasflowapp.com/open');
  });

  it('names a provider link it removed, and does not mention a password there was not', () => {
    const email = accountClaimedEmail({
      ...base,
      passwordRemoved: false,
      providersRemoved: ['github'],
    });
    expect(email.text).toContain('- disconnected a GitHub account that had never confirmed');
    expect(email.text).not.toContain('password');
  });

  it('escapes every value that came from somebody else', () => {
    const email = accountClaimedEmail({ ...base, passwordRemoved: true, providersRemoved: [] });
    expect(email.html).toContain('Mallory &lt;b&gt;');
    expect(email.html).not.toContain('<img');
  });
});

describe('accountDeletionEmail', () => {
  const base = {
    accountName: 'Mallory <b>',
    purgeAfter: new Date('2026-10-01T14:05:00Z'),
    ownedBoards: 3,
    supportEmail: 'support@canvasflowapp.com',
    requestedFrom: origin,
  };

  it('says when it becomes final and how to stop it, in both parts', () => {
    const email = accountDeletionEmail(base);
    for (const part of [email.text, email.html]) {
      expect(part).toContain('1 October 2026 at 14:05 UTC');
      expect(part).toContain('support@canvasflowapp.com');
    }
    expect(email.html).toContain('mailto:support@canvasflowapp.com');
    expect(email.text).toContain("You've been signed out everywhere.");
  });

  it('counts the boards that were hidden, and says nothing of boards there were not', () => {
    expect(accountDeletionEmail(base).text).toContain('The 3 boards you own');
    expect(accountDeletionEmail({ ...base, ownedBoards: 1 }).text).toContain('The board you own');
    expect(accountDeletionEmail({ ...base, ownedBoards: 0 }).text).not.toContain('board');
  });

  it('escapes every value that came from somebody else', () => {
    const email = accountDeletionEmail(base);
    expect(email.html).toContain('Mallory &lt;b&gt;');
    expect(email.html).not.toContain('<img');
  });
});

describe('workspaceInviteEmail', () => {
  const email = workspaceInviteEmail({
    joinUrl: 'https://canvasflowapp.com/join/abc',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    inviterName: 'Mallory <script>',
    workspaceName: 'Acme\r\nBcc: everyone <b>',
    role: 'admin',
  });

  it('carries the link in both parts', () => {
    expect(email.html).toContain('https://canvasflowapp.com/join/abc');
    expect(email.text).toContain('https://canvasflowapp.com/join/abc');
  });

  it('escapes the names other people typed', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>');
    expect(email.html).toContain('Mallory &lt;script&gt;');
  });

  it('keeps the subject on one line', () => {
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject).toContain('Mallory <script> invited you to Acme');
  });

  it('says how long it works, and the role when it is not plain member', () => {
    expect(email.text).toContain('7 days');
    expect(email.text).toContain('as an admin');
  });
});

describe('ownershipOfferEmail', () => {
  const email = ownershipOfferEmail({
    openUrl: 'https://canvasflowapp.com/open',
    ownerName: 'Olu <b>',
    workspaceName: 'Acme\nCo',
  });

  it('says what is asked, escaped, and where to answer', () => {
    expect(email.html).toContain('Olu &lt;b&gt;');
    expect(email.html).toContain('https://canvasflowapp.com/open');
    expect(email.text).toContain('Settings → Workspace');
    expect(email.subject).not.toMatch(/\n/);
  });
});

describe('commentMentionEmail', () => {
  const email = commentMentionEmail({
    authorName: 'Ada <script>',
    boardTitle: 'Road\nmap',
    body: 'Can you check this, @Grace?\n\n\n\nThanks <b>',
    openUrl: 'https://app.canvasflowapp.com/boards/b1?comment=thread-1',
    unsubscribeUrl: 'https://canvasflowapp.com/unsubscribe?u=1&k=commentMentions&t=x',
  });

  it('says who, where and what, escaped', () => {
    expect(email.subject).toBe('Ada <script> mentioned you on Road map');
    expect(email.html).toContain('Ada &lt;script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('Thanks &lt;b&gt;');
    expect(email.text).toContain('> Can you check this, @Grace?');
  });

  it('links to the thread, and to turning these emails off', () => {
    expect(email.html).toContain('https://app.canvasflowapp.com/boards/b1?comment=thread-1');
    expect(email.html).toContain('k=commentMentions&amp;t=x');
    expect(email.text).toContain('Turn them off: https://canvasflowapp.com/unsubscribe?');
  });
});

describe('quoteOf', () => {
  it('keeps a short comment whole, with its lines, and closes up blank runs', () => {
    expect(quoteOf('one  two\n\n\n\nthree ')).toBe('one two\n\nthree');
  });

  it('cuts a long one on a word', () => {
    const quote = quoteOf('word '.repeat(200), 50);
    expect(quote.endsWith('word…')).toBe(true);
    expect(quote.length).toBeLessThanOrEqual(51);
  });
});

describe('the join and access emails', () => {
  const unsubscribeUrl = 'https://canvasflowapp.com/unsubscribe?u=1&k=inviteAccepted&t=x';

  it('says who came in through a link, escaped, and as a guest when they have no account', () => {
    const email = boardJoinedEmail({
      joinerName: 'Gus <b>',
      joinerIsGuest: true,
      boardTitle: 'Road\nmap',
      role: 'viewer',
      openUrl: 'https://app.canvasflowapp.com/boards/b1',
      unsubscribeUrl,
    });
    expect(email.subject).toBe('Gus <b> joined Road map');
    expect(email.html).toContain('Gus &lt;b&gt;');
    expect(email.text).toContain('as a guest, without an account, through a link you shared');
    expect(email.text).toContain('They can view it, but not change it.');
    expect(email.text).toContain('emails about accepted invitations are on');
    expect(email.html).toContain('k=inviteAccepted&amp;t=x');
  });

  it('says an invitation was accepted, and as what', () => {
    const email = workspaceJoinedEmail({
      joinerName: 'Nia',
      workspaceName: 'Acme',
      role: 'admin',
      openUrl: 'https://canvasflowapp.com/open',
      unsubscribeUrl,
    });
    expect(email.subject).toBe('Nia joined Acme');
    expect(email.text).toContain('Nia accepted your invitation and joined Acme as an admin.');
  });

  it('tells a role change from being let back on', () => {
    const base = {
      actorName: 'Olu',
      boardTitle: 'Plan',
      openUrl: 'https://app.canvasflowapp.com/boards/b1',
      unsubscribeUrl,
    };
    const role = boardAccessEmail({ ...base, role: 'editor', change: 'role' });
    expect(role.subject).toBe('You can now edit Plan');
    expect(role.text).toContain('Olu changed your access to Plan. You can now edit it.');
    const back = boardAccessEmail({ ...base, role: 'viewer', change: 'restored' });
    expect(back.subject).toBe("You're back on Plan");
    expect(back.text).toContain(
      'Olu gave you access to Plan again. You can view it, but not change it.',
    );
    expect(back.text).toContain('changes to your board access');
  });

  it('says what a workspace role means', () => {
    const base = { actorName: 'Olu', workspaceName: 'Acme', openUrl: 'x', unsubscribeUrl };
    expect(workspaceRoleEmail({ ...base, role: 'admin' }).subject).toBe(
      "You're now an admin of Acme",
    );
    expect(workspaceRoleEmail({ ...base, role: 'member' }).text).toContain(
      'Olu changed your role in Acme to member.',
    );
  });

  it('counts a guest’s boards', () => {
    const base = { actorName: 'Olu', workspaceName: 'Acme', openUrl: 'x', unsubscribeUrl };
    expect(guestAccessEmail({ ...base, role: 'viewer', boards: 1 }).text).toContain(
      "changed your access to the board you're on in Acme. You can now view it, but not change it.",
    );
    expect(guestAccessEmail({ ...base, role: 'editor', boards: 3 }).text).toContain(
      "the 3 boards you're on in Acme. You can now edit them.",
    );
  });
});
