import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DIAGRAM_DETAILED_COST,
  DIAGRAM_LIMIT_REACHED,
  DIAGRAM_NOT_ENOUGH_LEFT,
  DIAGRAM_PROMPT_MAX,
  DIAGRAM_PROMPT_MIN,
  type DiagramFailure,
  type DiagramUsage,
} from '@canvasflow/types';
import { track } from '../analytics';
import { fetchDiagramUsage, streamDiagram, type DiagramRefusal } from './diagram-client';
import {
  loadHistory,
  saveHistory,
  withChats,
  withEntry,
  type DiagramEntry,
} from './diagram-history';
import { fixingLines } from './diagram-progress';
import { bannerFor, closeBanner, closedBanner, isFresh, keepUsage, keptUsage } from './usage-cache';

/** The diagram being written, shown as a card that fills in. */
export interface DiagramRun {
  description: string;
  changeOf?: string;
  /** The chat it is being drawn in. */
  chatId: string;
  /** Drawn by the larger model, which plans before it writes. */
  detailed: boolean;
  /** A mind map rather than a diagram. */
  mindMap?: boolean;
  lines: string[];
  /** When it was asked for (ms since the epoch), for the time shown while it runs. */
  startedAt: number;
  /** Lines the gateway is fixing, once it has said it is; 0 until then. */
  fixing: number;
  status: 'running' | 'failed';
  /** Why it failed: the gateway's reason, or `cut` for a connection that dropped. */
  problem?: DiagramProblem;
}

export type DiagramProblem = DiagramFailure | 'cut';

/**
 * A file added with +. A text file's words are sent after the typed ones.
 * Pictures and PDFs are shown in the box but not read yet: their `text` is
 * empty and nothing of them is sent.
 */
export interface DiagramAttachment {
  id: string;
  kind: 'text' | 'image' | 'pdf';
  filename: string;
  size: number;
  text: string;
  /** A picture's object URL, for its thumbnail; let go once it is removed. */
  url?: string;
}

const letGo = (files: readonly DiagramAttachment[]) => {
  for (const file of files) if (file.url) URL.revokeObjectURL(file.url);
};

