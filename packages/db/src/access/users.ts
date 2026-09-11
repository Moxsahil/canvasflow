import { isCursorColor, type CursorColor } from '@canvasflow/types';
import { users, type UserRow } from '../schema/users.js';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';

export interface Profile {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  cursorColor: CursorColor | null;
}

export interface ProfileChanges {
  name?: string;
  cursorColor?: CursorColor | null;
}

const PROFILE_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
  isGuest: users.isGuest,
  preferences: users.preferences,
};

type ProfileRow = Pick<UserRow, keyof typeof PROFILE_COLUMNS>;

function toProfile(row: ProfileRow): Profile {
  const color = row.preferences.cursorColor;
  return {
    id: row.id,
    name: row.name,
    email: row.isGuest ? null : row.email,
    avatarUrl: row.avatarUrl,
    isGuest: row.isGuest,
    cursorColor: isCursorColor(color) ? color : null,
  };
}

export async function getProfile(db: Database, userId: string): Promise<Profile | null> {
  const [row] = await db.select(PROFILE_COLUMNS).from(users).where(eq(users.id, userId)).limit(1);
  return row ? toProfile(row) : null;
}

export async function updateProfile(
  db: Database,
  userId: string,
  changes: ProfileChanges,
): Promise<Profile | null> {
  const [row] = await db
    .update(users)
    .set({
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.cursorColor !== undefined
        ? {
            preferences: sql`${users.preferences} || ${JSON.stringify({
              cursorColor: changes.cursorColor,
            })} :: jsonb`,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning(PROFILE_COLUMNS);

  return row ? toProfile(row) : null;
}
