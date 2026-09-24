import { describe, expect, it } from 'vitest';
import { matchOnAddress, type AddressMatchAccount } from './address-match.js';

const confirmed: AddressMatchAccount = {
  isGuest: false,
  disabledAt: null,
  emailVerifiedAt: new Date('2026-09-01T00:00:00Z'),
};
const unconfirmed: AddressMatchAccount = { ...confirmed, emailVerifiedAt: null };

describe('matchOnAddress', () => {
  it('links a provider to an account whose address is already confirmed', () => {
    expect(matchOnAddress(confirmed, true)).toBe('link');
  });

  it('claims an account whose address nobody has confirmed', () => {
    expect(matchOnAddress(unconfirmed, true)).toBe('claim');
  });

  it('refuses an address the provider has not confirmed, whatever the account', () => {
    expect(matchOnAddress(confirmed, false)).toBe('refuse');
    expect(matchOnAddress(unconfirmed, false)).toBe('refuse');
    expect(matchOnAddress({ ...confirmed, isGuest: true }, false)).toBe('refuse');
  });

  it('changes nothing on a barred account, even an unconfirmed one', () => {
    const barred = { ...unconfirmed, disabledAt: new Date('2026-09-10T00:00:00Z') };
    expect(matchOnAddress(barred, true)).toBe('barred');
    expect(matchOnAddress({ ...barred, emailVerifiedAt: new Date() }, true)).toBe('barred');
  });

  it('changes nothing on a guest', () => {
    expect(matchOnAddress({ ...unconfirmed, isGuest: true }, true)).toBe('barred');
  });
});
