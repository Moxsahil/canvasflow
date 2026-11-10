import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { getAllowedOrigins, isOriginAllowed } from './allowed-origins.js';

const env = (extra: Partial<Env> = {}) =>
  ({ NODE_ENV: 'production', LOG_LEVEL: 'info', ...extra }) as Env;

describe('allowed origins', () => {
  it('always admits the two local apps and adds the configured ones', () => {
    expect(getAllowedOrigins(env())).toEqual(['http://localhost:3000', 'http://localhost:3002']);
    expect(
      getAllowedOrigins(
        env({ WEB_URL: 'https://example.com', EDITOR_URL: 'https://app.example.com' }),
      ),
    ).toEqual([
      'http://localhost:3000',
      'http://localhost:3002',
      'https://example.com',
      'https://app.example.com',
    ]);
  });

  it('matches with or without a trailing slash on either side', () => {
    const allowed = ['https://app.example.com/'];
    expect(isOriginAllowed('https://app.example.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://app.example.com/', ['https://app.example.com'])).toBe(true);
  });

  it('refuses a missing origin, look-alikes and other schemes', () => {
    const allowed = ['https://app.example.com'];
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
    expect(isOriginAllowed('', allowed)).toBe(false);
    expect(isOriginAllowed('https://app.example.com.evil.test', allowed)).toBe(false);
    expect(isOriginAllowed('http://app.example.com', allowed)).toBe(false);
    expect(isOriginAllowed('https://APP.example.com', allowed)).toBe(false);
  });
});
