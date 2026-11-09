import { describe, expect, it } from 'vitest';
import { createFanOutExtensions } from './redis-fan-out.js';

describe('createFanOutExtensions', () => {
  it('adds nothing for a single instance', () => {
    expect(createFanOutExtensions(undefined)).toEqual([]);
    expect(createFanOutExtensions('')).toEqual([]);
  });
});
