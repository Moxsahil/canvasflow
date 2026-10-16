import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { env } from '@/lib/env';
import {
  archiveBoard as requestArchiveBoard,
  createBoard as requestCreateBoard,
  createWorkspace as requestCreateWorkspace,
  deleteBoard as requestDeleteBoard,
  deleteWorkspace as requestDeleteWorkspace,
  listWorkspaceBoards,
  listWorkspaces,
  pinBoard as requestPinBoard,
  renameWorkspace as requestRenameWorkspace,
  unarchiveBoard as requestUnarchiveBoard,
  unpinBoard as requestUnpinBoard,
  updateBoard as requestUpdateBoard,
  WorkspaceApiError,
  type BoardColor,
  type BoardDetailsPatch,
  type BoardSummary,
  type WorkspaceSummary,
} from './workspace-api';
import { track } from '../analytics/analytics';
import { t } from '../i18n';
import { mergeBoards } from './merge-boards';
import { listSharedBoards, type SharedBoard } from './people-api';
import { useWorkspaceChanges } from './workspace-events';

/** One workspace's board list, as far as it has got. */
export type WorkspaceBoards =
  | { status: 'loading' }
  | { status: 'ready'; boards: BoardSummary[] }
  | { status: 'error'; error: string };

/**
 * The board the rename dialog is open on, and the values it starts from.
 *
 * Looked up from the board lists as they stand rather than captured when the
 * dialog was opened, so opening it before those have arrived is fine: the
 * fields are null for that moment and fill themselves in. That is what lets
 * the sidebar's row stay usable during the load instead of flickering
 * disabled.
 */
export interface RenameBoardTarget {
  boardId: string;
  /** Null until the board's row is known. */
  title: string | null;
  color: BoardColor | null;
}

/**
 * What the manage dialog is open on.
 *
 * Two panes rather than two dialogs: the workspace list and one workspace's
 * board list are the same kind of surface, reached from the two panels of the
 * switcher, and a person tidying up moves between them.
 */
export type ManageTarget = { kind: 'workspaces' } | { kind: 'boards'; workspaceId: string };

/**
 * The sidebar's "Shared with you", listed in a workspace's place: the boards
 * one was let onto by link, from workspaces one is not in. Not a workspace id,
 * and never sent anywhere as one.
 */
export const SHARED_WITH_YOU = 'shared-with-you';

