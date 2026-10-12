import { describe, expect, it } from 'vitest';
import { isUnsubscribeToken, unsubscribeLinks, unsubscribeToken } from './unsubscribe-token.js';

const SECRET = 'a-test-secret-that-is-long-enough-to-pass';
const USER = '6f1c2a7e-1b2c-4d3e-8f90-123456789abc';

describe('unsubscribe tokens', () => {
  it('are good for the account and switch they were minted for', () => {
    const token = unsubscribeToken(SECRET, USER, 'commentMentions');
    expect(isUnsubscribeToken(SECRET, USER, 'commentMentions', token)).toBe(true);
  });

  it('are good for nothing else', () => {
    const token = unsubscribeToken(SECRET, USER, 'commentMentions');
    expect(isUnsubscribeToken(SECRET, USER, 'productUpdates', token)).toBe(false);
    expect(
      isUnsubscribeToken(SECRET, '00000000-0000-4000-8000-000000000000', 'commentMentions', token),
    ).toBe(false);
    expect(isUnsubscribeToken(`${SECRET}x`, USER, 'commentMentions', token)).toBe(false);
    for (const wrong of [undefined, '', 'x', token.slice(1), 42]) {
      expect(isUnsubscribeToken(SECRET, USER, 'commentMentions', wrong)).toBe(false);
    }
  });

  it('go to the web page for people and the gateway for mail clients', () => {
    const links = unsubscribeLinks(
      { webUrl: 'https://canvasflowapp.com', apiUrl: 'https://api.canvasflowapp.com' },
      SECRET,
      USER,
      'commentMentions',
    );
    const page = new URL(links.pageUrl);
    expect(page.origin + page.pathname).toBe('https://canvasflowapp.com/unsubscribe');
    expect(page.searchParams.get('u')).toBe(USER);
    expect(page.searchParams.get('k')).toBe('commentMentions');
    expect(page.searchParams.get('t')).toBe(unsubscribeToken(SECRET, USER, 'commentMentions'));
    expect(links.oneClickUrl).toBe(
      `https://api.canvasflowapp.com/notifications/unsubscribe${page.search}`,
    );
  });
});
