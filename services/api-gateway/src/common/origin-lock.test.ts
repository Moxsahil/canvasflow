import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { ORIGIN_AUTH_HEADER, originLock } from './origin-lock.js';

const SECRET = 'a'.repeat(48);

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

/** A real app, so `req.path` and header parsing behave as they will in production. */
async function start(secret: string | undefined): Promise<string> {
  const app = express();
  app.use(originLock(secret));
  app.get('*', (_req, res) => {
    res.json({ ok: true });
  });

  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe('originLock', () => {
  it('lets everything through when no secret is configured', async () => {
    const base = await start(undefined);
    expect((await fetch(`${base}/auth/signin`)).status).toBe(200);
  });

  it('refuses a request with no header', async () => {
    const base = await start(SECRET);
    const res = await fetch(`${base}/auth/signup`);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ statusCode: 403, message: 'Forbidden' });
  });

  it('refuses a wrong value, including one that is a prefix of the secret', async () => {
    const base = await start(SECRET);
    for (const value of ['nope', SECRET.slice(0, -1), `${SECRET}a`]) {
      const res = await fetch(`${base}/auth/signup`, { headers: { [ORIGIN_AUTH_HEADER]: value } });
      expect(res.status).toBe(403);
    }
  });

  it('admits the configured value', async () => {
    const base = await start(SECRET);
    const res = await fetch(`${base}/auth/signin`, { headers: { [ORIGIN_AUTH_HEADER]: SECRET } });
    expect(res.status).toBe(200);
  });

  it('leaves the health checks open, since the host calls them directly', async () => {
    const base = await start(SECRET);
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });

  it('does not unlock a path that only starts with a health route', async () => {
    const base = await start(SECRET);
    expect((await fetch(`${base}/healthz/../auth/signup`)).status).toBe(403);
    expect((await fetch(`${base}/healthzz`)).status).toBe(403);
  });
});
