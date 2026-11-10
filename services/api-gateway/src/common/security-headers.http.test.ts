import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EDITOR_URL, WEB_URL, startGateway, type Gateway } from '../testing/gateway.js';

/** The headers on every answer, and which sites the browser may read them from. */

let gateway: Gateway;

beforeAll(async () => {
  gateway = await startGateway();
});

afterAll(async () => {
  await gateway.close();
});

const EXPECTED = {
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
};

describe('security headers', () => {
  it('are on a successful answer, and the framework is not named', async () => {
    const response = await fetch(`${gateway.url}/healthz`);
    for (const [name, value] of Object.entries(EXPECTED)) {
      expect(response.headers.get(name), name).toBe(value);
    }
    expect(response.headers.get('x-powered-by')).toBeNull();
  });

  it('are on refusals and errors too', async () => {
    for (const path of ['/users/me', '/no-such-route']) {
      const response = await fetch(`${gateway.url}${path}`);
      expect(response.status).toBeGreaterThanOrEqual(400);
      for (const [name, value] of Object.entries(EXPECTED)) {
        expect(response.headers.get(name), `${path} ${name}`).toBe(value);
      }
    }
  });
});

describe('CORS', () => {
  const preflight = (origin: string) =>
    fetch(`${gateway.url}/boards`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

  it('lets the web app and the editor read answers, with their cookies', async () => {
    for (const origin of [WEB_URL, EDITOR_URL]) {
      const response = await preflight(origin);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      expect(response.headers.get('access-control-max-age')).toBe('600');
    }
  });

  it('lets no other site read them', async () => {
    for (const origin of ['https://evil.example', 'http://localhost:3000.evil.example', 'null']) {
      const response = await preflight(origin);
      expect(response.headers.get('access-control-allow-origin'), origin).toBeNull();
    }
  });
});
