import { isCursorColor } from '@canvasflow/types';
import {
  createClient,
  getProfile,
  parseUsername,
  updateProfile,
  type ProfileChanges,
} from '@canvasflow/db';
import { env } from '@/lib/env';
import { corsJson, corsPreflight } from '@/lib/api/cors';
import { currentSession } from '@/lib/auth/session';
import type { NextRequest } from 'next/server';

const db = createClient(env.DATABASE_URL);

const MAX_DISPLAY_NAME = 50;

export async function OPTIONS() {
  return corsPreflight('GET, PATCH');
}

async function currentUserId(): Promise<string | null> {
  const session = await currentSession();
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return corsJson({ error: 'Not authenticated' }, { status: 401 });

  const profile = await getProfile(db, userId);
  if (!profile) return corsJson({ error: 'Not authenticated' }, { status: 401 });

  return corsJson({ data: profile });
}

interface Patchbody {
  name?: unknown;
  username?: unknown;
  cursorColor?: unknown;
}

export async function PATCH(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return corsJson({ error: 'Not authenticated' }, { status: 401 });

  let body: Patchbody = {};
  try {
    body = (await request.json()) as Patchbody;
  } catch {
    // Falls through to the nothing-to-change rejection below.
  }

  const changes: ProfileChanges = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return corsJson({ error: 'Display name is required.' }, { status: 400 });
    if (name.length > MAX_DISPLAY_NAME) {
      return corsJson(
        {
          error: `Display name must be ${MAX_DISPLAY_NAME} characters or fewer.`,
        },
        { status: 400 },
      );
    }
    changes.name = name;
  }

  if (body.username !== undefined) {
    const parsed = parseUsername(body.username);
    if (!parsed.ok) return corsJson({ error: parsed.error }, { status: 400 });
    changes.username = parsed.username;
  }

  if (body.cursorColor !== undefined) {
    const color = body.cursorColor;
    if (color !== null && !isCursorColor(color)) {
      return corsJson({ error: 'Pick one of the cursor colours shown.' }, { status: 400 });
    }
    changes.cursorColor = color;
  }

  if (Object.keys(changes).length === 0) {
    return corsJson({ error: 'Nothing to change.' }, { status: 400 });
  }

  // The session read above, then this one write: a guest choosing a username
  // is refused inside it rather than by a read before it.
  const saved = await updateProfile(db, userId, changes);
  if (saved.ok) return corsJson({ data: saved.profile });
  switch (saved.reason) {
    case 'username-taken':
      return corsJson({ error: 'That username is taken.' }, { status: 409 });
    case 'guest':
      return corsJson({ error: 'Create an account to choose a username.' }, { status: 403 });
    case 'no-account':
      return corsJson({ error: 'Not authenticated' }, { status: 401 });
  }
}
