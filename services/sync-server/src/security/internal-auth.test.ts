import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_CHANGED_PURPOSE,
  BOARD_ACCESS_PURPOSE,
  internalToken,
  isInternalCaller,
} from './internal-auth.js';

const SECRET = 'a-secret-that-is-long-enough-for-tests-000000';

describe('internal caller credential', () => {
  it('accepts the credential derived for the same purpose', () => {
    expect(isInternalCaller(internalToken(SECRET), SECRET)).toBe(true);
    expect(
      isInternalCaller(
        internalToken(SECRET, ACCOUNT_CHANGED_PURPOSE),
        SECRET,
        ACCOUNT_CHANGED_PURPOSE,
      ),
    ).toBe(true);
  });

  it('is not the secret itself and differs per purpose', () => {
    expect(internalToken(SECRET)).not.toContain(SECRET);
    expect(internalToken(SECRET, BOARD_ACCESS_PURPOSE)).not.toBe(
      internalToken(SECRET, ACCOUNT_CHANGED_PURPOSE),
    );
  });

  it('refuses anything else', () => {
    expect(isInternalCaller(undefined, SECRET)).toBe(false);
    expect(isInternalCaller('', SECRET)).toBe(false);
    expect(isInternalCaller(['x'], SECRET)).toBe(false);
    expect(isInternalCaller(SECRET, SECRET)).toBe(false);
    expect(isInternalCaller(internalToken(SECRET).slice(0, -1), SECRET)).toBe(false);
    expect(isInternalCaller(internalToken('another-secret-entirely-000000000000'), SECRET)).toBe(
      false,
    );
    expect(isInternalCaller(internalToken(SECRET, ACCOUNT_CHANGED_PURPOSE), SECRET)).toBe(false);
  });
});
