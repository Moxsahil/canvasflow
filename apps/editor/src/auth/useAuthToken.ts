import { useCallback, useEffect, useRef, useState } from 'react';
import {
  authTokenStorageKey as storageKeyFor,
  clearAuthTokenFromHash,
  decodeJwtBoardId,
  decodeJwtExpiry,
  getAuthTokenFromHash,
  refreshAuthToken,
  sessionResumeUrl,
  TokenRefreshError,
} from './token';

// Refresh a little before actual expiry so in-flight sync calls don't
// race the token going stale.
const REFRESH_MARGIN_MS = 60_000;

// Guard against hammering the web app if refreshes keep failing (e.g.
// the user's web session itself expired) — several BoardSync flushes
// can all report a 401 in quick succession.
const MIN_REFRESH_INTERVAL_MS = 5_000;

/**
 * How many refusals in a row before this session is treated as over.
 *
 * Not one: a single 401 can be a renewal that lost a race to another tab, and
 * the next attempt succeeds. Not unbounded either — that was the bug. A board
 * whose token cannot be reminted is not usable, and retrying it silently for
 * ever left people looking at a dead canvas with nothing to act on.
 */
const MAX_UNAUTHORIZED = 3;

/**
 * How long to wait before trying again when a mint asked for by `refreshNow`
 * fails. A change the server reported must not be lost to one network blip —
 * waiting for the scheduled refresh would leave the board in the old state
 * for minutes. After the last of these, the scheduled refresh takes over.
 */
const RETRY_AFTER_MS = [1_000, 3_000, 10_000];

interface AuthTokenState {
  token: string | null;
  expiresAt: number | null;
}

/**
 * Load the initial token for a specific board. Priority:
 *   1. URL hash (fresh from a board-open redirect)
 *   2. sessionStorage keyed by boardId (survives page refresh)
 *
 * A hash token wins even if a stored one exists — this handles the case
 * where a user opens a second board in the same tab. The redirect from
 * the dashboard carries a fresh token, and we should always trust that
 * over anything stashed.
 *
 * If either token is present but its boardId claim doesn't match the
 * current board, we drop it — never reuse a cross-board token.
 */
function readInitialToken(boardId: string): AuthTokenState {
  const fromHash = getAuthTokenFromHash();
  if (fromHash) {
    const claimedBoardId = decodeJwtBoardId(fromHash);
    if (claimedBoardId === boardId) {
      window.sessionStorage.setItem(storageKeyFor(boardId), fromHash);
      clearAuthTokenFromHash();
      return { token: fromHash, expiresAt: decodeJwtExpiry(fromHash) };
    }
    // Hash token exists but scoped to a different board — clear it, keep looking
    clearAuthTokenFromHash();
  }

  const stored = window.sessionStorage.getItem(storageKeyFor(boardId));
  if (stored) {
    const claimedBoardId = decodeJwtBoardId(stored);
    if (claimedBoardId === boardId) {
      return { token: stored, expiresAt: decodeJwtExpiry(stored) };
    }
    // Stored token exists but scoped to a different board — discard
    window.sessionStorage.removeItem(storageKeyFor(boardId));
  }

  return { token: null, expiresAt: null };
}

/**
 * Owns the editor's auth token for its whole lifetime: picks it up from
 * the URL hash (or sessionStorage on refresh), then keeps it fresh by
 * silently re-minting it from the web app shortly before it expires —
 * so long editing sessions don't run into a dead "sync error" once the
 * initial 5-minute token lapses.
 *
 * The token is scoped to a specific board. Passing a different boardId
 * on re-render triggers a fresh initial-token read for that board.
 */
