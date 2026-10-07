import { USERNAME_CHECK_LIMIT } from '@canvasflow/types';
import { createClient, parseUsername, usernameHolders } from '@canvasflow/db';
import { env } from '@/lib/env';
import { corsJson, corsPreflight } from '@/lib/api/cors';
import { tokenUserId } from '@/lib/auth/session';
import type { NextRequest } from 'next/server';

const db = createClient(env.DATABASE_URL);

export async function OPTIONS() {
  return corsPreflight('GET');
}

/**
 * Whether usernames can be had, for the field to say as somebody types.
 *
 * `?name=` once for the name being typed, or several times for a suggestion
 * and its fallbacks — up to `USERNAME_CHECK_LIMIT`. Each is normalized as a
 * save would store it and held to the rules; the ones that pass are looked up
 * together, in one read. The answers come back in the order asked.
 *
 * One database call in all. The caller is known by the token's signature
 * alone (see `tokenUserId`): whether a name is free is what any account could
 * find out, so asking the database whether the session still stands would
 * guard nothing. Guests are not refused here either — the save refuses them.
 *
 * Only advice. The save is what decides, and refuses a name taken in between.
 */
export async function GET(request: NextRequest) {
  const userId = await tokenUserId();
  if (!userId) return corsJson({ error: 'Not authenticated' }, { status: 401 });

  const asked = request.nextUrl.searchParams.getAll('name');
  if (asked.length === 0) {
    return corsJson({ error: 'Name a username to check.' }, { status: 400 });
  }
  if (asked.length > USERNAME_CHECK_LIMIT) {
    return corsJson(
      { error: `Check ${USERNAME_CHECK_LIMIT} usernames or fewer at once.` },
      { status: 400 },
    );
  }

  const parsed = asked.map((name) => ({ name, parsed: parseUsername(name) }));
  const holders = await usernameHolders(
    db,
    parsed.flatMap(({ parsed }) => (parsed.ok ? [parsed.username] : [])),
  );

  return corsJson({
    data: parsed.map(({ name, parsed }) => {
      if (!parsed.ok) return { name, username: null, available: false, problem: parsed.error };
      const holder = holders.get(parsed.username);
      // Their own name is theirs to keep, so it reads as free to them.
      const available = holder === undefined || holder === userId;
      return {
        name,
        username: parsed.username,
        available,
        problem: available ? null : 'That username is taken.',
      };
    }),
  });
}
