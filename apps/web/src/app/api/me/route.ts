import { isCursorColor } from '@canvasflow/types';
import { createClient, getProfile, updateProfile, type ProfileChanges } from '@canvasflow/db';
import { env } from '@/lib/env';
import { corsJson, corsPreflight } from '@/lib/api/cors';
import { auth } from '@/lib/auth';
import type { NextRequest } from 'next/server';

const db = createClient(env.DATABASE_URL);

const MAX_DISPLAY_NAME = 50;

export async function OPTIONS() {
  return corsPreflight('GET, PATCH');
}

async function currentUserId(): Promise<string | null> {
  const session = await auth();
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

  if (body.cursorColor !== undefined) {
    const color = body.cursorColor;
    if (color !== null && !isCursorColor(color)) {
      return corsJson({ error: 'Pick one of the cursor colours shown.' }, { status: 400 });
    }
    changes.cursorColor = color;
  }

  if (changes.name === undefined && changes.cursorColor === undefined) {
    return corsJson({ error: 'Nothing to change.' }, { status: 400 });
  }

  const profile = await updateProfile(db, userId, changes);
  if (!profile) return corsJson({ error: 'Not authenticated' }, { status: 401 });
  return corsJson({ data: profile });
}
