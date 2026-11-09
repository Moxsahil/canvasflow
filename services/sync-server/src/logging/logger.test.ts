import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { createLogger } from './logger.js';

describe('logger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes one JSON line per entry, below-threshold levels dropped, warn/error to stderr', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const log = createLogger({ LOG_LEVEL: 'info' } as Env, { service: 's' }).child({
      requestId: 'r',
    });

    log.debug('hidden');
    log.info('shown', { boardId: 'b' });
    log.warn('careful');
    log.error('broken');

    expect(out).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(out.mock.calls[0]![0]))).toMatchObject({
      level: 'info',
      msg: 'shown',
      service: 's',
      requestId: 'r',
      boardId: 'b',
    });
    expect(err.mock.calls.map((c) => JSON.parse(String(c[0])).level)).toEqual(['warn', 'error']);
  });
});
