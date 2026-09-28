import { describe, expect, it } from 'vitest';
import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../schema/index.js';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  DELETED_USER_NAME,
  USER_REFERENCE_FATES,
  accountStoragePrefixes,
  anonymizedAccount,
} from './account-deletion.js';

const USER_ID = '3ef72266-0242-48aa-a2ad-741a5fd16bf7';
const BOARD_ID = '318a4e6c-bf17-4ec4-a5bd-966fac7a8738';

/** Every column in the schema that references an account, as `table.column`. */
function referencesToUsers(): string[] {
  const found: string[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    for (const foreignKey of config.foreignKeys) {
      const reference = foreignKey.reference();
      if (getTableName(reference.foreignTable) !== 'users') continue;
      for (const column of reference.columns) found.push(`${config.name}.${column.name}`);
    }
  }
  return found.sort();
}

describe('USER_REFERENCE_FATES', () => {
  it('gives every reference to an account a fate, and names none that do not exist', () => {
    // A table added later that points at users fails here until deletion is
    // taught what to do with it — deleted, kept as history, or unlinked.
    expect(Object.keys(USER_REFERENCE_FATES).sort()).toEqual(referencesToUsers());
  });
});

describe('accountStoragePrefixes', () => {
  it('names the photo folder and one folder per owned board', () => {
    expect(accountStoragePrefixes(USER_ID, [BOARD_ID])).toEqual([
      `avatars/${USER_ID}/`,
      `boards/${BOARD_ID}/`,
    ]);
  });

  it('refuses any id that would widen a prefix past one account or one board', () => {
    for (const bad of ['', ' ', 'boards', '..', `${BOARD_ID}/..`, `../${BOARD_ID}`, '*']) {
      expect(() => accountStoragePrefixes(USER_ID, [bad]), JSON.stringify(bad)).toThrow(/Refusing/);
      expect(() => accountStoragePrefixes(bad, []), JSON.stringify(bad)).toThrow(/Refusing/);
    }
  });
});

describe('anonymizedAccount', () => {
  const now = new Date('2026-09-27T10:00:00Z');
  const row = anonymizedAccount(USER_ID, now);

  it('keeps nothing that says who the account was', () => {
    expect(row.name).toBe(DELETED_USER_NAME);
    expect(row.email).toBe(`deleted-${USER_ID}@deleted.invalid`);
    for (const column of [
      'avatarUrl',
      'avatarFileId',
      'avatarMimeType',
      'passwordHash',
      'passwordChangedAt',
      'emailVerifiedAt',
      'termsAcceptedAt',
      'termsVersion',
      'lastSeenAt',
    ] as const) {
      expect(row[column], column).toBeNull();
    }
  });

  it('stays barred from signing in', () => {
    expect(row.disabledAt).toEqual(now);
  });

  it('frees the real address while staying unique per account', () => {
    expect(anonymizedAccount(BOARD_ID, now).email).not.toBe(row.email);
    // `.invalid` is reserved: nothing can ever be delivered to it.
    expect(row.email.endsWith('.invalid')).toBe(true);
  });
});

describe('ACCOUNT_DELETION_GRACE_DAYS', () => {
  it('leaves room inside the 30 days the terms promise', () => {
    // The purge runs daily, so erasure lands within a day of the grace ending.
    expect(ACCOUNT_DELETION_GRACE_DAYS + 1).toBeLessThanOrEqual(30);
  });
});
