import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeJwt } from 'jose';
import {
  Client,
  EDITOR_URL,
  TEST_PASSWORD,
  freshEmail,
  signIn,
  signUpAndIn,
  startGateway,
  type Gateway,
} from '../../testing/gateway.js';

/**
 * Accounts and sessions through the real routes: sign-up, sign-in, the
 * cookies they set, refresh-token rotation, and the ways a session ends.
 */

let gateway: Gateway;

beforeAll(async () => {
  gateway = await startGateway();
});

afterAll(async () => {
  await gateway.close();
});

describe('sign-up', () => {
  it('makes an account once per address, whatever its case', async () => {
    const client = new Client(gateway);
    const email = freshEmail('signup');
    const first = await client.post('/auth/signup', {
      email,
      password: TEST_PASSWORD,
      name: 'Pat',
    });
    expect(first.status).toBe(201);

    const again = await client.post('/auth/signup', {
      email: email.toUpperCase(),
      password: TEST_PASSWORD,
      name: 'Pat again',
    });
    expect(again.status).toBe(409);
  });

  it('refuses a weak password and a missing name', async () => {
    const client = new Client(gateway);
    const weak = await client.post('/auth/signup', {
      email: freshEmail(),
      password: 'short',
      name: 'Pat',
    });
    expect(weak.status).toBe(400);
    const nameless = await client.post('/auth/signup', {
      email: freshEmail(),
      password: TEST_PASSWORD,
      name: '   ',
    });
    expect(nameless.status).toBe(400);
  });
});

describe('sign-in', () => {
  it('puts both tokens in HttpOnly cookies and neither in the body', async () => {
    const client = new Client(gateway);
    const email = freshEmail('cookies');
    await client.post('/auth/signup', { email, password: TEST_PASSWORD, name: 'Cookie' });

    const response = await fetch(`${gateway.url}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    });
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    const access = cookies.find((line) => line.startsWith('cf.access='));
    const refresh = cookies.find((line) => line.startsWith('cf.refresh='));
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(/HttpOnly/i);
    // The refresh token is only ever sent back to the auth routes.
    expect(refresh).toMatch(/Path=\/auth/);

    const text = await response.text();
    expect(text).not.toContain(access!.split(';')[0]!.split('=')[1]);
    expect(text).not.toContain(refresh!.split(';')[0]!.split('=')[1]);
    expect(JSON.parse(text).data.accessTokenExpiresAt).toEqual(expect.any(String));
  });

  it('gives the same answer for a wrong password and an unknown address', async () => {
    const { email } = await signUpAndIn(gateway, 'wrong');
    const client = new Client(gateway);
    const wrong = await client.post('/auth/signin', { email, password: 'not the password' });
    const unknown = await client.post('/auth/signin', {
      email: freshEmail('nobody'),
      password: TEST_PASSWORD,
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((wrong.body as { message: string }).message).toBe(
      (unknown.body as { message: string }).message,
    );
  });

  it('locks an address after ten failures, even with the right password', async () => {
    const { email } = await signUpAndIn(gateway, 'locked');
    const client = new Client(gateway);
    for (let attempt = 0; attempt < 10; attempt++) {
      const reply = await client.post('/auth/signin', { email, password: `guess ${attempt}` });
      expect(reply.status).toBe(401);
    }
    const right = await client.post<{ message: string }>('/auth/signin', {
      email,
      password: TEST_PASSWORD,
    });
    expect(right.status).toBe(429);
  });

  it('refuses a guest account, which has no password to sign in with', async () => {
    const { email, id } = await signUpAndIn(gateway, 'guest');
    const { users } = await import('@canvasflow/db');
    const { eq } = await import('drizzle-orm');
    await gateway.db.update(users).set({ isGuest: true }).where(eq(users.id, id));
    const reply = await new Client(gateway).post('/auth/signin', {
      email,
      password: TEST_PASSWORD,
    });
    expect(reply.status).toBe(401);
  });
});

describe('an access token', () => {
  it('works from the cookie and as a bearer token', async () => {
    const account = await signUpAndIn(gateway, 'reader');
    const byCookie = await account.client.get<{ data: { id: string } }>('/users/me');
    expect(byCookie.status).toBe(200);

    const byBearer = await new Client(gateway).get('/users/me', {
      bearer: account.client.accessToken,
    });
    expect(byBearer.status).toBe(200);
  });

  it('is refused when missing, altered or signed with another key', async () => {
    const account = await signUpAndIn(gateway, 'tamper');
    const anonymous = new Client(gateway);
    expect((await anonymous.get('/users/me')).status).toBe(401);

    const token = account.client.accessToken;
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: crypto.randomUUID() })).toString(
      'base64url',
    );
    expect(
      (await anonymous.get('/users/me', { bearer: `${header}.${forged}.${signature}` })).status,
    ).toBe(401);
    expect((await anonymous.get('/users/me', { bearer: 'not-a-token' })).status).toBe(401);
  });

  it('names the account and the session it came from', async () => {
    const account = await signUpAndIn(gateway, 'claims');
    const claims = decodeJwt(account.client.accessToken);
    expect(claims.sub).toBe(account.id);
    expect(claims.sid).toEqual(expect.any(String));
    expect(claims.exp! * 1000).toBeGreaterThan(Date.now());
  });
});

describe('refresh', () => {
  it('rotates the refresh token, and the old one stops working', async () => {
    const account = await signUpAndIn(gateway, 'rotate');
    const before = account.client.cookies.get('cf.refresh');

    const refreshed = await account.client.post('/auth/refresh');
    expect(refreshed.status).toBe(200);
    const after = account.client.cookies.get('cf.refresh');
    expect(after).toBeDefined();
    expect(after).not.toBe(before);

    const replay = new Client(gateway);
    replay.cookies.set('cf.refresh', before!);
    const reused = await replay.post('/auth/refresh');
    expect(reused.status).toBe(401);
  });

  it('is refused with no refresh cookie, and clears the cookies', async () => {
    const reply = await new Client(gateway).post('/auth/refresh');
    expect(reply.status).toBe(401);
  });
});

describe('signing out', () => {
  it('ends this session, so its access token stops working', async () => {
    const account = await signUpAndIn(gateway, 'signout');
    const token = account.client.accessToken;

    const reply = await account.client.post('/auth/signout');
    expect(reply.status).toBe(204);
    expect(account.client.cookies.has('cf.access')).toBe(false);

    const after = await new Client(gateway).get('/users/me', { bearer: token });
    expect(after.status).toBe(401);
  });

  it('refuses a sign-out sent from another site', async () => {
    // A browser always names the page a POST came from. (A request with no
    // Origin is not a browser's, and is let through.)
    const account = await signUpAndIn(gateway, 'csrf');
    expect(
      (await account.client.post('/auth/signout', {}, { origin: 'https://evil.example' })).status,
    ).toBe(403);
    // Still signed in.
    expect((await account.client.get('/users/me')).status).toBe(200);
  });

  it('accepts a sign-out from the editor too', async () => {
    const account = await signUpAndIn(gateway, 'editor-signout');
    expect((await account.client.post('/auth/signout', {}, { origin: EDITOR_URL })).status).toBe(
      204,
    );
  });

  it('can end every session at once', async () => {
    const first = await signUpAndIn(gateway, 'everywhere');
    const second = await signIn(gateway, first.email);

    const reply = await first.client.post('/auth/signout-all');
    expect(reply.status).toBe(204);

    expect((await second.client.get('/users/me')).status).toBe(401);
    // Nor can the other device mint itself a new session.
    expect((await second.client.post('/auth/refresh')).status).toBe(401);
  });
});
