import type { DeletionPreview } from './account-deletion-api';

/**
 * What the Delete account dialog decides, kept apart from the dialog so each
 * rule can be tested on its own.
 */

/**
 * Whether what was typed is the account's address. Case and surrounding space
 * are forgiven, exactly as the gateway forgives them, so the button never
 * lights up for something the server would then refuse.
 */
export function confirmsAddress(typed: string, email: string): boolean {
  const normalized = typed.trim().toLowerCase();
  return normalized.length > 0 && normalized === email.trim().toLowerCase();
}

/**
 * What the dialog needs before it will delete.
 *
 * - `blocked`: a workspace other people belong to stands in the way.
 * - `password`: the account has a password, so it is asked for.
 * - `recent`: no password, and this sign-in is recent enough to count.
 * - `sign-in-again`: no password, and the sign-in is too old; sign in first.
 */
export type DeletionStep = 'blocked' | 'password' | 'recent' | 'sign-in-again';

export function deletionStep(preview: DeletionPreview, now: number = Date.now()): DeletionStep {
  if (preview.sharedWorkspaces.length > 0) return 'blocked';
  if (preview.identityCheck === 'password') return 'password';
  const until = preview.recentSignInUntil ? Date.parse(preview.recentSignInUntil) : Number.NaN;
  return until > now ? 'recent' : 'sign-in-again';
}

export function readyToDelete(input: {
  step: DeletionStep;
  typed: string;
  email: string;
  password: string;
  busy: boolean;
}): boolean {
  if (input.busy || input.step === 'blocked' || input.step === 'sign-in-again') return false;
  if (input.step === 'password' && input.password.length === 0) return false;
  return confirmsAddress(input.typed, input.email);
}

// ---------------------------------------------------------------------------

/**
 * Coming back from signing in again.
 *
 * A provider sign-in leaves the editor and lands on a board through `/open`,
 * with nothing in the URL to say why. So before leaving, the dialog writes a
 * note in this tab's sessionStorage; the editor reads it once on the way back
 * in and reopens the dialog — for the same account only, and only while the
 * round trip is fresh enough for the new sign-in to still count as recent.
 */
const RESUME_KEY = 'canvasflow:resume-account-deletion';

/** The same ten minutes a sign-in counts as recent for. */
const RESUME_WINDOW_MS = 10 * 60 * 1000;

export function resumeApplies(raw: string | null, userId: string, now: number): boolean {
  if (!raw) return false;
  try {
    const note = JSON.parse(raw) as { userId?: unknown; at?: unknown };
    if (note.userId !== userId || typeof note.at !== 'number') return false;
    const age = now - note.at;
    return age >= 0 && age < RESUME_WINDOW_MS;
  } catch {
    return false;
  }
}

export function rememberDeletionResume(userId: string, now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(RESUME_KEY, JSON.stringify({ userId, at: now }));
  } catch {
    // Storage refused: the dialog simply will not reopen by itself.
  }
}

/** Read the note once and throw it away, whatever it said. */
export function takeDeletionResume(userId: string, now: number = Date.now()): boolean {
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY);
    window.sessionStorage.removeItem(RESUME_KEY);
    return resumeApplies(raw, userId, now);
  } catch {
    return false;
  }
}
