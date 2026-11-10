import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, type Type } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  Client,
  WEB_URL,
  freshEmail,
  randomAddress,
  signUpAndIn,
  startGateway,
  type Gateway,
} from '../testing/gateway.js';

/**
 * Rate limits: that every route has one, and that the limits on the routes
 * that matter most (accounts, sessions, tokens, boards) really answer 429
 * once a caller goes past them, and only that caller.
 *
 * The counts are kept in this process's memory (see the app module), so each
 * gateway started here begins from zero.
 */

let gateway: Gateway;

beforeAll(async () => {
  gateway = await startGateway();
});

afterAll(async () => {
  await gateway.close();
});

/** Sends `count` requests one after another and returns their statuses. */
async function burst(count: number, send: () => Promise<{ status: number }>): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) statuses.push((await send()).status);
  return statuses;
}

describe('every route', () => {
  /**
   * Routes deliberately left without a per-caller limit, each for a reason.
   * Anything else without one fails this test.
   */
  const EXEMPT: Record<string, string> = {
    // Probes from the host's health checker, every few seconds, from its own
    // addresses. A limit would mark a healthy machine as down.
    'GET /health': 'health probe',
    'GET /healthz': 'health probe',
    // The payment provider retries a refused delivery; limiting it could only
    // delay a plan change. Every call is checked against its signature first.
    'POST /billing/polar/webhook': 'signed by the payment provider',
    // Called by the scheduled job and the sync server with a shared secret,
    // and refused before any work without it.
    'POST /internal/digest': 'shared-secret job trigger',
    'POST /internal/notify': 'shared-secret service call',
  };

  it('names a rate limit, apart from the few listed with their reasons', async () => {
    const { AppModule } = await import('../app.module.js');
    const routes = collectRoutes(AppModule);
    expect(routes.length).toBeGreaterThan(90);

    const unlimited = routes
      .filter((route) => !route.limited)
      .map((route) => route.name)
      .filter((name) => !(name in EXEMPT));
    expect(unlimited).toEqual([]);
    // And the list stays honest: nothing exempted that does not exist.
    const names = new Set(routes.map((route) => route.name));
    expect(Object.keys(EXEMPT).filter((name) => !names.has(name))).toEqual([]);
  });
});

describe('sign-up', () => {
  it('allows ten a minute from one address, then 429 with a time to wait', async () => {
    const client = new Client(gateway, WEB_URL, randomAddress());
    const signup = () =>
      client.post('/auth/signup', {
        email: freshEmail('burst'),
        password: 'Burst password 1!',
        name: 'B',
      });
    const statuses = await burst(10, signup);
    expect(statuses.every((status) => status === 201)).toBe(true);

    const over = await signup();
    expect(over.status).toBe(429);
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);

    // Someone else, from another address, is unaffected.
    const neighbour = new Client(gateway, WEB_URL, randomAddress());
    const theirs = await neighbour.post('/auth/signup', {
      email: freshEmail('neighbour'),
      password: 'Burst password 1!',
      name: 'N',
    });
    expect(theirs.status).toBe(201);
  });
});

describe('sign-in', () => {
  it('allows thirty attempts a minute from one address, whatever the account', async () => {
    const client = new Client(gateway, WEB_URL, randomAddress());
    // A different address each time, so the per-account lock never trips and
    // what answers 429 is the per-address limit.
    const attempt = () =>
      client.post('/auth/signin', { email: freshEmail('spray'), password: 'Wrong password 1!' });
    const statuses = await burst(30, attempt);
    expect(statuses.every((status) => status === 401)).toBe(true);
    expect((await attempt()).status).toBe(429);
  });
});

describe('refresh', () => {
  it('allows sixty renewals a minute from one address', async () => {
    const client = new Client(gateway, WEB_URL, randomAddress());
    const statuses = await burst(60, () => client.post('/auth/refresh'));
    expect(statuses.every((status) => status === 401)).toBe(true);
    expect((await client.post('/auth/refresh')).status).toBe(429);
  });
});

