import { acceptTerms, createClient } from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';
import { env } from '@/lib/env';
import { corsJson, corsPreflight } from '@/lib/api/cors';
import { currentSession } from '@/lib/auth/session';
import type { NextRequest } from 'next/server';

const db = createClient(env.DATABASE_URL);

export async function OPTIONS() {
  return corsPreflight('POST');
}

/**
 * Record that the signed-in person agreed to the terms, from the editor's
 * notice asking the accounts that have no agreement on record.
 *
 * The body names the version the notice showed, and only the one in force is
 * recorded. Anything else is refused rather than quietly ignored: it means the
 * terms changed while the notice was open, and the person should read the new
 * ones before agreeing to anything.
 */
export async function POST(request: NextRequest) {
  const session = await currentSession();
  const userId = session?.user?.id;
  if (!userId) return corsJson({ error: 'Not authenticated' }, { status: 401 });

  let shown: unknown = null;
  try {
    shown = ((await request.json()) as { termsVersion?: unknown }).termsVersion;
  } catch {
    // Falls through to the refusal below, like a body that names nothing.
  }

  if (shown !== TERMS_VERSION) {
    return corsJson(
      { error: 'The terms have changed since this page loaded. Reload to read the new ones.' },
      { status: 409 },
    );
  }

  const profile = await acceptTerms(db, userId, shown);
  // A live session for an account that is gone, answered as /api/me answers it.
  if (!profile) return corsJson({ error: 'Not authenticated' }, { status: 401 });

  return corsJson({ data: profile });
}
