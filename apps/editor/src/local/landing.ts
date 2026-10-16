import { env } from '@/lib/env';

/**
 * Whether this browser has had an account in it — a note the editor leaves
 * when an account's board opens, and takes away on signing out.
 *
 * It decides how the editor's own address opens. Without it — a first visit,
 * a search engine, somebody who signed out — the board kept in this browser
 * opens straight away, with nothing to wait for. With it, the editor first
 * asks the gateway whether that account is still signed in, and if so opens
 * the account's own board instead: someone who has an account should never be
 * shown the board meant for people without one.
 *
 * Only a hint. The answer comes from the gateway; this only says whether
 * asking is worth the wait.
 */
const HINT_KEY = 'canvasflow:account-here';

export function rememberAccountHere(): void {
  try {
    window.localStorage.setItem(HINT_KEY, '1');
  } catch {
    // Storage refused: every visit opens on the local board, signed in or not.
  }
}

export function forgetAccountHere(): void {
  try {
    window.localStorage.removeItem(HINT_KEY);
  } catch {
    // Nothing stored to forget.
  }
}

export function accountWasHere(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) !== null;
  } catch {
    return false;
  }
}

export type LandingAnswer =
  | { status: 'signed-in'; boardId: string }
  | { status: 'signed-out' }
  /** No answer worth acting on — offline, a gateway restart, a refusal to say. */
  | { status: 'unknown' };

/** Long enough for a renewal on a slow line; past it, the local board opens. */
const LANDING_TIMEOUT_MS = 5_000;

/**
 * How long to wait before asking once more after a 401.
 *
 * A renewal rotates the refresh cookie, so two asked at once — two tabs opened
 * together — race, and the one that loses is refused although the account is
 * signed in. By now the winner has set the new cookie, and asking again with
 * it settles the question either way.
 */
const RETRY_AFTER_401_MS = 500;

async function ask(): Promise<LandingAnswer> {
  try {
    const res = await fetch(new URL('/auth/landing-board', env.VITE_API_URL), {
      credentials: 'include',
      signal: AbortSignal.timeout(LANDING_TIMEOUT_MS),
    });
    if (res.status === 401) return { status: 'signed-out' };
    if (!res.ok) return { status: 'unknown' };
    const body = (await res.json()) as { boardId?: unknown };
    return typeof body.boardId === 'string'
      ? { status: 'signed-in', boardId: body.boardId }
      : { status: 'unknown' };
  } catch {
    return { status: 'unknown' };
  }
}

/** The question already being asked, which anyone else asking now shares. */
let asking: Promise<LandingAnswer> | null = null;

/**
 * Ask the gateway where this browser's account starts, renewing its session
 * on the way: the board it last worked in. The gateway, because only it ever
 * sees the cookie that keeps an account signed in for weeks; the web app sees
 * the 15-minute one, and would call somebody back after lunch signed out.
 *
 * One request at a time from this page, for the race described above.
 */
export function findLandingBoard(): Promise<LandingAnswer> {
  asking ??= (async () => {
    const first = await ask();
    if (first.status !== 'signed-out') return first;
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_401_MS));
    return ask();
  })().finally(() => {
    asking = null;
  });
  return asking;
}
