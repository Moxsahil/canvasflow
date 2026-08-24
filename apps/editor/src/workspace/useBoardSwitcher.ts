import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createBoard as requestCreateBoard,
  createWorkspace as requestCreateWorkspace,
  listWorkspaceBoards,
  listWorkspaces,
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
  /** The workspace whose boards are showing beside the list. */
  expandedWorkspaceId: string | null;
  expandWorkspace: (workspaceId: string | null) => void;
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

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}

/**
 * The board switcher's data: which workspaces the user belongs to, which
 * boards are in each, and how to open, add or rename one.
 *
 * Two requests on mount — the workspace list, and the boards of the board's
 * own workspace, which is also where its title comes from. Every other
 * workspace is fetched the first time it is expanded, so a person with a dozen
 * of them pays for the one they look at.
 *
 * Opening a board is a route change rather than a reload: the editor is keyed
 * by board id, so it remounts clean, and its token hook mints a token for the
 * new board from the user's session.
 */
export function useBoardSwitcher({ boardId, workspaceId }: UseBoardSwitcherOptions) {
  const navigate = useNavigate();

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [boards, setBoards] = useState<Record<string, WorkspaceBoards>>({});
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held here rather than in the switcher, because the sidebar's own "Rename
  // board" row opens the same dialog and never goes through the switcher. The
  // id alone: the values behind it are looked up live, below.
  const [renameBoardId, setRenameBoardId] = useState<string | null>(null);

  // Which workspaces have been asked for already. A ref rather than derived
  // from `boards`, so a hover that re-fires while a request is in flight
  // doesn't start a second one.
  const requestedRef = useRef<Set<string>>(new Set());

  const loadBoards = useCallback((id: string) => {
    if (requestedRef.current.has(id)) return;
    requestedRef.current.add(id);
    setBoards((prev) => ({ ...prev, [id]: { status: 'loading' } }));

    listWorkspaceBoards(id)
      .then((list) => {
        setBoards((prev) => ({ ...prev, [id]: { status: 'ready', boards: list } }));
      })
      .catch((err: unknown) => {
        // Dropped from the requested set so expanding again retries.
        requestedRef.current.delete(id);
        setBoards((prev) => ({ ...prev, [id]: { status: 'error', error: messageOf(err) } }));
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    listWorkspaces()
      .then((list) => {
        if (!cancelled) setWorkspaces(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 401 is the ordinary answer for a guest, not a fault worth reporting.
        if (err instanceof WorkspaceApiError && err.status === 401) {
          setAvailable(false);
          return;
        }
        setError(messageOf(err));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The board's own workspace, for the title in the rail header and so the
  // list beside it is already there the first time it opens.
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

  const expandWorkspace = useCallback(
    (id: string | null) => {
      setExpandedWorkspaceId(id);
      if (id) loadBoards(id);
    },
    [loadBoards],
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
        .then((board) => navigate(`/boards/${board.id}`))
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
        setExpandedWorkspaceId(workspace.id);
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
   * list holds that board — the switcher can target one in any workspace it
   * has expanded, not only the board's own.
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

  // Defaults to the board on screen, which is what the sidebar's row means by
  // "Rename board"; the switcher names one when renaming another.
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

  const dismissError = useCallback(() => setError(null), []);

  return useMemo<BoardSwitcherState>(
    () => ({
      boardId,
      title: current.title,
      color: current.color,
      workspaceId,
      workspaces,
      available,
      expandedWorkspaceId,
      expandWorkspace,
      boardsFor,
      openBoard,
      createBoard,
      createWorkspace,
      renameBoard,
      renameTarget,
      canRename: current.known || !current.settled,
      beginRename,
      endRename,
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
      expandedWorkspaceId,
      expandWorkspace,
      boardsFor,
      openBoard,
      createBoard,
      createWorkspace,
      renameBoard,
      renameTarget,
      beginRename,
      endRename,
      busy,
      error,
      dismissError,
    ],
  );
}