describe('board tokens', () => {
  it('mints 120 a minute for one address, then 429', async () => {
    const account = await signUpAndIn(gateway, 'token-burst');
    const { body } = await account.client.get<{ boardId: string }>('/auth/landing-board');
    const mint = () => account.client.get(`/auth/editor-token?boardId=${body.boardId}`);
    const statuses = await burst(120, mint);
    expect(statuses.every((status) => status === 200)).toBe(true);
    expect((await mint()).status).toBe(429);
  });
});

describe('boards', () => {
  it('counts per account, so one person past the limit does not stop another', async () => {
    const first = await signUpAndIn(gateway, 'board-burst');
    const second = await signUpAndIn(gateway, 'board-neighbour');
    const { body } = await first.client.get<{ boardId: string }>('/auth/landing-board');
    const { body: theirs } = await second.client.get<{ boardId: string }>('/auth/landing-board');

    // Both from the same address, as an office would be.
    const shared = randomAddress();
    const firstClient = new Client(gateway, WEB_URL, shared);
    const secondClient = new Client(gateway, WEB_URL, shared);
    for (const [name, value] of first.client.cookies) firstClient.cookies.set(name, value);
    for (const [name, value] of second.client.cookies) secondClient.cookies.set(name, value);

    const open = () => firstClient.get(`/boards/${body.boardId}`);
    const statuses = await burst(240, open);
    expect(statuses.every((status) => status === 200)).toBe(true);
    expect((await open()).status).toBe(429);

    expect((await secondClient.get(`/boards/${theirs.boardId}`)).status).toBe(200);
  });

  it('limits listing boards, which had no limit before', async () => {
    const account = await signUpAndIn(gateway, 'list-burst');
    const statuses = await burst(120, () => account.client.get('/boards'));
    expect(statuses.every((status) => status === 200)).toBe(true);
    expect((await account.client.get('/boards')).status).toBe(429);
  });

  it('limits creating boards, which had no limit before', async () => {
    const account = await signUpAndIn(gateway, 'create-burst');
    const statuses = await burst(30, () => account.client.post('/boards', { title: 'Many' }));
    expect(statuses.every((status) => status === 201)).toBe(true);
    expect((await account.client.post('/boards', { title: 'One more' })).status).toBe(429);
  });
});

interface Route {
  readonly name: string;
  readonly limited: boolean;
}

/** Every route of every controller reachable from `root`, and whether a rate limit guards it. */
function collectRoutes(root: Type<unknown>): Route[] {
  const seenModules = new Set<unknown>();
  const controllers = new Set<Type<unknown>>();
  const visit = (module: unknown) => {
    const type = (module as { module?: unknown })?.module ?? module;
    if (!type || seenModules.has(type)) return;
    seenModules.add(type);
    for (const controller of (Reflect.getMetadata('controllers', type as object) ??
      []) as Type<unknown>[]) {
      controllers.add(controller);
    }
    for (const imported of (Reflect.getMetadata('imports', type as object) ?? []) as unknown[]) {
      visit(imported);
    }
  };
  visit(root);

  const isThrottler = (guard: unknown) =>
    typeof guard === 'function' &&
    (guard === ThrottlerGuard || guard.prototype instanceof ThrottlerGuard);

  const routes: Route[] = [];
  for (const controller of controllers) {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const classGuards = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as unknown[];
    for (const key of Object.getOwnPropertyNames(controller.prototype)) {
      if (key === 'constructor') continue;
      const handler = controller.prototype[key] as object;
      if (typeof handler !== 'function') continue;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (path === undefined || method === undefined) continue;
      const guards = [
        ...classGuards,
        ...((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[]),
      ];
      const full = `/${[base, path]
        .map((part) => part.replace(/^\/|\/$/g, ''))
        .filter(Boolean)
        .join('/')}`;
      routes.push({ name: `${RequestMethod[method]} ${full}`, limited: guards.some(isThrottler) });
    }
  }
  return routes;
}
