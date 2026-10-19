import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FetchRefusedError,
  PREVIEW_USER_AGENT,
  safeFetch,
  type SafeFetchOptions,
} from './safe-fetch.js';

let server: Server;
let port = 0;
let lastHeaders: Record<string, unknown> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    lastHeaders = req.headers;
    switch (req.url) {
      case '/page':
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<title>Hello</title>');
        return;
      case '/gzip':
        res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
        res.end(gzipSync('<title>Packed</title>'));
        return;
      case '/big':
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('x'.repeat(5000));
        return;
      case '/hop':
        res.writeHead(302, { location: '/page' });
        res.end();
        return;
      case '/inward':
        res.writeHead(302, { location: 'http://internal.test/admin' });
        res.end();
        return;
      case '/loop':
        res.writeHead(302, { location: '/loop' });
        res.end();
        return;
      case '/json':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
        return;
      case '/missing':
        res.writeHead(404, { 'content-type': 'text/html' });
        res.end('gone');
        return;
      case '/slow':
        // Never answers.
        return;
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

/** `site.test` is the test server; `internal.test` stands for a private address. */
const options = (overrides: Partial<SafeFetchOptions> = {}): SafeFetchOptions => ({
  accept: ['text/html'],
  maxBytes: 1000,
  timeoutMs: 2000,
  resolve: async (hostname) =>
    hostname === 'internal.test'
      ? [{ address: '10.0.0.5', family: 4 }]
      : [{ address: '127.0.0.1', family: 4 }],
  allowAddress: (address) => address === '127.0.0.1',
  checkRedirect: (location) => new URL(location),
  ...overrides,
});
const at = (path: string) => new URL(`http://site.test:${port}${path}`);

describe('safeFetch', () => {
  it('reads a page, as itself and with nothing of ours attached', async () => {
    const response = await safeFetch(at('/page'), options());
    expect(response.body.toString()).toBe('<title>Hello</title>');
    expect(response.contentType).toBe('text/html');
    expect(lastHeaders['user-agent']).toBe(PREVIEW_USER_AGENT);
    expect(lastHeaders.cookie).toBeUndefined();
    expect(lastHeaders.authorization).toBeUndefined();
  });

  it('unpacks a compressed answer', async () => {
    expect((await safeFetch(at('/gzip'), options())).body.toString()).toBe('<title>Packed</title>');
  });

  it('refuses a name that resolves to a private address, by default', async () => {
    await expect(
      safeFetch(at('/page'), options({ allowAddress: undefined })),
    ).rejects.toBeInstanceOf(FetchRefusedError);
  });

  it('follows a redirect, and checks where it leads like a fresh link', async () => {
    expect((await safeFetch(at('/hop'), options())).url.pathname).toBe('/page');
    await expect(safeFetch(at('/inward'), options())).rejects.toThrow('not a public address');
    await expect(safeFetch(at('/hop'), options({ checkRedirect: () => null }))).rejects.toThrow(
      'cannot be read',
    );
    await expect(safeFetch(at('/loop'), options())).rejects.toThrow('Too many redirects');
  });

  it('keeps the top of a long page, or refuses it, as asked', async () => {
    expect((await safeFetch(at('/big'), options({ truncate: true }))).body).toHaveLength(1000);
    await expect(safeFetch(at('/big'), options())).rejects.toThrow('Too large');
  });

  it('refuses the wrong kind of answer, an error, and one that never comes', async () => {
    await expect(safeFetch(at('/json'), options())).rejects.toThrow('Not a type');
    await expect(safeFetch(at('/missing'), options())).rejects.toThrow('Answered 404');
    await expect(safeFetch(at('/slow'), options({ timeoutMs: 200 }))).rejects.toThrow(
      'Took too long',
    );
  });
});
