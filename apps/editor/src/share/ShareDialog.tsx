import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useAvatarUrls } from '../profile/useAvatar';
import { surfaceThemeVars, type SurfaceTheme } from '../ui/surface-palette';
import { BACKDROP, WINDOW } from '../settings/settings-ui';
import {
  createShareLink,
  listMembers,
  listShareLinks,
  addMemberBack,
  removeMember,
  revokeShareLink,
  setMemberRole,
  type BoardMember,
  type ShareLinkSummary,
  type ShareRole,
} from './share-api';
import { QRCode } from './QRCode';
import {
  ShareSessionPanel,
  type LiveSession,
  type RemovedPerson,
  type SharePerson,
} from './ShareSession';

/**
 * The design is set in Inter. Nothing in the app loads it, so this names it
 * first and falls back to the platform's own UI face rather than shipping a
 * webfont for the dialogs.
 */
const FONT_STACK = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

/** How long someone who joined while the window was open is marked as new. */
const JOINED_FOR_MS = 8_000;

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  /** Shown as the window's title; falls back to the id, as the menu does. */
  boardName?: string;
  /** Who is looking, so the list can say which row is them. */
  userId?: string | null;
  /**
   * Who is on the board right now, as a value that changes only when the set
   * of people does.
   *
   * The card's whole problem is that membership is fetched and joining is not
   * an event it can see. Presence is that event, already arriving over the
   * board's own socket — someone redeeming a share link has a membership row
   * before their editor finishes loading, so by the time their cursor shows
   * up the list this refetches is guaranteed to include them.
   */
  presenceKey: string;
  /**
   * The editor's bearer token, for the members' photos.
   *
   * The rest of this dialog talks to the web app with a cookie; photos live in
   * storage the gateway guards, and that is reached with the token instead.
   */
  authToken: string | null;
  /** The theme on screen — the window carries its own palette for each. */
  theme: SurfaceTheme;
}

/**
 * Backstop poll while the window is open.
 *
 * Presence covers everyone who actually connects, which is everyone who joins
 * by link. This is for the rest — a row that appears without a socket behind
 * it — and it runs only while somebody is looking at the window.
 */
const REFRESH_INTERVAL_MS = 15_000;

/**
 * Sharing the board: its session, and who is on it.
 *
 * Everything visible belongs to ShareSessionPanel — this owns the board's
 * sharing state and the window around it. A session is a link people join by,
 * live until it is stopped; "can view" / "can edit" is the role it carries.
 *
 * The window rises in over the blurred board and sinks away, as the Settings
 * dialogs do. It is portalled to <body>, carrying its palette with it, because
 * it is mounted inside the editor, where a transformed ancestor would pin a
 * full-window overlay inside it.
 */
