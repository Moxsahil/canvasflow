/**
 * Where a board's token is stashed so it survives a page refresh, one key per
 * board — a token scoped to board A must never be reused on board B. Lives
 * here rather than in useAuthToken because signing out has to forget every one
 * of them, and that runs outside the hook.
 */
const STORAGE_KEY_PREFIX = 'editor:authToken:';

export function authTokenStorageKey(boardId: string): string {
  return `${STORAGE_KEY_PREFIX}${boardId}`;
}

/**
 * Forget every board token this tab is holding.
 *
 * Signing out ends the web session these are minted from, but the tokens
 * already handed out stay valid for their remaining few minutes — so leaving
 * them in sessionStorage would let the next person on the machine open the
 * same board URL and pick up an editing session that isn't theirs, until it
 * lapsed. Not just this board's: a tab that has been through several holds a
 * key for each.
 */
export function clearStoredAuthTokens(): void {
  const store = window.sessionStorage;
  const doomed: string[] = [];
  // Collected first, removed after: removing during the walk reindexes the
  // store underneath it and skips keys.
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) doomed.push(key);
  }
  for (const key of doomed) store.removeItem(key);
}

export function getAuthTokenFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  return params.get('token');
}

export function clearAuthTokenFromHash(): void {
  if (typeof window === 'undefined') return;
  const cleanUrl = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', cleanUrl);
}

interface EditorTokenClaims {
  id?: string;
  email?: string;
  name?: string;
  isGuest?: boolean;
  boardId?: string;
  workspaceId?: string;
  role?: string;
  exp?: number;
}

/**
 * Reads a JWT's payload without verifying its signature.
 *
 * Safe for everything below because none of it establishes trust: the claims
 * are used to schedule a refresh, to check a cached token still belongs to the
 * board on screen, and to label the local user in the UI. The sync-server
 * verifies the signature on every connection, and re-checks board access
 * against the database besides.
 */
function decodeClaims(token: string): EditorTokenClaims | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as EditorTokenClaims;
  } catch {
    return null;
  }
}

/** Expiry in milliseconds since epoch, or null. Used to schedule the refresh. */
export function decodeJwtExpiry(token: string): number | null {
  const exp = decodeClaims(token)?.exp;
  return typeof exp === 'number' ? exp * 1000 : null;
}

/**
 * Reads the `boardId` claim out of a JWT without verifying the signature.
 * Used to double-check that a token loaded from sessionStorage matches
 * the board being viewed — if a user navigates to a different board's
 * URL, we must not reuse a token scoped to the previous board.
 */
export function decodeJwtBoardId(token: string): string | null {
  const boardId = decodeClaims(token)?.boardId;
  return typeof boardId === 'string' ? boardId : null;
}

export function decodeJwtUserId(token: string): string | null {
  return decodeJwtUser(token)?.id ?? null;
}

/**
 * The workspace this board belongs to, as the token records it.
 *
 * Read by the board switcher so it can show the board's own workspace open
 * from the start. Not a permission — the web app re-derives membership on
 * every request the switcher makes.
 */
export function decodeJwtWorkspaceId(token: string): string | null {
  const workspaceId = decodeClaims(token)?.workspaceId;
  return typeof workspaceId === 'string' ? workspaceId : null;
}

/**
 * The user's role on this board, which decides whether the session may edit.
 *
 * A *board* role, not a workspace one: someone invited by share link is not a
 * workspace member at all. Enforcement lives on the socket — the sync-server
 * marks viewer connections read-only — so this only drives what the UI offers.
 */
export type EditorRole = 'owner' | 'editor' | 'viewer';

export interface EditorUser {
  readonly id: string;
  /** Display name, falling back to the local part of the email, then "Anonymous". */
  readonly name: string;
  readonly email: string | null;
  readonly role: EditorRole | null;
  /** True when this session may not write. Viewers, and anything unrecognised. */
  readonly readOnly: boolean;
  /**
   * Someone who joined by share link without an account.
   *
   * Changes what we can offer them when a session ends: an account holder has
   * their own boards to go back to, a guest has nowhere and is offered an
   * account instead. Defaults to false for a token minted before this claim
   * existed — the account path is the one that degrades gracefully, since it
   * lands on a page that signs them in if they aren't.
   */
  readonly isGuest: boolean;
}

/**
 * The signed-in user, as the editor token describes them.
 *
 * `/api/editor-token` already signs `name`, `email` and `role` alongside the
 * id; until presence needed them the editor only ever read `id`, which is why
 * the account row in the sidebar has been showing a raw UUID.
 */
export function decodeJwtUser(token: string): EditorUser | null {
  const claims = decodeClaims(token);
  if (!claims || typeof claims.id !== 'string' || claims.id.length === 0) return null;

  const email = typeof claims.email === 'string' && claims.email ? claims.email : null;
  const name = typeof claims.name === 'string' ? claims.name.trim() : '';
  const claimed = claims.role;
  const role: EditorRole | null =
    claimed === 'owner' || claimed === 'editor' || claimed === 'viewer' ? claimed : null;

  return {
    id: claims.id,
    // A board where everyone is called "Anonymous" is barely better than no
    // names at all, so fall back through the email before giving up on one.
    name: name || email?.split('@')[0] || 'Anonymous',
    email,
    role,
    // Unrecognised roles read as read-only rather than as full access: an
    // older token, or one this build doesn't understand, must not be treated
    // as permission to write.
    readOnly: role !== 'owner' && role !== 'editor',
    isGuest: claims.isGuest === true,
  };
}

export interface RefreshedToken {
  token: string;
  expiresAt: number;
  boardId: string;
}

/**
 * A refusal from the token route, carrying the status that explains it.
 *
 * The status is the difference between "try again shortly" and "stop": a 404
 * means this account cannot open this board at all — removed from it, or the
 * board is gone — and re-asking will be refused every time.
 */
export class TokenRefreshError extends Error {
  constructor(readonly status: number) {
    super(`Token refresh failed: ${status}`);
    this.name = 'TokenRefreshError';
  }

  /** No path back for this session. See the route: 404 covers both cases. */
  get accessDenied(): boolean {
    return this.status === 404;
  }
}

/**
 * Silently mints a fresh editor token, scoped to a specific board, by
 * calling back to the web app with the user's session cookie (cross-origin,
 * credentialed — the web app's /api/editor-token route allows this origin
 * via CORS).
 *
 * The board scoping means each token authorizes access to exactly one
 * board. Attempting to use a board-A token against board B is rejected
 * by the sync-server. If the user has lost access to the board, this
 * request returns 404 and refreshing will fail — matching the intended
 * revocation semantics.
 */
export async function refreshAuthToken(webUrl: string, boardId: string): Promise<RefreshedToken> {
  const url = new URL('/api/editor-token', webUrl);
  url.searchParams.set('boardId', boardId);

  const res = await fetch(url.toString(), { credentials: 'include' });
  if (!res.ok) {
    throw new TokenRefreshError(res.status);
  }
  const json = (await res.json()) as {
    token: string;
    expiresAt: number;
    boardId: string;
  };
  return json;
}
