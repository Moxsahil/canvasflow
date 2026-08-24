import { NextResponse, type NextRequest } from 'next/server';
import { createClient, ensureBoardForUser } from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { checkBoardAccess } from '@/lib/boards/access';
import { editorUrlFor, mintEditorToken } from '@/lib/auth/editor-token';

/**
 * The way into the app.
 *
 * There is no board list page any more — the editor's own switcher is where
 * boards are browsed — so signing in has to land on a canvas. This picks the
 * board the user last worked in, creating their first one (and a personal
 * workspace to hold it) if they have none, then hands off to the editor the
 * same way an invite does: a short-lived token in the URL fragment, where it
 * stays out of server logs and Referer headers.
 *
 * Unauthenticated callers never reach here — the middleware sends them to
 * /login with this path as `next`.
 */

const db = createClient(env.DATABASE_URL);

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.redirect(new URL('/login?next=/open', env.AUTH_URL));
  }

  const board = await ensureBoardForUser(db, { userId: user.id, userName: user.name });

  const access = await checkBoardAccess(user.id, board.id);
  if (!access) {
    // Only reachable if the board was deleted between the two queries above.
    // One more pass creates a fresh one; a second failure is something else,
    // and bouncing forever would be worse than saying so.
    if (request.nextUrl.searchParams.has('retry')) {
      return NextResponse.json({ error: 'Could not open a board.' }, { status: 500 });
    }
    return NextResponse.redirect(new URL('/open?retry=1', env.AUTH_URL));
  }

  const minted = await mintEditorToken(
    { id: user.id, email: user.email ?? null, name: user.name ?? null },
    access,
  );

  return NextResponse.redirect(editorUrlFor(board.id, minted.token));
}