export interface BoardSwitcherState {
  boardId: string;
  /** The board's title once it is known, and its id until then. */
  title: string;
  /** The board's tag colour; gray until the list that carries it has loaded. */
  color: BoardColor;
  /** The board's own workspace, from the editor token. Null for a guest. */
  workspaceId: string | null;
  /** Null until the list has loaded. */
  workspaces: WorkspaceSummary[] | null;
  /**
   * False when the web app won't answer for this caller — a guest admitted by
   * share link has one board and no workspace. The switcher then renders as a
   * plain label rather than offering a menu that would be empty.
   */
  available: boolean;
  /**
   * The board kept in this browser, which belongs to no workspace. Shown as a
   * plain label, like a guest's board, saying where it is kept.
   */
  local: boolean;
  /**
   * The workspace whose boards the sidebar lists, when it is not the open
   * board's own. Null lists the open board's workspace.
   */
  browsedWorkspaceId: string | null;
  /**
   * What the sidebar lists now: a workspace's id, or `SHARED_WITH_YOU`. The
   * open board's own workspace unless another is being browsed — or, when the
   * open board was shared from a workspace one is not in, the shared boards.
   */
  listedId: string | null;
  /**
   * The open board belongs to a workspace one is not in: one was let onto it
   * by link. The sidebar then lists what has been shared rather than asking
   * for a workspace it may not see.
   */
  openBoardIsShared: boolean;
  /** Boards shared from other workspaces, newest first. Null until read. */
  sharedBoards: SharedBoard[] | null;
  /** Lists another workspace's boards, fetching them the first time. Null goes home. */
  browseWorkspace: (workspaceId: string | null) => void;
  /** Fetches a workspace's boards without listing them, for the manage dialog. */
  loadWorkspaceBoards: (workspaceId: string) => void;
  boardsFor: (workspaceId: string) => WorkspaceBoards | undefined;
  openBoard: (boardId: string) => void;
  createBoard: (workspaceId: string) => void;
  /**
   * Make a named board and list it, leaving it to the caller to open. Rejects
   * when the server refuses, rather than reporting it in the menu.
   */
  addBoard: (workspaceId: string, title?: string) => Promise<BoardSummary>;
  createWorkspace: (name: string) => void;
  /**
   * Rename a board, re-tag it, or both. Resolves once the server has answered:
   * the dialog stays open on failure so the typed name isn't lost.
   */
  renameBoard: (boardId: string, patch: BoardDetailsPatch) => Promise<void>;
  /** The board the rename dialog is open on, or null when it is closed. */
  renameTarget: RenameBoardTarget | null;
  /**
   * Whether the open board can be renamed from the sidebar.
   *
   * True while the board list is still loading, so the row doesn't spend the
   * first second of every page load looking like an unbuilt feature. It goes
   * false only once the list has settled without the board in it — a guest
   * admitted by share link, who has no board list at all.
   *
   * Says nothing about permission: a viewer's refusal comes from the server,
   * which is the only thing that actually knows their role.
   */
  canRename: boolean;
  /** Opens the rename dialog. With no argument, on the board that is open. */
  beginRename: (boardId?: string) => void;
  endRename: () => void;
  /**
   * Rename a board and delete it, from the manage dialog.
   *
   * Both resolve once the server has answered and reject when it refuses, so
   * the dialog can keep what was typed and say why. Deleting the board that is
   * open navigates away from it — see `openNextBoard`.
   */
  deleteBoard: (boardId: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  /** Deletes the workspace and every board in it. Owner only; the server decides. */
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  /**
   * Whether the open board is archived, as its list says; null while no list
   * that carries it has said.
   */
  archived: boolean | null;
  /**
   * Whether you may archive this board, unarchive it, or delete it: you made
   * it, or you run its workspace. Decides what the sidebar offers; the server
   * still decides what happens.
   */
  canManageBoard: (board: BoardSummary) => boolean;
  /** Pin a board to the top of your own Pinned list. Nobody else's changes. */
  pinBoard: (boardId: string) => void;
  unpinBoard: (boardId: string) => void;
  /**
   * Your pins in one workspace, top first, after one of them was dragged to a
   * new place: only the moved one is written, between its new neighbours.
   */
  reorderPins: (orderedIds: readonly string[], movedId: string) => void;
  /** Out of everyone's lists and read-only for everyone, until unarchived. */
  archiveBoard: (boardId: string) => Promise<void>;
  unarchiveBoard: (boardId: string) => Promise<void>;
  /** What the manage dialog is showing, or null when it is closed. */
  manageTarget: ManageTarget | null;
  beginManage: (target: ManageTarget) => void;
  endManage: () => void;
  /** A create is in flight; the menu disables its buttons rather than queueing. */
  busy: boolean;
  error: string | null;
  dismissError: () => void;
}

interface UseBoardSwitcherOptions {
  boardId: string;
  /** From the editor token's `workspaceId` claim; null before it decodes. */
  workspaceId: string | null;
  /**
   * The board kept in this browser. Nothing is asked of the web app for it:
   * it is in no workspace, whoever is or is not signed in.
   */
  local?: boolean;
  /** What to call it, since no list will ever name it. */
  localTitle?: string;
  /** Who is signed in, from the editor token: whose boards are their own. */
  userId?: string | null;
  /** Says something went wrong, or right, where a menu that has closed cannot. */
  onNotice?: (message: string) => void;
}

/** Pins sort by their order key, compared as written, ties by id. */
export function comparePins(a: BoardSummary, b: BoardSummary): number {
  const left = a.pin ?? '';
  const right = b.pin ?? '';
  if (left !== right) return left < right ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A workspace's list without its archived boards, which no list but the sidebar's shows. */
export function liveBoards(entry: WorkspaceBoards | undefined): WorkspaceBoards | undefined {
  if (entry?.status !== 'ready' || !entry.boards.some((board) => board.archivedAt)) return entry;
  return { status: 'ready', boards: entry.boards.filter((board) => !board.archivedAt) };
}

/** The boards you have pinned in a list, top first, leaving archived ones out. */
export function pinnedOf(list: readonly BoardSummary[]): BoardSummary[] {
  return list.filter((board) => board.pin && !board.archivedAt).sort(comparePins);
}

/**
 * What the sidebar last knew, kept for as long as the tab is open.
 *
 * Opening another board remounts the editor, and this hook with it, while the
 * new board's token is still being minted. Starting from what was already on
 * screen — and re-reading it quietly behind — is what keeps the sidebar still
 * while only the board changes. Only settled lists are kept: a loading or
 * failed one says nothing worth showing again.
 */
const remembered: {
  workspaces: WorkspaceSummary[] | null;
  available: boolean;
  boards: Record<string, WorkspaceBoards>;
  shared: SharedBoard[] | null;
} = { workspaces: null, available: true, boards: {}, shared: null };

/** Read the shared boards, keeping them for the next board too. Never throws. */
function readShared(apply: (boards: SharedBoard[]) => void): void {
  listSharedBoards().then(
    (boards) => {
      remembered.shared = boards;
      apply(boards);
    },
    // A failed read leaves what was there; the next change or focus retries.
    () => {},
  );
}

function rememberBoards(id: string, list: BoardSummary[]) {
  remembered.boards = { ...remembered.boards, [id]: { status: 'ready', boards: list } };
}

/** The workspace whose list holds this board, as far as the lists go. */
function workspaceHolding(boardId: string, boards: Record<string, WorkspaceBoards>): string | null {
  for (const [id, entry] of Object.entries(boards)) {
    if (entry.status === 'ready' && entry.boards.some((board) => board.id === boardId)) return id;
  }
  return null;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : t('common.somethingWentWrong');
}

/**
 * The board switcher's data: which workspaces the user belongs to, which
 * boards are in each, and how to open, add or rename one.
 *
 * Two requests on mount — the workspace list, and the boards of the board's
 * own workspace, which is also where its title comes from. Every other
 * workspace is fetched the first time it is browsed, so a person with a dozen
 * of them pays for the one they look at.
 *
 * Opening a board is a route change rather than a reload: the editor is keyed
 * by board id, so it remounts clean, and its token hook mints a token for the
 * new board from the user's session.
 */
export function useBoardSwitcher({
  boardId,
  workspaceId: tokenWorkspaceId,
  local = false,
  localTitle = boardId,
  userId = null,
  onNotice,
}: UseBoardSwitcherOptions) {
  const navigate = useNavigate();

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(
    () => remembered.workspaces,
  );
  const [available, setAvailable] = useState(() => remembered.available);
  const [boards, setBoards] = useState<Record<string, WorkspaceBoards>>(() => ({
    ...remembered.boards,
  }));

  // The token names the board's workspace, but a board opened from the list
  // is still waiting on its token. The list it was opened from already says
  // which workspace holds it, so the sidebar need not wait.
  const workspaceId = useMemo(
    () => tokenWorkspaceId ?? workspaceHolding(boardId, boards),
    [tokenWorkspaceId, boardId, boards],
  );
  const [browsedWorkspaceId, setBrowsedWorkspaceId] = useState<string | null>(null);
  const [sharedBoards, setSharedBoards] = useState<SharedBoard[] | null>(() => remembered.shared);
  // Known once the list of one's own workspaces is: before that, a board's
  // workspace is assumed to be one's own, which it nearly always is.
  const openBoardIsShared =
    workspaces !== null &&
    workspaceId !== null &&
    !workspaces.some((workspace) => workspace.id === workspaceId);
  const home = openBoardIsShared ? SHARED_WITH_YOU : workspaceId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held here rather than in the switcher, because the sidebar's own "Rename
  // board" row opens the same dialog and never goes through the switcher. The
  // id alone: the values behind it are looked up live, below.
  const [renameBoardId, setRenameBoardId] = useState<string | null>(null);
  // Held here for the same reason the rename target is: the menu that opens it
  // closes as it appears, so the dialog cannot live inside the menu.
  const [manageTarget, setManageTarget] = useState<ManageTarget | null>(null);

  // Which workspaces have been asked for already. A ref rather than derived
  // from `boards`, so a second ask while a request is in flight doesn't start
  // another one.
  const requestedRef = useRef<Set<string>>(new Set());

  /** The count under a workspace's name follows its list. */
  const countBoards = useCallback((id: string, by: number) => {
    setWorkspaces((prev) =>
      prev
        ? prev.map((workspace) =>
            workspace.id === id
              ? { ...workspace, boardCount: Math.max(0, workspace.boardCount + by) }
              : workspace,
          )
        : prev,
    );
  }, []);

  // Whatever else changes the lists — a rename, a delete, a new workspace —
  // is kept for the next board too.
  useEffect(() => {
    remembered.workspaces = workspaces;
  }, [workspaces]);
  useEffect(() => {
    remembered.boards = Object.fromEntries(
      Object.entries(boards).filter(([, entry]) => entry.status === 'ready'),
    );
  }, [boards]);

  const loadBoards = useCallback((id: string) => {
    if (requestedRef.current.has(id)) return;
    requestedRef.current.add(id);
    // A list already on screen stays there while it is re-read.
    setBoards((prev) =>
      prev[id]?.status === 'ready' ? prev : { ...prev, [id]: { status: 'loading' } },
    );

    listWorkspaceBoards(id)
      .then((list) => {
        // Kept even if this editor has gone by now: the next one starts from it.
        rememberBoards(id, list);
        setBoards((prev) => ({ ...prev, [id]: { status: 'ready', boards: list } }));
      })
      .catch((err: unknown) => {
        // Dropped from the requested set so asking again retries.
        requestedRef.current.delete(id);
        // Nor does a failed re-read take away a list that was already there.
        setBoards((prev) =>
          prev[id]?.status === 'ready'
            ? prev
            : { ...prev, [id]: { status: 'error', error: messageOf(err) } },
        );
      });
  }, []);

  useEffect(() => {
    // Not stored in `remembered` either: an account's lists must still be read
    // when it goes on from here to one of its own boards.
    if (local) return;
    let cancelled = false;

    listWorkspaces()
      .then((list) => {
        remembered.workspaces = list;
        if (!cancelled) setWorkspaces(list);
        // Only for an account: a guest's 401 above never gets here.
        readShared((boards) => {
          if (!cancelled) setSharedBoards(boards);
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 401 is the ordinary answer for a guest, not a fault worth reporting.
        if (err instanceof WorkspaceApiError && err.status === 401) {
          remembered.available = false;
          setAvailable(false);
          return;
        }
        setError(messageOf(err));
      });

    return () => {
      cancelled = true;
    };
  }, [local]);

  // The board's own workspace: the sidebar lists it, and the board's title
  // and colour come from it. Not one somebody else let us onto: its list is
  // theirs, and the shared list already says what this board is.
  useEffect(() => {
    if (workspaceId && !openBoardIsShared) loadBoards(workspaceId);
  }, [workspaceId, openBoardIsShared, loadBoards]);

  // Which re-read of each list is the latest, so an answer that arrives after
  // a newer one does not put the older state back.
  const rereadRef = useRef<Map<string, number>>(new Map());

  /**
   * Re-read what changed, quietly: the lists on screen stay as they are until
   * the new ones arrive, and a failure leaves them alone — the next change, or
   * the window coming back into focus, tries again.
   *
   * Null re-reads everything this sidebar has listed.
   */
  const reread = useCallback(
    (changed: string | null) => {
      if (local) return;
      listWorkspaces()
        .then((list) => {
          remembered.workspaces = list;
          setWorkspaces(list);
          // Any change might be one to a board shared with us — let on, taken
          // off, renamed — and the list is one small read.
          readShared(setSharedBoards);
        })
        .catch(() => {});

      const ids = changed ? [changed] : [...requestedRef.current];
      for (const id of ids) {
        // Only lists already asked for: one nobody has opened is read when it is.
        if (!requestedRef.current.has(id)) continue;
        const turn = (rereadRef.current.get(id) ?? 0) + 1;
        rereadRef.current.set(id, turn);
        listWorkspaceBoards(id)
          .then((fresh) => {
            if (rereadRef.current.get(id) !== turn) return;
            setBoards((prev) => {
              const entry = prev[id];
              const shown = entry?.status === 'ready' ? entry.boards : [];
              return { ...prev, [id]: { status: 'ready', boards: mergeBoards(shown, fresh) } };
            });
          })
          .catch(() => {});
      }
    },
    [local],
  );

  // Somebody — here or elsewhere — renamed a workspace, changed a board in
  // it, or let someone onto one.
  useWorkspaceChanges(null, reread);

  // A workspace being browsed that has gone — deleted, or left — is no longer
  // anything to show; the sidebar goes home to the open board's own.
  useEffect(() => {
    if (
      browsedWorkspaceId &&
      browsedWorkspaceId !== SHARED_WITH_YOU &&
      workspaces &&
      !workspaces.some((it) => it.id === browsedWorkspaceId)
    ) {
      setBrowsedWorkspaceId(null);
    }
  }, [browsedWorkspaceId, workspaces]);

  // The open board's own row, which is where the header's title and dot come
  // from. Its id stands in for the title until the list arrives.
  const current = useMemo(() => {
    const entry = workspaceId && !openBoardIsShared ? boards[workspaceId] : undefined;
    const board =
      (entry?.status === 'ready' ? entry.boards.find((it) => it.id === boardId) : null) ??
      (openBoardIsShared ? sharedBoards?.find((it) => it.id === boardId) : null) ??
      null;
    return {
      title: board?.title ?? boardId,
      color: board?.color ?? ('gray' as BoardColor),
      known: Boolean(board),
      archived: board ? Boolean(board.archivedAt) : null,
      /**
       * Whether every answer that could still name this board has come back.
       *
       * Both requests have to be counted, not just the board list: on a fresh
       * load `workspaceId` is null because the token hasn't decoded yet, which
       * looks exactly like the guest who will never have one. Waiting on the
       * workspace list too is what tells those two apart — a guest is the case
       * where it comes back 401 and `available` goes false.
       */
      settled:
        (workspaces !== null || !available) &&
        (openBoardIsShared
          ? sharedBoards !== null
          : !workspaceId || entry?.status === 'ready' || entry?.status === 'error'),
    };
  }, [boards, workspaceId, boardId, workspaces, available, openBoardIsShared, sharedBoards]);

  const browseWorkspace = useCallback(
    (id: string | null) => {
      // The open board's own workspace is home, so browsing to it is going
      // home — or the shared list, for a board one was let onto.
      setBrowsedWorkspaceId(id === home ? null : id);
      if (id && id !== SHARED_WITH_YOU) loadBoards(id);
    },
    [loadBoards, home],
  );

  const boardsFor = useCallback((id: string) => boards[id], [boards]);

  const openBoard = useCallback(
    (id: string) => {
      if (id === boardId) return;
      navigate(`/boards/${id}`);
    },
    [boardId, navigate],
  );

  /**
   * Make a board in a workspace and list it, without opening it.
   *
   * Listed before it opens, newest first as the server orders them, so the new
   * board's sidebar already knows it and its workspace.
   */
  const addBoard = useCallback(async (id: string, title?: string): Promise<BoardSummary> => {
    const board = await requestCreateBoard(id, title);
    track('board_created');
    const entry = remembered.boards[id];
    rememberBoards(id, [board, ...(entry?.status === 'ready' ? entry.boards : [])]);
    setBoards((prev) => {
      const listed = prev[id];
      return {
        ...prev,
        [id]: {
          status: 'ready',
          boards: [board, ...(listed?.status === 'ready' ? listed.boards : [])],
        },
      };
    });
    remembered.workspaces =
      remembered.workspaces?.map((workspace) =>
        workspace.id === id ? { ...workspace, boardCount: workspace.boardCount + 1 } : workspace,
      ) ?? null;
    return board;
  }, []);

  const createBoard = useCallback(
    (id: string) => {
      setBusy(true);
      setError(null);
      addBoard(id)
        .then((board) => navigate(`/boards/${board.id}`))
        .catch((err: unknown) => setError(messageOf(err)))
        .finally(() => setBusy(false));
    },
    [addBoard, navigate],
  );

  const createWorkspace = useCallback((name: string) => {
    setBusy(true);
    setError(null);
    requestCreateWorkspace(name)
      .then((workspace) => {
        setWorkspaces((prev) => [...(prev ?? []), workspace]);
        // Nothing to fetch: it was created empty a moment ago.
        requestedRef.current.add(workspace.id);
        setBoards((prev) => ({ ...prev, [workspace.id]: { status: 'ready', boards: [] } }));
        // Shown straight away, so its empty list and New board are what you see.
        setBrowsedWorkspaceId(workspace.id);
      })
      .catch((err: unknown) => setError(messageOf(err)))
      .finally(() => setBusy(false));
  }, []);

  const renameBoard = useCallback(async (id: string, patch: BoardDetailsPatch) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await requestUpdateBoard(id, patch);
      // Patched in place rather than refetched: the list is ordered by
      // updatedAt, which the rename just moved, and a row that jumps to the
      // top of the panel under the pointer reads as the wrong board being
      // renamed. The next open of the workspace picks up the new order.
      setBoards((prev) => {
        const entry = prev[updated.workspaceId];
        if (entry?.status !== 'ready') return prev;
        return {
          ...prev,
          [updated.workspaceId]: {
            status: 'ready',
            // Merged, so your pin — which a change does not hand back — stays.
            boards: entry.boards.map((board) =>
              board.id === updated.id ? { ...board, ...updated } : board,
            ),
          },
        };
      });
    } catch (err: unknown) {
      const message = messageOf(err);
      setError(message);
      // Rethrown so the dialog knows to stay open with the name still in it.
      throw new Error(message, { cause: err });
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * The values behind the open dialog, resolved from whichever workspace's
   * list holds that board — the sidebar can rename one in any workspace it
   * has listed, not only the board's own.
   */
  const renameTarget = useMemo<RenameBoardTarget | null>(() => {
    if (!renameBoardId) return null;

    for (const entry of Object.values(boards)) {
      if (entry.status !== 'ready') continue;
      const board = entry.boards.find((it) => it.id === renameBoardId);
      if (board) return { boardId: board.id, title: board.title, color: board.color };
    }

    // Open, but the list carrying it hasn't landed yet. The dialog waits.
    return { boardId: renameBoardId, title: null, color: null };
  }, [renameBoardId, boards]);

  // Defaults to the board on screen, which is what the board card means by
  // "Rename board"; a row in the board list names one when renaming another.
  const beginRename = useCallback(
    (id?: string) => {
      setError(null);
      setRenameBoardId(id ?? boardId);
    },
    [boardId],
  );

  const endRename = useCallback(() => {
    setRenameBoardId(null);
    // The dialog showed the failure itself; clearing it here stops the same
    // message reappearing on the switcher's error line the next time it opens.
    setError(null);
  }, []);

  /**
   * Open some other board, after the one on screen stopped existing.
   *
   * The editor has to be showing a board — there is no empty state to fall
   * back to — so this walks the lists already loaded, preferring the workspace
   * the deleted board was in, and only then gives up and hands back to the web
   * app. `/open` picks the most recent board across the whole account and
   * creates a fresh one (with a workspace to hold it) when there are none
   * left, which is exactly the case where nothing here can help.
   *
   * A full navigation rather than a route change, because that round trip also
   * mints an editor token for whichever board it lands on.
   */
  const openNextBoard = useCallback(
    (skip: { boardId?: string; workspaceId?: string; preferWorkspaceId?: string | null }) => {
      const ids = Object.keys(boards);
      const ordered = skip.preferWorkspaceId
        ? [skip.preferWorkspaceId, ...ids.filter((id) => id !== skip.preferWorkspaceId)]
        : ids;

      for (const id of ordered) {
        if (id === skip.workspaceId) continue;
        const entry = boards[id];
        if (entry?.status !== 'ready') continue;
        // Never into an archived one: it is out of the list for a reason.
        const next = entry.boards.find((board) => board.id !== skip.boardId && !board.archivedAt);
        if (next) {
          navigate(`/boards/${next.id}`);
          return;
        }
      }

      window.location.href = `${env.VITE_WEB_URL}/open`;
    },
    [boards, navigate],
  );

  const deleteBoard = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const removed = await requestDeleteBoard(id);

        setBoards((prev) => {
          const entry = prev[removed.workspaceId];
          if (entry?.status !== 'ready') return prev;
          return {
            ...prev,
            [removed.workspaceId]: {
              status: 'ready',
              boards: entry.boards.filter((board) => board.id !== removed.id),
            },
          };
        });
        // The count sits under the workspace's name in the sidebar, so it has
        // to move with the list rather than wait for the next page load.
        // An archived board was not counted.
        if (!removed.archivedAt) countBoards(removed.workspaceId, -1);

        if (removed.id === boardId) {
          openNextBoard({ boardId: removed.id, preferWorkspaceId: removed.workspaceId });
        }
      } catch (err: unknown) {
        const message = messageOf(err);
        setError(message);
        // Rethrown so the dialog reports it instead of closing on a failure.
        throw new Error(message, { cause: err });
      } finally {
        setBusy(false);
      }
    },
    [boardId, openNextBoard, countBoards],
  );

  const renameWorkspace = useCallback(async (id: string, name: string) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await requestRenameWorkspace(id, name);
      setWorkspaces((prev) =>
        prev ? prev.map((workspace) => (workspace.id === updated.id ? updated : workspace)) : prev,
      );
    } catch (err: unknown) {
      const message = messageOf(err);
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteWorkspace = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        await requestDeleteWorkspace(id);

        setWorkspaces((prev) => prev?.filter((workspace) => workspace.id !== id) ?? prev);
        setBoards((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Dropped from the requested set too, so a workspace re-created with
        // the same id — an operator undoing this — would be fetched again
        // rather than served from a list that is no longer there.
        requestedRef.current.delete(id);
        setBrowsedWorkspaceId((current) => (current === id ? null : current));

        // The open board was in it, and went with it.
        if (workspaceId === id) openNextBoard({ workspaceId: id });
      } catch (err: unknown) {
        const message = messageOf(err);
        setError(message);
        throw new Error(message, { cause: err });
      } finally {
        setBusy(false);
      }
    },
    [workspaceId, openNextBoard],
  );

  const beginManage = useCallback((target: ManageTarget) => {
    setError(null);
    setManageTarget(target);
  }, []);

  const endManage = useCallback(() => {
    setManageTarget(null);
    setError(null);
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  /** Change one board wherever a list carries it. */
  const patchListed = useCallback((id: string, change: (board: BoardSummary) => BoardSummary) => {
    setBoards((prev) => {
      let next = prev;
      for (const [listId, entry] of Object.entries(prev)) {
        if (entry.status !== 'ready' || !entry.boards.some((board) => board.id === id)) continue;
        if (next === prev) next = { ...prev };
        next[listId] = {
          status: 'ready',
          boards: entry.boards.map((board) => (board.id === id ? change(board) : board)),
        };
      }
      return next;
    });
  }, []);

  /** The list that carries a board, as it stands now. */
  const listHolding = useCallback(
    (id: string): BoardSummary[] => {
      for (const entry of Object.values(boards)) {
        if (entry.status === 'ready' && entry.boards.some((board) => board.id === id)) {
          return entry.boards;
        }
      }
      return [];
    },
    [boards],
  );

  /**
   * A change the server refused: say so, and read the list again, which puts
   * back whatever was shown ahead of the answer.
   */
  const refused = useCallback(
    (err: unknown, workspace: string | null) => {
      onNotice?.(messageOf(err));
      reread(workspace);
    },
    [onNotice, reread],
  );

  const canManageBoard = useCallback(
    (board: BoardSummary) => {
      if (userId && board.ownerId === userId) return true;
      const role = workspaces?.find((workspace) => workspace.id === board.workspaceId)?.role;
      return role === 'owner' || role === 'admin';
    },
    [userId, workspaces],
  );

  /** Your pins are shown moved at once; the server is told behind. */
  const writePins = useCallback(
    (moves: { id: string; position: string }[], workspace: string | null) => {
      for (const move of moves) patchListed(move.id, (board) => ({ ...board, pin: move.position }));
      Promise.all(moves.map((move) => requestPinBoard(move.id, move.position))).catch((err) =>
        refused(err, workspace),
      );
    },
    [patchListed, refused],
  );

  const pinBoard = useCallback(
    (id: string) => {
      const list = listHolding(id);
      const top = pinnedOf(list)[0]?.pin ?? null;
      const workspace = list.find((board) => board.id === id)?.workspaceId ?? null;
      writePins([{ id, position: generateKeyBetween(null, top) }], workspace);
    },
    [listHolding, writePins],
  );

  const unpinBoard = useCallback(
    (id: string) => {
      const workspace = listHolding(id).find((board) => board.id === id)?.workspaceId ?? null;
      patchListed(id, (board) => ({ ...board, pin: null }));
      requestUnpinBoard(id).catch((err) => refused(err, workspace));
    },
    [listHolding, patchListed, refused],
  );

  const reorderPins = useCallback(
    (orderedIds: readonly string[], movedId: string) => {
      const list = listHolding(movedId);
      const byId = new Map(list.map((board) => [board.id, board]));
      const at = orderedIds.indexOf(movedId);
      if (at < 0) return;
      const before = at > 0 ? (byId.get(orderedIds[at - 1]!)?.pin ?? null) : null;
      const after = byId.get(orderedIds[at + 1] ?? '')?.pin ?? null;
      const workspace = byId.get(movedId)?.workspaceId ?? null;
      try {
        writePins([{ id: movedId, position: generateKeyBetween(before, after) }], workspace);
      } catch {
        // Two pins sharing a key — set at the same moment from two tabs —
        // leave no room between them. Every pin gets a fresh key instead,
        // in the order on screen.
        const keys = generateNKeysBetween(null, null, orderedIds.length);
        writePins(
          orderedIds.map((id, index) => ({ id, position: keys[index]! })),
          workspace,
        );
      }
    },
    [listHolding, writePins],
  );

  /**
   * Shown archived, or back, at once, and counted under the workspace's name
   * as the list is; put back as it was if the server refuses.
   */
  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      const workspace = listHolding(id).find((board) => board.id === id)?.workspaceId ?? null;
      patchListed(id, (board) => ({
        ...board,
        archivedAt: archived ? new Date().toISOString() : null,
      }));
      if (workspace) countBoards(workspace, archived ? -1 : 1);
      try {
        const updated = archived ? await requestArchiveBoard(id) : await requestUnarchiveBoard(id);
        patchListed(id, (board) => ({ ...board, ...updated }));
      } catch (err) {
        if (workspace) countBoards(workspace, archived ? 1 : -1);
        refused(err, workspace);
        throw err;
      }
    },
    [listHolding, patchListed, countBoards, refused],
  );
  const archiveBoard = useCallback((id: string) => setArchived(id, true), [setArchived]);
  const unarchiveBoard = useCallback((id: string) => setArchived(id, false), [setArchived]);

  return useMemo<BoardSwitcherState>(
    () => ({
      boardId,
      title: local ? localTitle : current.title,
      color: current.color,
      workspaceId,
      workspaces,
      available: available && !local,
      local,
      browsedWorkspaceId,
      browseWorkspace,
      loadWorkspaceBoards: loadBoards,
      boardsFor,
      openBoard,
      createBoard,
      addBoard,
      createWorkspace,
      renameBoard,
      renameTarget,
      // Not a board somebody else let us onto: renaming it is its owner's. Nor
      // an archived one, which is read-only until it is brought back.
      canRename:
        !local && !openBoardIsShared && !current.archived && (current.known || !current.settled),
      listedId: browsedWorkspaceId ?? home,
      openBoardIsShared,
      sharedBoards,
      beginRename,
      endRename,
      deleteBoard,
      renameWorkspace,
      deleteWorkspace,
      archived: local ? null : current.archived,
      canManageBoard,
      pinBoard,
      unpinBoard,
      reorderPins,
      archiveBoard,
      unarchiveBoard,
      manageTarget,
      beginManage,
      endManage,
      busy,
      error,
      dismissError,
    }),
    [
      boardId,
      local,
      localTitle,
      current,
      workspaceId,
      workspaces,
      available,
      browsedWorkspaceId,
      home,
      openBoardIsShared,
      sharedBoards,
      browseWorkspace,
      loadBoards,
      boardsFor,
      openBoard,
      createBoard,
      addBoard,
      createWorkspace,
      renameBoard,
      renameTarget,
      beginRename,
      endRename,
      deleteBoard,
      renameWorkspace,
      deleteWorkspace,
      canManageBoard,
      pinBoard,
      unpinBoard,
      reorderPins,
      archiveBoard,
      unarchiveBoard,
      manageTarget,
      beginManage,
      endManage,
      busy,
      error,
      dismissError,
    ],
  );
}
