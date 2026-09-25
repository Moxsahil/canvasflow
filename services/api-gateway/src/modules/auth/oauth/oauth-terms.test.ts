import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { termsAcceptance } from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';
import { rememberTerms, takeTerms } from './oauth-terms.js';

// The cookie flags read the environment, which the tests do not load.
vi.mock('../../../config/env.js', () => ({ parseEnv: () => ({ NODE_ENV: 'test' }) }));

const COOKIE = 'cf.oauth.terms';

function request(query: Record<string, unknown>, cookies: Record<string, string> = {}): Request {
  return { query, cookies } as unknown as Request;
}

/** Records what a route did to the browser's cookies, which is all these touch. */
function response() {
  const set: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const cleared: string[] = [];
  const res = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      set.push({ name, value, options });
      return res;
    },
    clearCookie(name: string) {
      cleared.push(name);
      return res;
    },
  };
  return { res: res as unknown as Response, set, cleared };
}

describe('rememberTerms', () => {
  it('keeps the version the page showed for the length of the provider round trip', () => {
    const { res, set } = response();
    rememberTerms(request({ terms: TERMS_VERSION }), res);

    expect(set).toEqual([
      {
        name: COOKIE,
        value: TERMS_VERSION,
        options: expect.objectContaining({
          httpOnly: true,
          path: '/auth/oauth',
          maxAge: 10 * 60 * 1000,
        }),
      },
    ]);
  });

  it('keeps nothing, and clears any leftover, when the page named no terms in force', () => {
    for (const query of [{}, { terms: '2020-01-01' }, { terms: [TERMS_VERSION] }]) {
      const { res, set, cleared } = response();
      rememberTerms(request(query), res);

      expect(set).toEqual([]);
      expect(cleared).toEqual([COOKIE]);
    }
  });
});

describe('takeTerms', () => {
  it('hands back the version the page showed, and spends it', () => {
    const { res, cleared } = response();

    expect(takeTerms(request({}, { [COOKIE]: TERMS_VERSION }), res)).toBe(TERMS_VERSION);
    expect(cleared).toEqual([COOKIE]);
  });

  it('answers null for no cookie or one that is not the terms in force, and still spends it', () => {
    const cases: Record<string, string>[] = [{}, { [COOKIE]: '2020-01-01' }];
    for (const cookies of cases) {
      const { res, cleared } = response();

      expect(takeTerms(request({}, cookies), res)).toBeNull();
      expect(cleared).toEqual([COOKIE]);
    }
  });
});

describe('termsAcceptance', () => {
  it('records the version in force, stamped with when the account was made', () => {
    const at = new Date('2026-09-25T10:00:00Z');

    expect(termsAcceptance(TERMS_VERSION, at)).toEqual({
      termsAcceptedAt: at,
      termsVersion: TERMS_VERSION,
    });
  });

  it('records nothing for another version, or when nothing says what was shown', () => {
    for (const shown of ['2020-01-01', undefined, null, 42]) {
      expect(termsAcceptance(shown)).toEqual({ termsAcceptedAt: null, termsVersion: null });
    }
  });
});
