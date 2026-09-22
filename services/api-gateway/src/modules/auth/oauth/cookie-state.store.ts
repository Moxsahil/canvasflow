import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request } from 'express';

/**
 * How long somebody has to finish choosing an account at the provider.
 *
 * Ten minutes is generous for a consent screen and short enough that a state
 * left behind on a shared machine is worthless by the time anyone finds it.
 */
const STATE_TTL_MS = 10 * 60 * 1000;

/** 24 bytes, the same budget passport's own session store uses for a handle. */
const STATE_BYTES = 24;

/**
 * Scoped to the only routes that read it. Narrower than the session cookies on
 * purpose: this one is meaningless anywhere else and has no reason to travel.
 */
const STATE_COOKIE_PATH = '/auth/oauth';

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (err: Error | null, ok: boolean, info?: { message: string }) => void;

/**
 * Where the `state` parameter is kept between the redirect out and the
 * redirect back.
 *
 * Passport's own implementation keeps it in `req.session`, which would mean
 * running express-session and giving this service a session store for the sake
 * of one value that lives for one round trip. A cookie holds it just as well,
 * and the check is the same either way: the value that comes back from the
 * provider has to be the value we sent.
 *
 * Without that check the callback accepts any authorization code presented to
 * it, so somebody can hand a victim's browser a code they obtained themselves
 * and have the session come back signed in as the attacker.
 *
 * `SameSite=Lax` is what lets this work at all: the provider returns through a
 * top-level navigation, which lax permits, while still keeping the cookie off
 * cross-site requests a page makes on its own.
 *
 * Both methods are declared twice because passport's interface allows a form
 * with and without `meta`, and it chooses which to call by counting the
 * implementation's parameters. Three and four are the ones that receive `req`,
 * which is the whole reason this class can work without a session.
 */
export class CookieStateStore {
  private readonly cookieName: string;

  constructor(
    provider: string,
    private readonly secure: boolean,
  ) {
    this.cookieName = `cf.oauth.${provider}`;
  }

  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: STATE_COOKIE_PATH,
    };
  }

  /** Mint a state, remember it in a cookie, and hand it to passport for the authorize URL. */
  store(req: Request, callback: StoreCallback): void;
  store(req: Request, meta: unknown, callback: StoreCallback): void;
  store(req: Request, metaOrCallback: unknown, maybeCallback?: StoreCallback): void {
    const callback = (maybeCallback ?? metaOrCallback) as StoreCallback;
    const response = req.res;

    if (!response) {
      callback(new Error('No response object available to store OAuth state'));
      return;
    }

    const state = randomBytes(STATE_BYTES).toString('base64url');
    response.cookie(this.cookieName, state, { ...this.options(), maxAge: STATE_TTL_MS });
    callback(null, state);
  }

  /**
   * Confirm the returned state is the one we sent, then spend it.
   *
   * Cleared either way. A state is good for exactly one callback, so leaving a
   * used one in place would let the same code be replayed.
   */
  verify(req: Request, state: string | undefined, callback: VerifyCallback): void;
  verify(req: Request, state: string | undefined, meta: unknown, callback: VerifyCallback): void;
  verify(
    req: Request,
    provided: string | undefined,
    metaOrCallback: unknown,
    maybeCallback?: VerifyCallback,
  ): void {
    const callback = (maybeCallback ?? metaOrCallback) as VerifyCallback;
    const expected = (req.cookies as Record<string, string> | undefined)?.[this.cookieName];

    req.res?.clearCookie(this.cookieName, this.options());

    if (!expected || !provided) {
      callback(null, false, { message: 'Missing OAuth state' });
      return;
    }

    if (!equals(expected, provided)) {
      callback(null, false, { message: 'Invalid OAuth state' });
      return;
    }

    callback(null, true);
  }
}

/** Length-safe constant-time comparison; `timingSafeEqual` throws on a mismatch. */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
