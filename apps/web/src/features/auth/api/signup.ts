import { TERMS_VERSION } from '@canvasflow/types';
import { clientEnv } from '@/lib/env.client';

export interface SignupInput {
  email: string;
  password: string;
  name: string;
}

export interface SignupResult {
  ok: boolean;
  error?: string;
  /** Whether the verification mail was accepted. Only meaningful when ok. */
  emailSent?: boolean;
}

/**
 * Create an account through the API gateway.
 *
 * Called from the browser rather than through a server action so the gateway
 * sees the caller's own address. Proxying through this app would make every
 * signup in the product arrive from one origin, and a per-IP limit in front of
 * that route would then be counting us instead of them.
 */
export async function signup(input: SignupInput): Promise<SignupResult> {
  let response: Response;

  try {
    response = await fetch(`${clientEnv.NEXT_PUBLIC_API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The signup page shows the terms line beside the button that calls this,
      // so the account records agreement to the version it showed.
      body: JSON.stringify({ ...input, termsVersion: TERMS_VERSION }),
    });
  } catch {
    // A refused connection or a blocked request. Nothing was created, so this
    // is safe to retry, which is what the message should suggest.
    return { ok: false, error: 'Could not reach the server. Check your connection.' };
  }

  if (response.ok) {
    const body = (await response.json().catch(() => null)) as {
      data?: { emailSent?: boolean };
    } | null;
    return { ok: true, emailSent: body?.data?.emailSent ?? false };
  }

  // The route's own message is preferred where there is one: it is the only
  // thing that knows which rule a password broke.
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return { ok: false, error: body?.message ?? `Signup failed (${response.status}).` };
}
