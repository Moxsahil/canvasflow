import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { accounts, users } from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';
import { OAuthService, OAuthSignInError, type OAuthIdentity } from './oauth.service.js';
import {
  Client,
  WEB_URL,
  freshEmail,
  signUpAndIn,
  startGateway,
  type Gateway,
} from '../../../testing/gateway.js';

/**
 * Signing in with Google or GitHub.
 *
 * The provider's half needs the network, so the round trip is tested in two
 * pieces: the routes up to the hand-off (where the browser goes, what it
 * carries), and what the app does with the identity a provider vouches for,
 * which is where an account can be created, linked or taken over.
 */

let gateway: Gateway;
let oauth: OAuthService;

beforeAll(async () => {
  gateway = await startGateway({
    GOOGLE_CLIENT_ID: 'test-google-client',
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
    GITHUB_CLIENT_ID: 'test-github-client',
    GITHUB_CLIENT_SECRET: 'test-github-secret',
  });
  oauth = gateway.get(OAuthService);
});

afterAll(async () => {
  await gateway.close();
});

const context = { ip: '198.51.100.7', userAgent: 'vitest', location: null };

function identity(overrides: Partial<OAuthIdentity> = {}): OAuthIdentity {
  return {
    provider: 'google',
    providerAccountId: randomUUID(),
    email: freshEmail('oauth'),
    emailVerified: true,
    name: 'Provider Person',
    image: null,
    scope: 'openid email profile',
    ...overrides,
  };
}

async function userRow(email: string) {
  const [row] = await gateway.db.select().from(users).where(eq(users.email, email));
  return row!;
}

describe('starting a provider sign-in', () => {
  it('sends the browser to the provider with a state it must bring back', async () => {
    const client = new Client(gateway);
    const reply = await client.get(`/auth/oauth/google?next=/boards&terms=${TERMS_VERSION}`);
    expect(reply.status).toBe(302);
    const location = new URL(reply.headers.get('location')!);
    expect(location.hostname).toBe('accounts.google.com');
    expect(location.searchParams.get('client_id')).toBe('test-google-client');
    expect(location.searchParams.get('state')).toEqual(expect.any(String));
    // The destination and the terms stay here, in cookies, not in the URL.
    expect(client.cookies.get('cf.oauth.next')).toBe(encodeURIComponent('/boards'));
    expect(client.cookies.get('cf.oauth.terms')).toBeDefined();
    expect(location.toString()).not.toContain('boards');
  });

  it('never remembers a destination off the site', async () => {
    const client = new Client(gateway);
    await client.get('/auth/oauth/github?next=https://evil.example/');
    expect(client.cookies.has('cf.oauth.next')).toBe(false);
  });

  it('turns a callback whose state does not match into a sign-in error page', async () => {
    const client = new Client(gateway);
    await client.get('/auth/oauth/google');
    const reply = await client.get('/auth/oauth/google/callback?code=x&state=forged');
    expect(reply.status).toBe(302);
    const location = new URL(reply.headers.get('location')!);
    expect(location.origin).toBe(WEB_URL);
    expect(location.searchParams.get('error')).toEqual(expect.any(String));
    expect(client.cookies.has('cf.access')).toBe(false);
  });
});

describe('an identity a provider vouches for', () => {
  it('makes a new account the first time, and finds it again after', async () => {
    const who = identity();
    const first = await oauth.signIn(who, context, TERMS_VERSION);
    const again = await oauth.signIn({ ...who, email: freshEmail('changed') }, context);
    expect(again.account.id).toBe(first.account.id);

    const row = await userRow(who.email!);
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(row.passwordHash).toBeNull();
  });

  it('is refused without an address, or with one the provider has not confirmed', async () => {
    await expect(oauth.signIn(identity({ email: null }), context)).rejects.toMatchObject({
      code: 'no_email',
    });

    const existing = await signUpAndIn(gateway, 'unconfirmed-provider');
    const claim = oauth.signIn(identity({ email: existing.email, emailVerified: false }), context);
    await expect(claim).rejects.toBeInstanceOf(OAuthSignInError);
    await expect(claim).rejects.toMatchObject({ code: 'email_unverified' });
  });

  it('joins a confirmed account with the same address, keeping its password and sessions', async () => {
    const existing = await signUpAndIn(gateway, 'link');
    await gateway.db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, existing.id));

    const result = await oauth.signIn(identity({ email: existing.email.toUpperCase() }), context);
    expect(result.account.id).toBe(existing.id);

    expect((await userRow(existing.email)).passwordHash).not.toBeNull();
    const linked = await gateway.db.select().from(accounts).where(eq(accounts.userId, existing.id));
    expect(linked.map((row) => row.provider)).toEqual(['google']);
    expect((await existing.client.get('/users/me')).status).toBe(200);
  });

  it('takes an unconfirmed account back from whoever made it: password gone, sessions ended', async () => {
    // Someone signed up with an address that is not theirs and never
    // confirmed it. The address's real owner arrives through the provider.
    const squatter = await signUpAndIn(gateway, 'squatter');

    const result = await oauth.signIn(identity({ email: squatter.email }), context);
    expect(result.account.id).toBe(squatter.id);

    const row = await userRow(squatter.email);
    expect(row.passwordHash).toBeNull();
    expect(row.emailVerifiedAt).not.toBeNull();
    expect((await squatter.client.get('/users/me')).status).toBe(401);
    expect((await squatter.client.post('/auth/refresh')).status).toBe(401);
  });

  it('never signs in to a disabled account', async () => {
    const who = identity();
    await oauth.signIn(who, context);
    await gateway.db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.email, who.email!));
    await expect(oauth.signIn(who, context)).rejects.toMatchObject({ code: 'account_disabled' });
  });
});
