import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { env } from '@/lib/env';
import {
  createBoard as requestCreateBoard,
  createWorkspace as requestCreateWorkspace,
  deleteBoard as requestDeleteBoard,
  deleteWorkspace as requestDeleteWorkspace,
  listWorkspaceBoards,
  listWorkspaces,
  renameWorkspace as requestRenameWorkspace,
  updateBoard as requestUpdateBoard,
  WorkspaceApiError,
  type BoardColor,
  type BoardDetailsPatch,
  type BoardSummary,
  type WorkspaceSummary,
} from './workspace-api';

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
   * The workspace whose boards the sidebar lists, when it is not the open
   * board's own. Null lists the open board's workspace.
   */
  browsedWorkspaceId: string | null;
  /** Lists another workspace's boards, fetching them the first time. Null goes home. */
  browseWorkspace: (workspaceId: string | null) => void;
  /** Fetches a workspace's boards without listing them, for the manage dialog. */
  loadWorkspaceBoards: (workspaceId: string) => void;
  boardsFor: (workspaceId: string) => WorkspaceBoards | undefined;
  openBoard: (boardId: string) => void;
  createBoard: (workspaceId: string) => void;
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
} = { workspaces: null, available: true, boards: {} };

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
  return err instanceof Error ? err.message : 'Something went wrong.';
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
    let cancelled = false;

    listWorkspaces()
      .then((list) => {
        remembered.workspaces = list;
        if (!cancelled) setWorkspaces(list);
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
  }, []);

  // The board's own workspace: the sidebar lists it, and the board's title
  // and colour come from it.
  useEffect(() => {
    if (workspaceId) loadBoards(workspaceId);
  }, [workspaceId, loadBoards]);

  // The open board's own row, which is where the header's title and dot come
  // from. Its id stands in for the title until the list arrives.
  const current = useMemo(() => {
    const entry = workspaceId ? boards[workspaceId] : undefined;
    const board = entry?.status === 'ready' ? entry.boards.find((it) => it.id === boardId) : null;
    return {
      title: board?.title ?? boardId,
      color: board?.color ?? ('gray' as BoardColor),
      known: Boolean(board),
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
        (!workspaceId || entry?.status === 'ready' || entry?.status === 'error'),
    };
  }, [boards, workspaceId, boardId, workspaces, available]);

  const browseWorkspace = useCallback(
    (id: string | null) => {
      // The open board's own workspace is home, so browsing to it is going home.
      setBrowsedWorkspaceId(id === workspaceId ? null : id);
      if (id) loadBoards(id);
    },
    [loadBoards, workspaceId],
  );

  const boardsFor = useCallback((id: string) => boards[id], [boards]);

  const openBoard = useCallback(
    (id: string) => {
      if (id === boardId) return;
      navigate(`/boards/${id}`);
    },
    [boardId, navigate],
  );

  const createBoard = useCallback(
    (id: string) => {
      setBusy(true);
      setError(null);
      requestCreateBoard(id)
        .then((board) => {
          // Listed before it opens, newest first as the server orders them,
          // so the new board's sidebar already knows it and its workspace.
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
              workspace.id === id
                ? { ...workspace, boardCount: workspace.boardCount + 1 }
                : workspace,
            ) ?? null;
          navigate(`/boards/${board.id}`);
        })
        .catch((err: unknown) => setError(messageOf(err)))
        .finally(() => setBusy(false));
    },
    [navigate],
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
            boards: entry.boards.map((board) => (board.id === updated.id ? updated : board)),
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
        const next = entry.boards.find((board) => board.id !== skip.boardId);
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
        setWorkspaces((prev) =>
          prev
            ? prev.map((workspace) =>
                workspace.id === removed.workspaceId
                  ? { ...workspace, boardCount: Math.max(0, workspace.boardCount - 1) }
                  : workspace,
              )
            : prev,
        );

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
    [boardId, openNextBoard],
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

  return useMemo<BoardSwitcherState>(
    () => ({
      boardId,
      title: current.title,
      color: current.color,
      workspaceId,
      workspaces,
      available,
      browsedWorkspaceId,
      browseWorkspace,
      loadWorkspaceBoards: loadBoards,
      boardsFor,
      openBoard,
      createBoard,
      createWorkspace,
      renameBoard,
      renameTarget,
      canRename: current.known || !current.settled,
      beginRename,
      endRename,
      deleteBoard,
      renameWorkspace,
      deleteWorkspace,
      manageTarget,
      beginManage,
      endManage,
      busy,
      error,
      dismissError,
    }),
    [
      boardId,
      current,
      workspaceId,
      workspaces,
      available,
      browsedWorkspaceId,
      browseWorkspace,
      loadBoards,
      boardsFor,
      openBoard,
      createBoard,
      createWorkspace,
      renameBoard,
      renameTarget,
      beginRename,
      endRename,
      deleteBoard,
      renameWorkspace,
      deleteWorkspace,
      manageTarget,
      beginManage,
      endManage,
      busy,
      error,
      dismissError,
    ],
  );
}