export function ShareDialog({
  open,
  onClose,
  boardId,
  boardName,
  userId = null,
  presenceKey,
  authToken,
  theme,
}: ShareDialogProps) {
  const [links, setLinks] = useState<ShareLinkSummary[]>([]);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [role, setRole] = useState<ShareRole>('editor');
  const [allowGuests, setAllowGuests] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  // The backdrop, which a role menu portals into so it inherits the palette.
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuOpen = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  // Who was on the board the last time the list was read, and when anyone new
  // turned up while the window was open.
  const seen = useRef<Set<string> | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const [arrivals, setArrivals] = useState<Record<string, number>>({});

  // At most one link is ever live — see createShareLink.
  const session = links[0] ?? null;

  /**
   * `quiet` is for the refreshes nobody asked for — the presence-driven one
   * and the poll. A failure there is not something the reader did and not
   * something they can act on, and putting it in the error line would mean a
   * blip on a background request looks like their last click failed.
   */
  /**
   * Bumped whenever this window starts or stops a session and shows the result
   * straight away. A read that left before that answers with the world as it
   * was, and would flip the window back until the next one — so it is dropped.
   */
  const changes = useRef(0);

  const refresh = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      const asOf = changes.current;
      try {
        const [nextLinks, nextMembers] = await Promise.all([
          listShareLinks(boardId),
          listMembers(boardId),
        ]);
        if (asOf !== changes.current) return;
        setLinks(nextLinks);
        setMembers(nextMembers);

        const ids = new Set(nextMembers.map((member) => member.userId));
        const before = seen.current;
        if (before && openRef.current) {
          const joined = [...ids].filter((id) => !before.has(id));
          if (joined.length > 0) {
            const at = Date.now();
            setArrivals((current) => ({
              ...current,
              ...Object.fromEntries(joined.map((id) => [id, at])),
            }));
          }
        }
        seen.current = ids;

        // The plaintext token exists only in the response that created it, so a
        // reload cannot reconstruct the URL from the server. Remember it for this
        // browser; if it does not match the live session, the session is still
        // shown but without a copyable link.
        const stored = readStoredLink(boardId);
        setUrl(stored && nextLinks[0] && stored.linkId === nextLinks[0].id ? stored.url : null);
      } catch (err) {
        if (quiet) return;
        setError(err instanceof Error ? err.message : 'Could not load sharing details.');
      }
    },
    [boardId],
  );

  /**
   * Read the board's sharing state once the board loads, not once the window
   * opens.
   *
   * Who has access is the first thing a person looks at here, and fetching it
   * on open means watching it arrive: the window spends a second saying "0
   * members" — which is not merely blank, it is wrong, and about a board they
   * have just been looking at other people draw on.
   *
   * Two small queries, once per board. Quiet, because nobody asked for it and
   * there is nowhere to report a failure to; opening the window tries again,
   * and that one speaks up.
   */
  useEffect(() => {
    void refresh({ quiet: true });
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    // Whatever the prefetch found is already on screen, so this is a silent
    // correction rather than a load: nothing is cleared while it runs.
    void refresh();
  }, [open, refresh]);

  /**
   * Re-read when the people on the board change.
   *
   * This is what stops a newly joined collaborator sitting invisible until the
   * window is closed and reopened. The key is tracked in a ref so this fires on
   * an actual change rather than also duplicating the fetch above on open.
   */
  const lastPresenceKey = useRef(presenceKey);
  useEffect(() => {
    const changed = lastPresenceKey.current !== presenceKey;
    lastPresenceKey.current = presenceKey;
    if (!open || !changed) return;
    void refresh({ quiet: true });
  }, [open, presenceKey, refresh]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void refresh({ quiet: true }), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  // "Joined" is for a moment, not a label to keep.
  useEffect(() => {
    const times = Object.values(arrivals);
    if (times.length === 0) return;
    const next = Math.min(...times) + JOINED_FOR_MS - Date.now();
    const timer = window.setTimeout(
      () => {
        const cutoff = Date.now() - JOINED_FOR_MS;
        setArrivals((current) =>
          Object.fromEntries(Object.entries(current).filter(([, at]) => at > cutoff)),
        );
      },
      Math.max(next, 0) + 50,
    );
    return () => window.clearTimeout(timer);
  }, [arrivals]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setArrivals({});
    }
  }, [open]);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  // Escape closes from anywhere inside — after a role menu that is open, which
  // it closes first. Captured and stopped, so it never also reaches the canvas.
  // Focus comes into the window as it opens, and goes back to what opened it —
  // the Share button — when it closes.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuOpen.current = false;
    panelRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || menuOpen.current) return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const target = opener.current;
      opener.current = null;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await createShareLink(boardId, { role, allowGuests });
      storeLink(boardId, link.id, link.url);
      // Live the moment the server says so. Its answer is the session, so
      // reading it back first would only add a second round trip before the
      // window changes; the read happens behind, for whatever else moved.
      changes.current += 1;
      setLinks([
        {
          id: link.id,
          role: link.role,
          allowGuests: link.allowGuests,
          expiresAt: link.expiresAt,
          maxUses: link.maxUses,
          useCount: 0,
          lastUsedAt: null,
          createdAt: new Date().toISOString(),
          createdByName: '',
        },
      ]);
      setUrl(link.url);
      void refresh({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session.');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await revokeShareLink(boardId, session.id);
      clearStoredLink(boardId);
      // Stopped the moment the server says so; at most one link is ever live.
      changes.current += 1;
      setLinks([]);
      setUrl(null);
      void refresh({ quiet: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not stop the session.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the link and copy it manually.');
    }
  };

  const handleRoleChange = async (memberId: string, next: ShareRole) => {
    setError(null);
    // Optimistic: the request is a single indexed update, and the list snapping
    // back on failure reads better than a menu that freezes.
    setMembers((current) => current.map((m) => (m.userId === memberId ? { ...m, role: next } : m)));
    try {
      await setMemberRole(boardId, memberId, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change that role.');
      await refresh();
    }
  };

  const handleRemove = async (memberId: string) => {
    setError(null);
    try {
      await removeMember(boardId, memberId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that person.');
    }
  };

  const handleAddBack = async (memberId: string) => {
    setError(null);
    const member = members.find((m) => m.userId === memberId);
    if (!member) return;
    // Optimistic, like a role change: one update, and a failure re-reads.
    setMembers((current) =>
      current.map((m) => (m.userId === memberId ? { ...m, status: 'active' } : m)),
    );
    try {
      await addMemberBack(boardId, memberId, member.role === 'viewer' ? 'viewer' : 'editor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that person back.');
      await refresh();
    }
  };

  const active = useMemo(() => members.filter((member) => member.status === 'active'), [members]);
  const removed = useMemo<RemovedPerson[]>(
    () =>
      members
        .filter((member) => member.status === 'revoked' && !member.isOwner)
        .map((member) => ({
          id: member.userId,
          name: member.name,
          email: member.email,
          isGuest: member.isGuest,
          role: member.role === 'viewer' ? 'viewer' : 'editor',
        })),
    [members],
  );

  // Photos are read through the board, which is what authorizes seeing one —
  // membership comes from the web app, which knows nothing about storage.
  // Only while the window is open: a board with fifty members would otherwise
  // cost fifty requests on every load, for a list most people never open.
  // Anyone currently on the board is already resolved for the peer stack, and
  // that cache is shared — so the faces that matter are there immediately.
  const photos = useAvatarUrls({
    boardId,
    token: authToken,
    subjects: useMemo(
      () => (open ? active.map((member) => ({ id: member.userId })) : []),
      [open, active],
    ),
  });

  const people = useMemo<SharePerson[]>(
    () =>
      active.map((member) => ({
        id: member.userId,
        name: member.name,
        email: member.email,
        isGuest: member.isGuest,
        isOwner: member.isOwner,
        role: member.role,
        photo: photos[member.userId] ?? null,
        you: member.userId === userId,
        justJoined: arrivals[member.userId] !== undefined,
      })),
    [active, photos, userId, arrivals],
  );

  // A live session's terms were fixed when it started, so it shows what it
  // granted rather than what is chosen for the next one.
  const live = useMemo<LiveSession | null>(
    () =>
      session && {
        role: session.role,
        allowGuests: session.allowGuests,
        startedAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
    [session],
  );

  const name = boardName ?? boardId;
  const surface = useMemo(() => ({ ...surfaceThemeVars(theme), fontFamily: FONT_STACK }), [theme]);

  const shell = (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <motion.div
            key="share"
            ref={setOverlay}
            variants={BACKDROP}
            initial="hidden"
            animate="shown"
            exit="gone"
            style={surface}
            // The menus inside wear the editor's menu look, which takes its
            // dark form from this attribute on an ancestor — and the window is
            // portalled out from under the editor's own.
            data-theme={theme}
            // The text colour is set here as well as on the pieces that need
            // it, so nothing inside, menus included, inherits the page's.
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--surface-backdrop)] p-6 text-[var(--surface-fg)] backdrop-blur-[3px]"
            // Bound to mousedown rather than click, so a drag that starts
            // inside the link field and ends outside it does not count.
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
          >
            <motion.div
              ref={panelRef}
              variants={WINDOW}
              role="dialog"
              aria-modal="true"
              aria-label={`Share ${name}`}
              tabIndex={-1}
              data-testid="share-dialog"
              data-theme-variant={theme}
              className="flex max-h-full w-[520px] max-w-full flex-col overflow-hidden rounded-[16px] border border-[var(--surface-border)] bg-[var(--surface-panel)] shadow-[var(--surface-shadow)] outline-none"
            >
              <ShareSessionPanel
                boardName={name}
                people={people}
                session={live}
                url={url}
                role={role}
                allowGuests={allowGuests}
                onRoleChange={setRole}
                onAllowGuestsChange={setAllowGuests}
                busy={busy}
                copied={copied}
                error={error}
                onStart={() => void handleStart()}
                onStop={() => void handleStop()}
                onCopy={() => void handleCopy()}
                onClose={onClose}
                onMemberRole={(id, next) => void handleRoleChange(id, next)}
                onRemoveMember={(id) => void handleRemove(id)}
                removed={removed}
                onAddBack={(id) => void handleAddBack(id)}
                menuContainer={overlay}
                onMenuOpenChange={(isOpen) => {
                  menuOpen.current = isOpen;
                }}
                qr={url ? <QRCode value={url} size={96} /> : undefined}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );

  return typeof document === 'undefined' ? shell : createPortal(shell, document.body);
}

// --- link memory -----------------------------------------------------------
// The server stores only a hash of the token, so the URL cannot be re-derived.
// Held per board in sessionStorage: it survives a reload, and is gone when the
// tab closes, which is the right lifetime for a credential.

interface StoredLink {
  linkId: string;
  url: string;
}

function storageKey(boardId: string): string {
  return `cf.share.${boardId}`;
}

function readStoredLink(boardId: string): StoredLink | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(boardId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLink;
    return typeof parsed.linkId === 'string' && typeof parsed.url === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function storeLink(boardId: string, linkId: string, url: string): void {
  try {
    window.sessionStorage.setItem(storageKey(boardId), JSON.stringify({ linkId, url }));
  } catch {
    // Private browsing can refuse storage; the link is on screen regardless.
  }
}

function clearStoredLink(boardId: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(boardId));
  } catch {
    // Nothing to do.
  }
}