/** What is sent: the typed words, then each attached file's text. */
export function describedAs(draft: string, attachments: readonly DiagramAttachment[]): string {
  return [draft, ...attachments.map((file) => file.text)]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Something the panel says instead of drawing. */
export type DiagramNotice =
  | { kind: 'limit' }
  | { kind: 'sign-in' }
  | { kind: 'unavailable' }
  /** A detailed diagram needs more of the month's diagrams than are left. */
  | { kind: 'not-enough' };

/** A box of a diagram, or a topic of a mind map: what says something was drawn. */
export const isBox = (line: string) => line.includes('"t":"node"') || line.includes('"t":"topic"');

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function noticeFor(refusal: DiagramRefusal): DiagramNotice | null {
  if (refusal.code === DIAGRAM_LIMIT_REACHED) return { kind: 'limit' };
  if (refusal.code === 'sign-in-required') return { kind: 'sign-in' };
  if (refusal.code === 'diagrams-unavailable') return { kind: 'unavailable' };
  if (refusal.code === DIAGRAM_NOT_ENOUGH_LEFT) return { kind: 'not-enough' };
  return null;
}

/**
 * Everything the diagrams panel does: the board's list of diagrams, the one
 * being written, the month's count, and what to say when drawing is not
 * possible. The list is this browser's own (see diagram-history.ts).
 */
export function useDiagramPanel({
  boardId,
  userId,
  token,
  open,
  signedIn,
}: {
  boardId: string;
  /** Whose count is kept between visits. */
  userId: string | null;
  token: string | null;
  open: boolean;
  /** An account with a session: a guest's board token cannot spend diagrams. */
  signedIn: boolean;
}) {
  const [entries, setEntries] = useState<DiagramEntry[]>([]);
  /** The chat on show; null for a new one nothing has been asked in yet. */
  const [chat, setChat] = useState<string | null>(null);
  const [run, setRun] = useState<DiagramRun | null>(null);
  const [usage, setUsage] = useState<DiagramUsage | null>(
    () => keptUsage(userId, boardId)?.usage ?? null,
  );
  const [notice, setNotice] = useState<DiagramNotice | null>(null);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<DiagramAttachment[]>([]);
  const [changing, setChanging] = useState<string | null>(null);
  const [detailed, setDetailed] = useState(false);
  const [mindMap, setMindMap] = useState(false);
  /** The tool picked on top of a plain request, or none: one at a time. */
  const setTool = useCallback((id: 'detailed' | 'mindmap' | null) => {
    setDetailed(id === 'detailed');
    setMindMap(id === 'mindmap');
  }, []);
  const controller = useRef<AbortController | null>(null);

  // Another board is another list, read from storage, which answers later.
  // The chat on show is the one that moved last.
  useEffect(() => {
    let current = true;
    setEntries([]);
    setChat(null);
    setRun(null);
    setChanging(null);
    void loadHistory(boardId).then((loaded) => {
      if (!current) return;
      const list = withChats(loaded);
      setEntries(list);
      setChat(list.at(-1)?.chatId ?? null);
    });
    return () => {
      current = false;
    };
  }, [boardId]);

  /** A count from the gateway, or kept from one: shown, and the limit noticed. */
  const takeUsage = useCallback((answer: DiagramUsage) => {
    setUsage(answer);
    if (answer.used >= answer.limit) {
      setNotice({ kind: 'limit' });
    } else {
      setNotice((current) => (current?.kind === 'limit' ? null : current));
    }
  }, []);

  // The count kept from the last visit is on screen at once; another person
  // or board starts from theirs.
  useEffect(() => {
    const kept = keptUsage(userId, boardId);
    if (kept) takeUsage(kept.usage);
    else setUsage(null);
  }, [userId, boardId, takeUsage]);

  /**
   * The count from the gateway, unless the kept one is recent enough to stand.
   * It may have moved on another board or in another tab, so a kept one is
   * trusted for a few minutes, not for good.
   */
  const asking = useRef<AbortController | null>(null);
  const refreshUsage = useCallback(() => {
    if (!token || !signedIn || asking.current) return;
    if (isFresh(keptUsage(userId, boardId))) return;
    const abort = new AbortController();
    asking.current = abort;
    fetchDiagramUsage(token, boardId, abort.signal)
      .then((answer) => {
        if ('plan' in answer) {
          takeUsage(answer);
          keepUsage(userId, boardId, answer);
        } else {
          const said = noticeFor(answer);
          if (said) setNotice(said);
        }
      })
      .catch(() => {
        // The count is a courtesy; drawing still works without it.
      })
      .finally(() => {
        if (asking.current === abort) asking.current = null;
      });
  }, [token, signedIn, userId, boardId, takeUsage]);

  useEffect(() => {
    if (open) refreshUsage();
  }, [open, refreshUsage]);
  useEffect(
    () => () => {
      asking.current?.abort();
      asking.current = null;
    },
    [boardId],
  );

  useEffect(() => () => controller.current?.abort(), []);

  const running = run?.status === 'running';

  /** Changes the list and keeps it. */
  const update = useCallback(
    (change: (current: DiagramEntry[]) => DiagramEntry[]) => {
      setEntries((current) => {
        const next = change(current);
        void saveHistory(boardId, next);
        return next;
      });
    },
    [boardId],
  );
  const remember = useCallback(
    (entry: DiagramEntry) => update((current) => withEntry(current, entry)),
    [update],
  );

  /**
   * Draws a diagram: what is in the box, or with `request`, a request asked
   * before, again — which leaves whatever is in the box as it is.
   */
  const ask = useCallback(
    async (request?: { description: string; changeOf?: string; chatId?: string }) => {
      const fromBox = !request;
      const description = request ? request.description : describedAs(draft, attachments);
      if (running || !token || description.length < DIAGRAM_PROMPT_MIN) return;
      if (description.length > DIAGRAM_PROMPT_MAX) return;
      const previousId = request ? request.changeOf : changing;
      const previous = previousId ? entries.find((entry) => entry.id === previousId) : undefined;

      const abort = new AbortController();
      controller.current = abort;
      const changeOf = previous?.id;
      // A change stays in the chat of what it changes; a request asked again,
      // in its own; anything else, in the chat on show, or a new one.
      const chatId = previous?.chatId ?? request?.chatId ?? chat ?? newId();
      setChat(chatId);
      const startedAt = Date.now();
      let fixing = 0;
      // A change to a mind map is a mind map, whatever tool is picked now.
      const asMap = previous ? previous.kind === 'mindmap' : mindMap;
      const deep = detailed && !asMap;
      const cost = deep ? DIAGRAM_DETAILED_COST : 1;
      setRun({
        description,
        ...(changeOf ? { changeOf } : {}),
        chatId,
        detailed: deep,
        ...(asMap ? { mindMap: true } : {}),
        lines: [],
        startedAt,
        fixing: 0,
        status: 'running',
      });
      setNotice((current) => (current?.kind === 'limit' ? current : null));
      const lines: string[] = [];

      try {
        const outcome = await streamDiagram(
          token,
          {
            boardId,
            description,
            ...(previous ? { previous: previous.lines } : {}),
            ...(deep ? { detailed: true } : {}),
            ...(asMap ? { kind: 'mindmap' as const } : {}),
          },
          (line) => {
            // The gateway's word that it is fixing lines is about the work, not
            // part of the diagram, so it is shown rather than kept.
            const fixed = fixingLines(line);
            if (fixed !== null) {
              fixing = fixed;
              setRun((current) => (current ? { ...current, fixing } : current));
              return;
            }
            lines.push(line);
            setRun((current) => (current ? { ...current, lines: [...lines] } : current));
          },
          abort.signal,
        );

        if (outcome.kind === 'refused') {
          const said = noticeFor(outcome.refusal);
          if (said) {
            setNotice(said);
            setRun(null);
          } else {
            const problem: DiagramProblem = outcome.refusal.status === 429 ? 'busy' : 'unavailable';
            setRun((current) => current && { ...current, status: 'failed', problem });
          }
          return;
        }
        if (outcome.kind === 'cut') {
          setRun((current) => current && { ...current, status: 'failed', problem: 'cut' });
          return;
        }

        const { end } = outcome;
        setUsage(end.usage);
        keepUsage(userId, boardId, end.usage);
        if (end.usage.used >= end.usage.limit) setNotice({ kind: 'limit' });
        const boxes = lines.filter(isBox).length;
        track('diagram_generated', {
          change: Boolean(previous),
          detailed: deep,
          mindMap: asMap,
          ok: end.ok,
          boxes,
        });
        if (!end.ok) {
          const problem = end.reason ?? 'unavailable';
          setRun((current) => current && { ...current, status: 'failed', problem });
          return;
        }
        remember({
          id: newId(),
          description,
          lines,
          createdAt: Date.now(),
          took: Date.now() - startedAt,
          ...(fixing ? { fixed: fixing } : {}),
          ...(changeOf ? { changeOf } : {}),
          ...(asMap ? { kind: 'mindmap' as const } : {}),
          chatId,
        });
        setRun(null);
        if (fromBox) {
          setDraft('');
          setAttachments((current) => {
            letGo(current);
            return [];
          });
          setChanging(null);
        }
      } catch {
        if (!abort.signal.aborted) {
          setRun((current) => current && { ...current, status: 'failed', problem: 'cut' });
          return;
        }
        setRun(null);
        // Stopped after boxes had arrived: the gateway counted it, so it is kept
        // as far as it got rather than thrown away.
        if (lines.some(isBox)) {
          remember({
            id: newId(),
            description,
            lines,
            createdAt: Date.now(),
            took: Date.now() - startedAt,
            ...(changeOf ? { changeOf } : {}),
            ...(asMap ? { kind: 'mindmap' as const } : {}),
            chatId,
          });
          setUsage((current) => {
            const next = current && {
              ...current,
              used: Math.min(current.used + cost, current.limit),
            };
            if (next) keepUsage(userId, boardId, next);
            return next;
          });
        }
      } finally {
        if (controller.current === abort) controller.current = null;
      }
    },
    [
      draft,
      attachments,
      running,
      token,
      changing,
      entries,
      chat,
      boardId,
      userId,
      remember,
      detailed,
      mindMap,
    ],
  );

  const generate = useCallback(() => ask(), [ask]);

  /** A count that came back from elsewhere — Expand on the board — shown and kept. */
  const noteUsage = useCallback(
    (answer: DiagramUsage) => {
      takeUsage(answer);
      keepUsage(userId, boardId, answer);
    },
    [takeUsage, userId, boardId],
  );

  /** The usage banner closed for this month and level, so it stays closed. */
  const [closed, setClosed] = useState(() => closedBanner(userId));
  useEffect(() => setClosed(closedBanner(userId)), [userId]);
  const bannerClosed = usage !== null && closed === bannerFor(usage);
  const closeUsageBanner = useCallback(() => {
    if (!usage) return;
    const key = bannerFor(usage);
    closeBanner(userId, key);
    setClosed(key);
  }, [usage, userId]);
  /** The same request once more, as a new card; the box keeps what is in it. */
  const again = useCallback(
    (asked: { description: string; changeOf?: string; chatId?: string }) =>
      ask({
        description: asked.description,
        ...(asked.changeOf ? { changeOf: asked.changeOf } : {}),
        ...(asked.chatId ? { chatId: asked.chatId } : {}),
      }),
    [ask],
  );
  /** Thumbs up or down on a diagram, or neither; kept with it in this browser. */
  const rate = useCallback(
    (id: string, reaction: 'up' | 'down' | null) => {
      update((current) =>
        current.map((entry) => {
          if (entry.id !== id) return entry;
          const { reaction: _old, ...rest } = entry;
          return reaction ? { ...rest, reaction } : rest;
        }),
      );
      if (reaction) track('diagram_rated', { reaction });
    },
    [update],
  );
  /** The shapes an insert just placed, so the panel can tell the diagram is on the board. */
  const markInserted = useCallback(
    (id: string, shapeIds: readonly string[]) =>
      update((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, inserted: [...shapeIds] } : entry)),
      ),
    [update],
  );

  const attach = useCallback(
    (file: Omit<DiagramAttachment, 'id'>) =>
      setAttachments((current) => [...current, { id: newId(), ...file }]),
    [],
  );
  const detach = useCallback(
    (id: string) =>
      setAttachments((current) => {
        letGo(current.filter((file) => file.id === id));
        return current.filter((file) => file.id !== id);
      }),
    [],
  );
  /** Puts a failed description back in the box. It already holds the files' text. */
  const retry = useCallback((description: string) => {
    setDraft(description);
    setAttachments((current) => {
      letGo(current);
      return [];
    });
    setRun(null);
  }, []);
  const stop = useCallback(() => controller.current?.abort(), []);
  const dismissRun = useCallback(() => setRun(null), []);
  const startChange = useCallback(
    (id: string) => {
      setChanging(id);
      const changed = entries.find((entry) => entry.id === id);
      if (changed?.chatId) setChat(changed.chatId);
    },
    [entries],
  );
  const cancelChange = useCallback(() => setChanging(null), []);
  /** A chat to look at, or null to start a new one. */
  const showChat = useCallback((id: string | null) => {
    setChat(id);
    setChanging(null);
  }, []);

  return {
    entries,
    run,
    running,
    usage,
    notice,
    draft,
    setDraft,
    attachments,
    attach,
    detach,
    retry,
    changing,
    chat,
    showChat,
    markInserted,
    detailed,
    setDetailed,
    mindMap,
    setTool,
    startChange,
    cancelChange,
    generate,
    noteUsage,
    /** Reads the count ahead of opening, e.g. while the pointer is on the button. */
    warmUsage: refreshUsage,
    bannerClosed,
    closeUsageBanner,
    again,
    rate,
    stop,
    dismissRun,
  };
}

export type DiagramPanelState = ReturnType<typeof useDiagramPanel>;
