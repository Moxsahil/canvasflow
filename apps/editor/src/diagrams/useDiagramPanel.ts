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
import { readHistory, withEntry, writeHistory, type DiagramEntry } from './diagram-history';
import { fixingLines } from './diagram-progress';

/** The diagram being written, shown as a card that fills in. */
export interface DiagramRun {
  description: string;
  changeOf?: string;
  /** Drawn by the larger model, which plans before it writes. */
  detailed: boolean;
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

/** Something the panel says instead of drawing. */
export type DiagramNotice =
  | { kind: 'limit' }
  | { kind: 'sign-in' }
  | { kind: 'unavailable' }
  /** A detailed diagram needs more of the month's diagrams than are left. */
  | { kind: 'not-enough' };

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
  token,
  open,
  signedIn,
}: {
  boardId: string;
  token: string | null;
  open: boolean;
  /** An account with a session: a guest's board token cannot spend diagrams. */
  signedIn: boolean;
}) {
  const [entries, setEntries] = useState<DiagramEntry[]>(() => readHistory(boardId));
  const [run, setRun] = useState<DiagramRun | null>(null);
  const [usage, setUsage] = useState<DiagramUsage | null>(null);
  const [notice, setNotice] = useState<DiagramNotice | null>(null);
  const [draft, setDraft] = useState('');
  const [changing, setChanging] = useState<string | null>(null);
  const [detailed, setDetailed] = useState(false);
  const controller = useRef<AbortController | null>(null);

  // Another board is another list.
  useEffect(() => {
    setEntries(readHistory(boardId));
    setRun(null);
    setChanging(null);
  }, [boardId]);

  // The count is read each time the panel opens: it may have moved on another
  // board, or another tab, since.
  useEffect(() => {
    if (!open || !token || !signedIn) return;
    const abort = new AbortController();
    fetchDiagramUsage(token, boardId, abort.signal)
      .then((answer) => {
        if ('plan' in answer) {
          setUsage(answer);
          if (answer.used >= answer.limit) {
            setNotice({ kind: 'limit' });
          } else {
            setNotice((current) => (current?.kind === 'limit' ? null : current));
          }
        } else {
          const said = noticeFor(answer);
          if (said) setNotice(said);
        }
      })
      .catch(() => {
        // The count is a courtesy; drawing still works without it.
      });
    return () => abort.abort();
  }, [open, token, signedIn, boardId]);

  useEffect(() => () => controller.current?.abort(), []);

  const running = run?.status === 'running';

  const remember = useCallback(
    (entry: DiagramEntry) => {
      setEntries((current) => {
        const next = withEntry(current, entry);
        writeHistory(boardId, next);
        return next;
      });
    },
    [boardId],
  );

  const generate = useCallback(async () => {
    const description = draft.trim();
    if (running || !token || description.length < DIAGRAM_PROMPT_MIN) return;
    if (description.length > DIAGRAM_PROMPT_MAX) return;
    const previous = changing ? entries.find((entry) => entry.id === changing) : undefined;

    const abort = new AbortController();
    controller.current = abort;
    const changeOf = previous?.id;
    const startedAt = Date.now();
    let fixing = 0;
    const cost = detailed ? DIAGRAM_DETAILED_COST : 1;
    setRun({
      description,
      ...(changeOf ? { changeOf } : {}),
      detailed,
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
          ...(detailed ? { detailed: true } : {}),
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
      if (end.usage.used >= end.usage.limit) setNotice({ kind: 'limit' });
      const boxes = lines.filter((line) => line.includes('"t":"node"')).length;
      track('diagram_generated', { change: Boolean(previous), detailed, ok: end.ok, boxes });
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
      });
      setRun(null);
      setDraft('');
      setChanging(null);
    } catch {
      if (!abort.signal.aborted) {
        setRun((current) => current && { ...current, status: 'failed', problem: 'cut' });
        return;
      }
      setRun(null);
      // Stopped after boxes had arrived: the gateway counted it, so it is kept
      // as far as it got rather than thrown away.
      if (lines.some((line) => line.includes('"t":"node"'))) {
        remember({
          id: newId(),
          description,
          lines,
          createdAt: Date.now(),
          took: Date.now() - startedAt,
          ...(changeOf ? { changeOf } : {}),
        });
        setUsage(
          (current) =>
            current && { ...current, used: Math.min(current.used + cost, current.limit) },
        );
      }
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }, [draft, running, token, changing, entries, boardId, remember, detailed]);

  const stop = useCallback(() => controller.current?.abort(), []);
  const dismissRun = useCallback(() => setRun(null), []);
  const startChange = useCallback((id: string) => setChanging(id), []);
  const cancelChange = useCallback(() => setChanging(null), []);

  return {
    entries,
    run,
    running,
    usage,
    notice,
    draft,
    setDraft,
    changing,
    detailed,
    setDetailed,
    startChange,
    cancelChange,
    generate,
    stop,
    dismissRun,
  };
}

export type DiagramPanelState = ReturnType<typeof useDiagramPanel>;