export function useAuthToken(boardId: string): {
  authToken: string | null;
  refresh: () => Promise<void>;
  /**
   * Re-mint now, past the retry throttle: the server has just said something
   * the token carries has changed — a role, a name — and a token that misses
   * it stays wrong until the next scheduled refresh, minutes away.
   */
  refreshNow: () => Promise<void>;
  /**
   * The web app says this account cannot open this board — removed from it, or
   * the board is gone. Distinct from every other refresh failure, which are
   * worth retrying; this one never is.
   */
  accessDenied: boolean;
} {
  const [state, setState] = useState<AuthTokenState>(() => readInitialToken(boardId));
  const tokenRef = useRef<string | null>(state.token);
  tokenRef.current = state.token;
  const [accessDenied, setAccessDenied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAttemptRef = useRef(0);
  const unauthorizedRef = useRef(0);
  // One mint at a time, and whether another was asked for while it ran.
  const inFlightRef = useRef(false);
  const againRef = useRef(false);

  /** Resolves true once there is nothing left to try: minted, or refused for good. */
  const mint = useCallback(async (): Promise<boolean> => {
    try {
      // The token in hand says whether this is an account or a guest, which
      // decides who can mint the next one. Read through a ref so a new token
      // does not rebuild this callback and restart every timer that uses it.
      const next = await refreshAuthToken(boardId, tokenRef.current);
      unauthorizedRef.current = 0;
      window.sessionStorage.setItem(storageKeyFor(boardId), next.token);
      setState({ token: next.token, expiresAt: next.expiresAt });
      return true;
    } catch (err) {
      // A refusal that will be repeated forever is not a transient failure,
      // and leaving it to the console is what let a removed collaborator sit
      // on a board that had stopped being theirs. Everything else — a network
      // blip, a lapsed web session — keeps the existing quiet retry.
      if (err instanceof TokenRefreshError && err.accessDenied) {
        setAccessDenied(true);
        return true;
      }

      // No session behind this board any more. Hand the browser to the
      // gateway, which renews if there is anything left to renew and otherwise
      // lands on sign-in. Anything else — a network blip, a gateway restart —
      // keeps the quiet retry it always had.
      if (err instanceof TokenRefreshError && err.status === 401) {
        unauthorizedRef.current += 1;
        if (unauthorizedRef.current >= MAX_UNAUTHORIZED) {
          window.location.href = sessionResumeUrl();
          return true;
        }
      }

      console.error('Failed to refresh editor auth token:', err);
      return false;
    }
  }, [boardId]);

  /**
   * Mint, and once more afterwards if `refreshNow` was asked for meanwhile.
   *
   * The second mint matters: a role changed back while the first was in
   * flight may be answered with the role from before, and only a mint that
   * starts after the change is sure to carry it.
   */
  const run = useCallback(async (): Promise<boolean> => {
    inFlightRef.current = true;
    let settled: boolean;
    try {
      do {
        againRef.current = false;
        settled = await mint();
      } while (againRef.current);
    } finally {
      inFlightRef.current = false;
    }
    return settled;
  }, [mint]);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastAttemptRef.current < MIN_REFRESH_INTERVAL_MS) return;
    // The mint already under way will do.
    if (inFlightRef.current) return;
    lastAttemptRef.current = now;
    await run();
  }, [run]);

  // Not throttled: the throttle is there for failures that repeat, and these
  // come one per change the server reports. Dropping one is what left a
  // collaborator switched to viewer and straight back stuck on "View only".
  // A failure is tried again shortly, for the same reason.
  const refreshNow = useCallback(async () => {
    for (let attempt = 0; ; attempt += 1) {
      lastAttemptRef.current = Date.now();
      if (inFlightRef.current) {
        // The mint under way runs once more when it finishes, and that one
        // starts after this change.
        againRef.current = true;
        return;
      }
      if (await run()) return;
      const wait = RETRY_AFTER_MS[attempt];
      if (wait === undefined) return;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }, [run]);

  // When boardId changes, re-read initial token for the new board
  useEffect(() => {
    setState(readInitialToken(boardId));
    setAccessDenied(false);
  }, [boardId]);

  /**
   * Arriving with no token at all — someone pasted a board URL rather than
   * clicking through from the dashboard — is recoverable: ask the web app for
   * one using the session cookie the browser already has.
   *
   * Without this a plain board link is inert. The editor would sit at "not
   * connected" forever even for the board's own owner, because a token only
   * ever arrived via the redirect fragment.
   *
   * Runs at most once per board: a rejection leaves `token` null, and this
   * effect only re-fires when that value changes.
   */
  useEffect(() => {
    if (state.token !== null) return;
    void refresh();
  }, [state.token, refresh]);

  // Schedule automatic refresh before expiry
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!state.expiresAt) return undefined;
    const delay = Math.max(state.expiresAt - Date.now() - REFRESH_MARGIN_MS, 0);
    timerRef.current = setTimeout(() => {
      void refresh();
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.expiresAt, refresh]);

  return { authToken: state.token, refresh, refreshNow, accessDenied };
}
