import { clientEnv } from '@/lib/env.client';

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignInResult {
  ok: boolean;
  error?: string;
}

/**
 * Sign in through the API gateway.
 *
 * From the browser rather than a server action, for the same reason signup is:
 * the gateway has to see the caller's own address, or the per-IP limit in
 * front of this route would be counting this app instead of them.
 *
 * `credentials: 'include'` is what makes the whole thing work. The session
 * arrives as two `Set-Cookie` headers and nothing else — no token in the body,
 * because a body is readable by script and the refresh cookie is the one worth
 * stealing. Without this flag the browser discards both and the sign-in
 * silently does nothing.
 */
export async function signInWithPassword(input: SignInInput): Promise<SignInResult> {
  let response: Response;

  try {
    response = await fetch(`${clientEnv.NEXT_PUBLIC_API_URL}/auth/signin`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' };
  }

  if (response.ok) return { ok: true };

  // The gateway answers every failed sign-in with one sentence on purpose, so
  // that it cannot be used to discover which addresses have accounts. Passing
  // it through unchanged keeps that true here; inventing a friendlier message
  // per status code is how that property gets given away.
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return { ok: false, error: body?.message ?? 'Invalid email or password' };
}

/** Where the browser goes to hand a provider sign-in to the gateway. */
export function oauthStartUrl(provider: 'google' | 'github', next: string): string {
  const url = new URL(`/auth/oauth/${provider}`, clientEnv.NEXT_PUBLIC_API_URL);
  url.searchParams.set('next', next);
  return url.toString();
}

/**
 * Exchange the refresh cookie for a fresh pair.
 *
 * From the browser rather than the server, and not by choice: the refresh
 * cookie is scoped to `/auth`, so it is sent to the gateway's own routes and
 * nowhere else. Nothing on this app's origin ever receives it, which is
 * exactly the point of that scoping and why this call cannot be proxied.
 *
 * Answers only whether the session survived. The new credentials arrive as
 * cookies; there is nothing here for a caller to hold.
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch(`${clientEnv.NEXT_PUBLIC_API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    // Offline, or the gateway is down. Not a dead session — reporting it as
    // one would sign somebody out over a dropped connection.
    return false;
  }
}
