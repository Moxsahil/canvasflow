import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('fills in the defaults', () => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@127.0.0.1:5432/db');
    vi.stubEnv('NODE_ENV', 'production');
    for (const key of ['PORT_WS', 'PORT_HTTP', 'LOG_LEVEL']) delete process.env[key];
    expect(parseEnv()).toMatchObject({ PORT_WS: 4000, PORT_HTTP: 4001, LOG_LEVEL: 'info' });
  });

  it('exits on a short secret rather than starting half-configured', () => {
    vi.stubEnv('AUTH_SECRET', 'short');
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@127.0.0.1:5432/db');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    expect(() => parseEnv()).toThrow('exit 1');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
