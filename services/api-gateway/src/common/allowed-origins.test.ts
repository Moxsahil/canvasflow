import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { allowedOrigins, isAllowedOrigin } from './allowed-origins.js';

const env = (extra: Partial<Env>) => extra as Env;

describe('allowedOrigins', () => {
  it('admits only the configured hosts in production', () => {
    const prod = env({
      NODE_ENV: 'production',
      WEB_URL: 'https://canvasflowapp.com',
      EDITOR_URL: 'https://app.canvasflowapp.com',
    });
    expect(allowedOrigins(prod)).toEqual([
      'https://canvasflowapp.com',
      'https://app.canvasflowapp.com',
    ]);
    expect(isAllowedOrigin('http://localhost:3002', prod)).toBe(false);
  });

  it('admits the dev ports, and the configured hosts, outside production', () => {
    expect(
      allowedOrigins(env({ NODE_ENV: 'development', WEB_URL: 'http://localhost:3000' })),
    ).toEqual(['http://localhost:3000', 'http://localhost:3002']);
    const local = env({
      NODE_ENV: 'development',
      WEB_URL: 'http://localhost:3100',
      EDITOR_URL: 'http://localhost:3102',
    });
    expect(isAllowedOrigin('http://localhost:3102', local)).toBe(true);
    expect(isAllowedOrigin('http://localhost:3002', local)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', local)).toBe(false);
    expect(isAllowedOrigin(undefined, local)).toBe(true);
  });
});
