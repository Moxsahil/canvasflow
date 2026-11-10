import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createClient, type Database } from '@canvasflow/db';
import { inject } from 'vitest';

/**
 * The real gateway, started in this process against the throwaway Postgres
 * from global-setup.ts, on a free loopback port.
 *
 * Every external service is switched off by leaving its settings unset: no
 * email provider, no object storage, no AI, no payments, no sync server. What
 * runs is the request path itself — middleware, guards, rate limits,
 * controllers, services and SQL — which is the part these tests are for.
 */

export const WEB_URL = 'http://localhost:3000';
export const EDITOR_URL = 'http://localhost:3002';
export const TEST_AUTH_SECRET = 'gateway-test-secret-that-is-long-enough-0123456789';

/** Settings that would reach a real service, removed before the app reads them. */
const EXTERNAL = [
  'RESEND_API_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'ANTHROPIC_API_KEY',
  'POLAR_ACCESS_TOKEN',
  'POLAR_WEBHOOK_SECRET',
  'SYNC_INTERNAL_URL',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'ORIGIN_AUTH_SECRET',
  'DIGEST_TRIGGER_SECRET',
  'SESSION_COOKIE_DOMAIN',
];

export interface Gateway {
  readonly url: string;
  /** The same database, for arranging rows a test needs and reading results. */
  readonly db: Database;
  /** One of the app's own services, for the paths no route can reach offline. */
  get<T>(type: abstract new (...args: never[]) => T): T;
  close(): Promise<void>;
}

export async function startGateway(extraEnv: Record<string, string> = {}): Promise<Gateway> {
  const databaseUrl = inject('databaseUrl');
  // Built from 127.0.0.1 by global-setup; refuse anything else outright.
  if (!databaseUrl.startsWith('postgresql://postgres:postgres@127.0.0.1:')) {
    throw new Error(`Refusing to test against ${databaseUrl}`);
  }
  for (const key of EXTERNAL) delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    AUTH_SECRET: TEST_AUTH_SECRET,
    WEB_URL,
    EDITOR_URL,
    API_PUBLIC_URL: 'http://localhost:3001',
    // One proxy hop believed, so each test browser can say which address it
    // calls from (X-Forwarded-For) and per-address limits apply per browser,
    // as they do behind the production edge.
    TRUST_PROXY_HOPS: '1',
    ...extraEnv,
  });

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module.js');
  const { configureApp } = await import('../app-setup.js');
  const { parseEnv } = await import('../config/env.js');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureApp(app, parseEnv());
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const db = createClient(databaseUrl);

  return {
    url: `http://127.0.0.1:${port}`,
    db,
    get: (type) => app.get(type),
    async close() {
      await app.close();
      await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
    },
  };
}

export interface Reply<T = unknown> {
  readonly status: number;
  readonly headers: Headers;
  readonly body: T;
}

interface RequestOptions {
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  /** Sent as `Authorization: Bearer …` instead of relying on the cookie. */
  readonly bearer?: string;
  /** Overrides the client's own Origin; null sends none. */
  readonly origin?: string | null;
  /** Leave the cookie jar out of this one request. */
  readonly withoutCookies?: boolean;
}

/**
 * One browser: keeps the cookies the gateway sets, the way a real one would,
 * and sends the web app's Origin unless told otherwise.
 */
export class Client {
  readonly cookies = new Map<string, string>();

  constructor(
    private readonly gateway: Gateway,
    private readonly origin: string = WEB_URL,
    /** The address this browser calls from; the socket's own when unset. */
    readonly ip?: string,
  ) {}

  async request<T = unknown>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Reply<T>> {
    const headers: Record<string, string> = { ...options.headers };
    const origin = options.origin === undefined ? this.origin : options.origin;
    if (origin !== null) headers.Origin = origin;
    if (this.ip) headers['X-Forwarded-For'] = this.ip;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.bearer) headers.Authorization = `Bearer ${options.bearer}`;
    if (!options.withoutCookies && this.cookies.size > 0) {
      headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    const response = await fetch(`${this.gateway.url}${path}`, {
      method,
      headers,
      redirect: 'manual',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    this.keep(response.headers.getSetCookie());

    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON; the text is the body.
    }
    return { status: response.status, headers: response.headers, body: body as T };
  }

  get = <T = unknown>(path: string, options?: RequestOptions) =>
    this.request<T>('GET', path, options);
  post = <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    this.request<T>('POST', path, { ...options, body: body ?? {} });
  patch = <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    this.request<T>('PATCH', path, { ...options, body: body ?? {} });
  put = <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    this.request<T>('PUT', path, { ...options, body: body ?? {} });
  delete = <T = unknown>(path: string, options?: RequestOptions) =>
    this.request<T>('DELETE', path, options);

  /** The access token from the cookie, for routes reached with a bearer token. */
  get accessToken(): string {
    const token = this.cookies.get('cf.access');
    if (!token) throw new Error('Not signed in');
    return token;
  }

  private keep(setCookies: string[]): void {
    for (const line of setCookies) {
      const [pair, ...attributes] = line.split(';').map((part) => part.trim());
      const at = pair!.indexOf('=');
      const name = pair!.slice(0, at);
      const value = pair!.slice(at + 1);
      const expired = attributes.some((attribute) => {
        const [key, raw] = attribute.split('=');
        if (key!.toLowerCase() === 'max-age') return Number(raw) <= 0;
        if (key!.toLowerCase() === 'expires') return new Date(raw!).getTime() <= Date.now();
        return false;
      });
      if (expired || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

export interface TestAccount {
  readonly id: string;
  readonly email: string;
  readonly password: string;
  readonly client: Client;
}

/** A fresh address no other test uses. */
export function freshEmail(label = 'user'): string {
  return `${label}-${randomUUID().slice(0, 8)}@example.test`;
}

export const TEST_PASSWORD = 'Correct horse battery 42!';

/**
 * A new account, signed in through the real sign-in route.
 *
 * The row is written straight to the database, password hashed the way the
 * app hashes it, because sign-up allows ten a minute from one address and a
 * file needs more people than that. Sign-up itself is tested through its route
 * in auth.http.test.ts.
 */
export async function signUpAndIn(gateway: Gateway, label = 'Test user'): Promise<TestAccount> {
  const email = await insertAccount(gateway, label);
  return signIn(gateway, email);
}

let hashed: Promise<string> | null = null;

/** An account row with the shared test password; returns its address. */
export async function insertAccount(gateway: Gateway, label = 'Test user'): Promise<string> {
  const { users } = await import('@canvasflow/db');
  const bcrypt = (await import('bcrypt')).default;
  // One hash for every test account: the same password, and bcrypt is slow.
  hashed ??= bcrypt.hash(TEST_PASSWORD, 4);
  const email = freshEmail(label.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  await gateway.db.insert(users).values({ email, name: label, passwordHash: await hashed });
  return email;
}

export async function signIn(
  gateway: Gateway,
  email: string,
  client = new Client(gateway, WEB_URL, randomAddress()),
): Promise<TestAccount> {
  const reply = await client.post<{ data: { account: { id: string } } }>('/auth/signin', {
    email,
    password: TEST_PASSWORD,
  });
  if (reply.status !== 200)
    throw new Error(`signin ${reply.status}: ${JSON.stringify(reply.body)}`);
  return { id: reply.body.data.account.id, email, password: TEST_PASSWORD, client };
}

let addresses = 0;

/** A different documentation-range address each call (198.51.100.0/24 and on). */
export function randomAddress(): string {
  addresses += 1;
  return `198.51.${100 + Math.floor(addresses / 250)}.${(addresses % 250) + 1}`;
}
