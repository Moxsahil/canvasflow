import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Check,
  Gauge,
  LoaderCircle,
  LogIn,
  Maximize2,
  Minus,
  PanelLeft,
  X,
} from 'lucide-react';
import {
  DIAGRAM_DETAILED_COST,
  DIAGRAM_PROMPT_MAX,
  PLAN_ALLOWANCES,
  PLAN_NAMES,
  type DiagramUsage,
  type WorkspacePlan,
} from '@canvasflow/types';
import { InputBar } from '@/components/agent-elements/input-bar';
import { cn } from '@/lib/utils';
import { formatShortDate, useT, type WordKey } from '../i18n';
import { windowThemeVars, type SurfaceTheme } from '../ui/surface-palette';
import type { DiagramStyle } from '@canvasflow/canvas-engine';
import { DiagramPreview } from './DiagramPreview';
import {
  DIAGRAM_TOOLS,
  DIAGRAM_TOOLS_SOON,
  DiagramTools,
  ToolsShortcut,
  soonBadge,
  hideToolStrip,
  toolInfo,
  toolStripHidden,
  type DiagramToolId,
} from './DiagramTools';
import { AnswerActions, RequestActions } from './DiagramActions';
import { DiagramThread, NOTICE_ANSWER, RUN_ANSWER } from './DiagramThread';
import { copyDiagramAsPng } from './copy-diagram';
import { DiagramSummary, DiagramWorking } from './DiagramWork';
import { previousVersion, type DiagramEntry } from './diagram-history';
import { DiagramSidebar } from './DiagramSidebar';
import {
  CodeSample,
  EntityPreview,
  FlowchartPreview,
  MindMapPreview,
  TextPreview,
} from './tool-previews';
import {
  describedAs,
  type DiagramAttachment,
  type DiagramPanelState,
  type DiagramProblem,
} from './useDiagramPanel';

const PROBLEM_KEYS: Record<DiagramProblem, WordKey> = {
  refused: 'diagrams.problem.refused',
  empty: 'diagrams.problem.empty',
  busy: 'diagrams.problem.busy',
  unavailable: 'diagrams.problem.unavailable',
  cut: 'diagrams.problem.cut',
};

const EXAMPLES: ReadonlyArray<{ label: WordKey; text: WordKey }> = [
  { label: 'diagrams.example.signupLabel', text: 'diagrams.example.signup' },
  { label: 'diagrams.example.pipelineLabel', text: 'diagrams.example.pipeline' },
  { label: 'diagrams.example.teamLabel', text: 'diagrams.example.team' },
];

/**
 * What + takes. Text files are read into the description; pictures and PDFs
 * can be added and are shown, but the generator does not read them yet.
 */
const FILE_ACCEPT =
  '.txt,.md,.markdown,.csv,.json,.mmd,.mermaid,text/plain,text/markdown,text/csv,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,.pdf,application/pdf';

function kindOf(picked: File): DiagramAttachment['kind'] | null {
  if (/\.(png|jpe?g|webp)$/i.test(picked.name) || /^image\/(png|jpeg|webp)$/.test(picked.type)) {
    return 'image';
  }
  if (/\.pdf$/i.test(picked.name) || picked.type === 'application/pdf') return 'pdf';
  if (
    /\.(txt|md|markdown|csv|json|mmd|mermaid)$/i.test(picked.name) ||
    picked.type.startsWith('text/')
  ) {
    return 'text';
  }
  return null;
}

const button =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:pointer-events-none disabled:opacity-45';
/**
 * The panel's actions are words rather than boxes: muted until pointed at,
 * when a wash comes up behind them, with the main one in the text colour and
 * full weight and a hairline between it and the rest. Upgrade is a link.
 */
const textAction =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[var(--surface-fg-muted)] outline-none transition-colors duration-150 hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none [&_svg]:size-3.5 [&_svg]:shrink-0';
const mainAction = `${textAction} font-semibold text-[var(--surface-fg)]`;
/**
 * Insert, and Replace in its place: the card's one filled button, so it is
 * the one the eye finds. Flat — no border, light or shadow — in the
 * website's blue.
 */
const accentAction =
  'inline-flex h-7 shrink-0 items-center rounded-lg bg-[#135dfc] px-3 text-xs font-semibold text-white outline-none transition-colors duration-150 hover:bg-[#2a6dfc] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-card)] disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none';
const linkAction =
  'inline-flex shrink-0 items-center gap-1 rounded text-xs font-semibold text-[var(--diagram-link)] underline-offset-[3px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] [&_svg]:size-3 [&_svg]:shrink-0';
/** Link text that reads on the panel: lighter than the accent in dark, deeper in light. */
const LINK_COLOUR: Record<SurfaceTheme, string> = { dark: '#4d84fd', light: '#135dfc' };

const CHATS_COLLAPSED_KEY = 'cf:diagram-chats-collapsed';
const HISTORY_COLLAPSED_KEY = 'cf:diagram-history-collapsed';

function readCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

const HISTORY_WIDTH_KEY = 'cf:diagram-history-width';
const HISTORY_WIDTH = { initial: 360, min: 280, max: 640 };
/** What the stage keeps however far the conversation is dragged. */
const STAGE_MIN_WIDTH = 420;

function clampHistoryWidth(width: number, room = Infinity): number {
  const most = Math.min(HISTORY_WIDTH.max, room - STAGE_MIN_WIDTH);
  return Math.round(Math.max(HISTORY_WIDTH.min, Math.min(width, most)));
}

function readHistoryWidth(): number {
  try {
    const stored = Number(localStorage.getItem(HISTORY_WIDTH_KEY));
    return stored ? clampHistoryWidth(stored) : HISTORY_WIDTH.initial;
  } catch {
    return HISTORY_WIDTH.initial;
  }
}

/** The plan one step up, where there is one to move to. */
const NEXT_PLAN: Partial<Record<WorkspacePlan, WorkspacePlan>> = { free: 'pro', pro: 'team' };

const ghost = `${button} text-[var(--surface-fg-muted)] hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)]`;

/**
 * The diagrams panel: a short history of what was asked on this board, each
 * answer drawn as a card to insert or refine, and the box to ask in.
 *
 * Centred over the board, sized like a dialog, with the board still in use around it. No drop shadow,
 * like the dock: on a dark board a shadow reads as a halo around the panel,
 * and the border already sets it apart. Nothing reaches
 * the board until Insert, and a refine is a new card, so an earlier version
 * can still be inserted after a change that did not work out.
 */
export function DiagramPanel({
  panel,
  theme,
  canDraw,
  onInsert,
  onSignIn,
  onUpgrade,
  onClose,
  minimized = false,
  onMinimize,
  onRestore,
  profile = null,
  boardShapeIds,
  onShowOnBoard,
  onReplace,
  drawStyle,
}: {
  panel: DiagramPanelState;
  theme: SurfaceTheme;
  /** An account with a session; otherwise the panel asks them to sign in. */
  canDraw: boolean;
  onInsert: (entry: DiagramEntry) => void;
  onSignIn: () => void;
  onUpgrade: () => void;
  onClose: () => void;
  /**
   * Put away to a small bar over the board, everything kept: a diagram being
   * written goes on being written, and the bar says so.
   */
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  /** Who is drawing, for the sidebar's foot. */
  profile?: { name: string; avatarUrl: string | null } | null;
  /** The ids of the shapes on the board, to tell which diagrams are on it. */
  boardShapeIds?: ReadonlySet<string>;
  /** Puts the shapes a diagram placed in view, selected. */
  onShowOnBoard?: (entry: DiagramEntry) => void;
  /** Swaps an earlier version on the board for this one, where it stands. */
  onReplace?: (entry: DiagramEntry, previous: DiagramEntry) => void;
  /** How the board would draw the diagram: the style panel's current settings. */
  drawStyle?: DiagramStyle;
}) {
  const t = useT();
  const { entries, run, running, usage, notice, draft, changing } = panel;
  const bar = useRef<HTMLDivElement>(null);
  const sent = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const focusInput = () => bar.current?.querySelector('textarea')?.focus();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [stripShown, setStripShown] = useState(() => !toolStripHidden());
  const [dragging, setDragging] = useState(false);
  /** Set when a file of a kind the box does not take was dropped, picked or pasted. */
  const [refusedFile, setRefusedFile] = useState(false);
  const unread = panel.attachments.some((file) => file.kind !== 'text');
  const dark = theme === 'dark';
  const signIn = !canDraw || notice?.kind === 'sign-in';
  const limited = notice?.kind === 'limit';
  const changingEntry = changing ? entries.find((entry) => entry.id === changing) : undefined;
  /** Open over the conversation, where the panel is too narrow to keep it beside. */
  const [chatsOpen, setChatsOpen] = useState(false);
  /** Chats put away by their own button, remembered in this browser. */
  const [chatsCollapsed, setChatsCollapsed] = useState(() => readCollapsed(CHATS_COLLAPSED_KEY));
  /** The conversation put away for a wider stage, remembered the same way. */
  const [historyCollapsed, setHistoryCollapsed] = useState(() =>
    readCollapsed(HISTORY_COLLAPSED_KEY),
  );
  const collapseHistory = (collapsed: boolean) => {
    setHistoryCollapsed(collapsed);
    try {
      localStorage.setItem(HISTORY_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // Still put away for this visit, just not remembered.
    }
  };
  /** How wide the conversation was dragged, remembered the same way. */
  const [historyWidth, setHistoryWidth] = useState(readHistoryWidth);
  const resizeHistory = (next: number, room: number) => {
    const width = clampHistoryWidth(next, room);
    setHistoryWidth(width);
    try {
      localStorage.setItem(HISTORY_WIDTH_KEY, String(width));
    } catch {
      // Still this wide for this visit, just not remembered.
    }
  };
  const collapseChats = (collapsed: boolean) => {
    setChatsCollapsed(collapsed);
    setChatsOpen(!collapsed);
    try {
      localStorage.setItem(CHATS_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // Still put away for this visit, just not remembered.
    }
  };
  /** The version picked in the sidebar, lit there and scrolled to here. */
  const [focused, setFocused] = useState<string | null>(null);
  const chatEntries = entries.filter((entry) => entry.chatId === panel.chat);
  const shownRun = run && run.chatId === panel.chat ? run : null;
  const isOnBoard = (entry: DiagramEntry) =>
    Boolean(boardShapeIds && entry.inserted?.some((id) => boardShapeIds.has(id)));
  const versionOf = (entry: DiagramEntry) =>
    chatEntries.findIndex((item) => item.id === entry.id) + 1;

  /** The version on the stage: the one picked, or the latest. */
  const selected = chatEntries.find((entry) => entry.id === focused) ?? chatEntries.at(-1);
  const earlier = selected ? previousVersion(selected, entries) : undefined;
  const [comparing, setComparing] = useState(false);
  const drawingHere = shownRun?.status === 'running';
  const showingCompare = comparing && Boolean(earlier) && !drawingHere;
  // Whatever is being drawn takes the stage, box by box, until it is done.
  const stageLines = drawingHere ? shownRun.lines : selected?.lines;

  // A new version takes the stage as it arrives, and a new chat starts from the top.
  const count = chatEntries.length;
  useEffect(() => {
    setFocused(null);
    setComparing(false);
  }, [count, panel.chat]);

  // A version picked in the sidebar is scrolled to once its chat has drawn.
  useEffect(() => {
    if (!focused) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`diagram-${focused}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [focused, panel.chat]);

  useEffect(() => {
    if (!signIn && !minimized) focusInput();
  }, [signIn, changing, minimized]);

  const resets = usage ? formatShortDate(new Date(usage.resetsAt)) : '';
  const left = usage ? Math.max(usage.limit - usage.used, 0) : null;
  /**
   * Past 85% of the month's diagrams, a banner over the box says so, with
   * Upgrade where there is a bigger plan to move to. It takes the tool
   * strip's place until the month starts again.
   */
  const runningLow = Boolean(usage && usage.limit > 0 && usage.used / usage.limit >= 0.85);
  const nextPlan = usage ? NEXT_PLAN[usage.plan] : undefined;
  const upgradeLabel = nextPlan ? t('diagrams.upgradeTo', { plan: PLAN_NAMES[nextPlan] }) : null;
  // Never cut a long description short: say how long it is as it nears the
  // limit, and refuse to send it once over, so nothing is dropped unseen.
  // Attached files count, since their text is sent with the words.
  const asked = describedAs(draft, panel.attachments);
  const nearLimit = asked.length > DIAGRAM_PROMPT_MAX * 0.8;
  const tooLong = asked.length > DIAGRAM_PROMPT_MAX;
  const picked: DiagramToolId | null = panel.mindMap
    ? 'mindmap'
    : panel.detailed
      ? 'detailed'
      : null;
  const toolsOff = running || limited;
  const send = () => {
    if (!tooLong) void panel.generate();
  };

  /** Each file the box takes becomes a chip in it; anything else is turned away. */
  const addFiles = async (files: readonly File[]) => {
    if (files.length === 0 || limited) return;
    setRefusedFile(files.some((picked) => !kindOf(picked)));
    for (const picked of files) {
      const kind = kindOf(picked);
      if (!kind) continue;
      const base = { kind, filename: picked.name, size: picked.size };
      if (kind === 'text') {
        const text = (await picked.text()).trim();
        if (text) panel.attach({ ...base, text });
      } else {
        panel.attach({
          ...base,
          text: '',
          ...(kind === 'image' ? { url: URL.createObjectURL(picked) } : {}),
        });
      }
    }
    focusInput();
  };

  const toolTile = (tool: (typeof DIAGRAM_TOOLS)[number], preview: ReactNode, span: string) => {
    const on = picked === tool.id;
    return (
      <ToolTile
        title={t(tool.label)}
        line={t(tool.row)}
        preview={preview}
        className={span}
        badge={
          on ? (
            <Check className="size-3.5 text-[var(--surface-link)]" aria-hidden="true" />
          ) : (
            <span className="rounded-full bg-[var(--surface-accent-wash)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--surface-link)] tabular-nums">
              ×{tool.cost}
            </span>
          )
        }
        on={on}
        disabled={toolsOff || (!on && left !== null && left < tool.cost)}
        onPick={() => {
          panel.setTool(on ? null : tool.id);
          focusInput();
        }}
      />
    );
  };
  const soonTile = (id: string, preview: ReactNode, span: string) => {
    const tool = DIAGRAM_TOOLS_SOON.find((item) => item.id === id);
    if (!tool) return null;
    return (
      <ToolTile
        title={t(tool.label)}
        line={t(tool.row)}
        preview={preview}
        className={span}
        badge={<span className={soonBadge}>{t('diagrams.soon')}</span>}
      />
    );
  };
  const [textTool, mapTool] = DIAGRAM_TOOLS;

  /**
   * A new chat, with the whole panel to itself: the question, the box, and what
   * can be drawn, each tile showing the kind of thing it makes.
   */
  const welcome = (box: ReactNode) => (
    <div className="mx-auto grid h-full w-full grid-rows-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] justify-items-center gap-3.5 overflow-y-auto px-5 py-5">
      <div className="flex flex-col items-center justify-end gap-3.5">
        <h3 className="m-0 text-center text-[clamp(1.625rem,2.6vw,2.25rem)] leading-[1.08] font-semibold tracking-[-0.035em]">
          {t('diagrams.welcomeTitle')}
        </h3>
        <p className="m-0 max-w-[36rem] text-center text-[13px] leading-[1.55] text-[var(--surface-fg-muted)]">
          {t('diagrams.intro')}
        </p>
      </div>
      <div className="w-full max-w-[45rem]">{box}</div>
      <div className="flex w-full flex-col items-center gap-3.5">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="mr-1 text-xs text-[var(--surface-fg-muted)]">
            {t('diagrams.tryExample')}
          </span>
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => {
                panel.setDraft(t(example.text));
                focusInput();
              }}
              className="rounded-full border border-[var(--surface-border)] px-3 py-1 text-xs text-[var(--surface-fg-muted)] outline-none transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
            >
              {t(example.label)}
            </button>
          ))}
        </div>
        <div className="grid w-full max-w-[60rem] shrink-0 gap-2.5 lg:grid-cols-[4fr_8fr]">
          {textTool && toolTile(textTool, <TextPreview />, 'lg:h-[21.5rem]')}
          <div className="grid min-w-0 grid-cols-2 gap-2.5 lg:h-[21.5rem] lg:grid-cols-6 lg:grid-rows-2">
            {mapTool && toolTile(mapTool, <MindMapPreview />, 'lg:col-span-3')}
            {soonTile('flowchart', <FlowchartPreview />, 'lg:col-span-3')}
            {soonTile('er', <EntityPreview />, 'lg:col-span-2')}
            {soonTile(
              'mermaid',
              <CodeSample
                lines={[['flowchart TD', '#a48ff0'], ['  A --> B{Paid?}'], ['  B --> C']]}
              />,
              'lg:col-span-2',
            )}
            {soonTile(
              'code',
              <CodeSample
                lines={[['function pay() {', '#57c29a'], ['  // charge, ship'], ['}']]}
              />,
              'lg:col-span-2',
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const noticeNote =
    limited && usage ? (
      <LimitNote usage={usage} resets={resets} upgradeLabel={upgradeLabel} onUpgrade={onUpgrade} />
    ) : notice?.kind === 'not-enough' && left !== null ? (
      <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3 text-xs leading-[1.5] text-[var(--surface-fg-muted)]">
        {t('diagrams.notEnough', { cost: DIAGRAM_DETAILED_COST, left })}
        <button
          type="button"
          className={cn(ghost, 'mt-1.5 -ml-2.5 text-[var(--surface-link)]')}
          onClick={() => panel.setTool(null)}
        >
          {t('diagrams.useQuick')}
        </button>
      </div>
    ) : notice?.kind === 'unavailable' ? (
      <p className="m-0 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3 text-xs text-[var(--surface-fg-muted)]">
        {t('diagrams.unavailable')}
      </p>
    ) : null;

  const isStart = !signIn && chatEntries.length === 0 && !shownRun && !noticeNote;

  /** The answer to one request: the diagram drawn, or being drawn, or a notice. */
  const answer = (id: string): ReactNode => {
    if (id === NOTICE_ANSWER) return noticeNote;
    if (id === RUN_ANSWER) {
      if (!run) return null;
      return (
        <DiagramCard
          top={run.status === 'running' ? <DiagramWorking run={run} /> : null}
          footer={
            run.status === 'failed' ? (
              <>
                <span className="min-w-0 flex-1 text-xs leading-[1.45] text-[var(--surface-warn)]">
                  {t(PROBLEM_KEYS[run.problem ?? 'unavailable'])}
                </span>
                <button
                  type="button"
                  className={cn(mainAction, 'ml-auto')}
                  onClick={() => {
                    panel.retry(run.description);
                    focusInput();
                  }}
                >
                  {t('diagrams.tryAgain')}
                </button>
              </>
            ) : null
          }
        />
      );
    }
    const entry = entries.find((item) => item.id === id);
    if (!entry) return null;
    const lit = selected?.id === entry.id;
    const previous = previousVersion(entry, entries);
    // Swapping in place is offered where the version before is on the board and this one is not.
    const replaces =
      previous && !isOnBoard(entry) && isOnBoard(previous) && onReplace ? previous : null;
    return (
      <div id={`diagram-${entry.id}`} className="flex min-w-0 flex-col gap-1">
        <DiagramCard
          top={<DiagramSummary entry={entry} />}
          lit={lit}
          footer={null}
          thumb={
            <button
              type="button"
              aria-pressed={lit}
              aria-label={t('diagrams.version', { n: versionOf(entry) })}
              onClick={() => setFocused(entry.id)}
              className="block w-full cursor-pointer bg-[var(--surface-input)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:ring-inset"
            >
              <DiagramPreview
                lines={entry.lines}
                dark={dark}
                label={entry.description}
                drawStyle={drawStyle}
                fit="thumb"
              />
            </button>
          }
        />
        <AnswerActions
          at={entry.createdAt}
          reaction={entry.reaction ?? null}
          onRate={(reaction) => panel.rate(entry.id, reaction)}
          onRegenerate={() => void panel.again(entry)}
          regenerateDisabled={running || limited}
          onCopy={() => copyDiagramAsPng(entry.lines, { style: drawStyle, dark })}
          trailing={
            <>
              <button
                type="button"
                className={textAction}
                disabled={running || limited}
                onClick={() => {
                  setFocused(entry.id);
                  setComparing(false);
                  panel.startChange(entry.id);
                }}
              >
                {t('diagrams.refine')}
              </button>
              {replaces && (
                <button type="button" className={textAction} onClick={() => onInsert(entry)}>
                  {t('diagrams.insert')}
                </button>
              )}
              {replaces ? (
                <button
                  type="button"
                  className={accentAction}
                  onClick={() => onReplace?.(entry, replaces)}
                >
                  {t('diagrams.replaceOnBoard', { n: versionOf(replaces) || 1 })}
                </button>
              ) : (
                <button type="button" className={accentAction} onClick={() => onInsert(entry)}>
                  {t('diagrams.insert')}
                </button>
              )}
            </>
          }
        />
        {isOnBoard(entry) && (
          <button
            type="button"
            onClick={() => onShowOnBoard?.(entry)}
            disabled={!onShowOnBoard}
            title={t('diagrams.showOnBoard')}
            className="inline-flex h-6 items-center gap-1.5 self-start rounded-full bg-[var(--surface-accent-wash)] px-2 text-[11px] font-medium outline-none hover:bg-[var(--surface-flash)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--surface-accent)]" />
            {t('diagrams.onBoard')}
          </button>
        )}
      </div>
    );
  };

  /** Under each request: its time, ask again, put it back in the box, copy it. */
  const request = (id: string): ReactNode => {
    const entry = id === RUN_ANSWER ? null : entries.find((item) => item.id === id);
    const asked = id === RUN_ANSWER ? run : entry;
    if (!asked) return null;
    // An entry is kept once drawn; it was asked as long before as drawing took.
    const at = entry ? entry.createdAt - (entry.took ?? 0) : (run?.startedAt ?? Date.now());
    return (
      <RequestActions
        at={at}
        text={asked.description}
        onRetry={() => void panel.again(asked)}
        retryDisabled={running || limited}
        onEdit={() => {
          panel.setDraft(asked.description);
          if (asked.changeOf) panel.startChange(asked.changeOf);
          else panel.cancelChange();
          focusInput();
        }}
      />
    );
  };

  /** The box to ask in, wherever the panel's state puts it. */
  const composer = (
    <>
      {changingEntry && (
        <div className="mb-2 flex items-start gap-2 text-xs leading-[1.45] text-[var(--surface-fg-muted)]">
          <span className="shrink-0 font-medium text-[var(--surface-link)]">
            {t('diagrams.changing')}
          </span>
          <span
            className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]"
            title={changingEntry.description}
          >
            {changingEntry.description}
          </span>
          <button
            type="button"
            className={cn(ghost, 'ml-auto size-6 shrink-0 justify-center px-0')}
            aria-label={t('diagrams.cancelChange')}
            onClick={panel.cancelChange}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {/* The bar clears itself after a send. The draft stays until the
              diagram is drawn instead, as before, so that clear is skipped. */}
      {(refusedFile || unread) && (
        <p role="status" className="m-0 mb-2 text-xs leading-[1.45] text-[var(--surface-warn)]">
          {refusedFile ? t('diagrams.fileTypes') : t('diagrams.notReadYet')}
        </p>
      )}
      <div
        ref={bar}
        onDragOver={(event) => {
          if (limited || !event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragging(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && changing) {
            event.preventDefault();
            panel.cancelChange();
          }
          // In an empty box, / opens the tools and Backspace takes the picked one off.
          const empty = event.target instanceof HTMLTextAreaElement && draft === '';
          if (empty && event.key === '/' && !toolsOff) {
            event.preventDefault();
            setToolsOpen(true);
          }
          if (empty && event.key === 'Backspace' && picked && !toolsOff) {
            event.preventDefault();
            panel.setTool(null);
          }
        }}
      >
        <InputBar
          className="px-0 pb-0"
          value={draft}
          attachedImages={panel.attachments.flatMap((file) =>
            file.kind === 'image' && file.url
              ? [{ id: file.id, filename: file.filename, size: file.size, url: file.url }]
              : [],
          )}
          attachedFiles={panel.attachments.filter((file) => file.kind !== 'image')}
          onRemoveImage={panel.detach}
          onRemoveFile={panel.detach}
          imagePreviewStyle="chip"
          removeAttachmentLabel={t('diagrams.removeFile')}
          isDragOver={dragging}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length === 0) return;
            event.preventDefault();
            void addFiles(files);
          }}
          onChange={(value) => {
            if (sent.current) {
              sent.current = false;
              return;
            }
            panel.setDraft(value);
          }}
          onSend={() => {
            sent.current = true;
            send();
          }}
          status={running ? 'streaming' : 'ready'}
          onStop={panel.stop}
          onAttach={limited ? undefined : () => file.current?.click()}
          attachLabel={t('diagrams.attach')}
          disabled={limited}
          ariaLabel={t('diagrams.describe')}
          ariaDescribedBy="diagram-length"
          sendLabel={t('diagrams.send')}
          stopLabel={t('diagrams.stop')}
          canSend={!tooLong && asked.length >= 3}
          placeholder={
            limited
              ? t('diagrams.placeholderLimit', { date: resets })
              : changingEntry
                ? t('diagrams.placeholderChange')
                : panel.mindMap
                  ? t('diagrams.placeholderMindmap')
                  : t('diagrams.placeholder')
          }
          infoBar={
            runningLow && usage && !panel.bannerClosed
              ? {
                  onClose: panel.closeUsageBanner,
                  closeLabel: t('diagrams.hideBanner'),
                  icon: (
                    <Gauge
                      className="size-3.5 shrink-0 text-[var(--surface-warn)]"
                      aria-hidden="true"
                    />
                  ),
                  description:
                    usage.used >= usage.limit
                      ? t('diagrams.lowAllUsed', { limit: usage.limit, date: resets })
                      : t('diagrams.lowUsed', {
                          used: usage.used,
                          limit: usage.limit,
                          date: resets,
                        }),
                  ...(upgradeLabel
                    ? {
                        trailing: (
                          <button
                            type="button"
                            onClick={onUpgrade}
                            className={cn(linkAction, 'mr-1.5')}
                          >
                            {upgradeLabel}
                            <ArrowUpRight aria-hidden="true" />
                          </button>
                        ),
                      }
                    : {}),
                }
              : stripShown
                ? {
                    ...toolInfo(picked, t),
                    trailing: (
                      <ToolsShortcut
                        picked={picked}
                        disabled={toolsOff}
                        onOpen={() => setToolsOpen(true)}
                      />
                    ),
                    onClose: () => {
                      hideToolStrip();
                      setStripShown(false);
                    },
                    closeLabel: t('diagrams.hideToolStrip'),
                  }
                : undefined
          }
          leftActions={
            <DiagramTools
              picked={picked}
              onPick={(id) => panel.setTool(id)}
              open={toolsOpen}
              onOpenChange={setToolsOpen}
              onClosed={focusInput}
              left={left}
              disabled={toolsOff}
              container={root}
            />
          }
          rightActions={
            <span
              id="diagram-length"
              className={cn(
                'ml-auto text-[11px] tabular-nums',
                tooLong ? 'text-[var(--surface-danger)]' : 'text-[var(--surface-fg-faint)]',
                !nearLimit && 'sr-only',
              )}
            >
              {tooLong
                ? t('diagrams.tooLong', { count: asked.length - DIAGRAM_PROMPT_MAX })
                : t('diagrams.length', {
                    used: asked.length.toLocaleString(),
                    max: DIAGRAM_PROMPT_MAX.toLocaleString(),
                  })}
            </span>
          }
        />
      </div>
      {/* + adds files as chips in the box; a text file's words are sent after the typed ones. */}
      <input
        ref={file}
        type="file"
        accept={FILE_ACCEPT}
        multiple
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void addFiles(files);
        }}
      />
    </>
  );

  return (
    <>
      {/* Dims and blurs the board behind, like the editor's other windows, so
          the board's own boxes and arrows don't read as part of the panel.
          A click on it closes the panel; the history stays. */}
      {minimized && onRestore && (
        <MinimizedBar
          theme={theme}
          running={running}
          failed={run?.status === 'failed'}
          onRestore={onRestore}
          onClose={onClose}
        />
      )}
      <div
        aria-hidden="true"
        hidden={minimized}
        data-testid="diagram-backdrop"
        style={windowThemeVars(theme)}
        onClick={onClose}
        className="cf-diagram-backdrop bg-[var(--surface-backdrop)] backdrop-blur-[3px]"
      />
      <aside
        ref={setRoot}
        hidden={minimized}
        aria-label={t('diagrams.title')}
        data-testid="diagram-panel"
        style={{ ...windowThemeVars(theme), '--diagram-link': LINK_COLOUR[theme] } as CSSProperties}
        data-chats-collapsed={chatsCollapsed ? '' : undefined}
        className="cf-diagram-panel grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-panel)] text-[var(--surface-fg)] shadow-none"
      >
        <header className="flex min-h-[52px] items-center gap-2.5 border-b border-[var(--surface-line)] px-3.5 py-2">
          {!signIn && (
            <button
              type="button"
              onClick={() =>
                chatsCollapsed ? collapseChats(false) : setChatsOpen((value) => !value)
              }
              aria-expanded={chatsOpen && !chatsCollapsed}
              aria-label={t('diagrams.chats')}
              title={t('diagrams.chats')}
              className={cn(ghost, 'cf-diagram-sidebar-toggle size-7 justify-center px-0')}
            >
              <PanelLeft className="size-4" aria-hidden="true" />
            </button>
          )}
          <img src="/brand/apple-touch-icon.png" alt="" className="size-6 shrink-0 rounded-[7px]" />
          <h2 className="m-0 min-w-0 shrink truncate text-[13px] font-semibold">
            {t('diagrams.title')}
          </h2>
          <div className="flex min-w-0 flex-1 justify-center">
            {chatEntries.length > 1 && !isStart && (
              <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] border border-[var(--surface-line)] bg-[var(--surface-wash)] p-[3px]">
                {chatEntries.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={selected?.id === entry.id}
                    onClick={() => setFocused(entry.id)}
                    className={cn(
                      'h-[26px] shrink-0 rounded-[7px] px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]',
                      selected?.id === entry.id
                        ? 'bg-[var(--surface-raised-hover)] text-[var(--surface-fg)]'
                        : 'text-[var(--surface-fg-muted)] hover:text-[var(--surface-fg)]',
                    )}
                  >
                    {t('diagrams.version', { n: index + 1 })}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && !isStart && (
            <>
              {earlier && (
                <button
                  type="button"
                  aria-pressed={comparing}
                  onClick={() => setComparing((value) => !value)}
                  className={cn(
                    textAction,
                    comparing && 'bg-[var(--surface-wash)] text-[var(--surface-fg)]',
                  )}
                >
                  {t('diagrams.compareWith', { n: versionOf(earlier) || 1 })}
                </button>
              )}
            </>
          )}
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              aria-label={t('diagrams.minimize')}
              title={t('diagrams.minimize')}
              className={cn(ghost, 'size-7 justify-center px-0')}
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('diagrams.close')}
            title={t('diagrams.close')}
            className={cn(ghost, 'size-7 justify-center px-0')}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div
          className="cf-diagram-body relative flex min-h-0"
          data-start={isStart ? '' : undefined}
        >
          {!signIn && !showingCompare && (
            <DiagramSidebar
              entries={entries}
              chat={panel.chat}
              run={run}
              focused={focused}
              isOnBoard={isOnBoard}
              onShowChat={(id) => {
                setFocused(null);
                panel.showChat(id);
              }}
              onShowVersion={(entry) => {
                setFocused(entry.id);
                panel.showChat(entry.chatId ?? entry.id);
              }}
              onNewChat={() => {
                setFocused(null);
                panel.showChat(null);
                focusInput();
              }}
              profile={profile}
              usage={usage}
              upgradeLabel={upgradeLabel}
              onUpgrade={onUpgrade}
              open={chatsOpen}
              onDismiss={() => setChatsOpen(false)}
              collapsed={chatsCollapsed}
              onCollapse={() => collapseChats(true)}
            />
          )}
          {signIn ? (
            <div className="min-w-0 flex-1 p-3.5">
              <SignInNote onSignIn={onSignIn} />
            </div>
          ) : isStart ? (
            <div className="min-w-0 flex-1">{welcome(composer)}</div>
          ) : showingCompare && selected && earlier ? (
            <div className="grid min-w-0 flex-1 grid-cols-2">
              {[
                { entry: earlier, border: true },
                { entry: selected, border: false },
              ].map(({ entry, border }) => (
                <figure
                  key={entry.id}
                  className={cn(
                    'cf-diagram-stage relative m-0 min-w-0',
                    border && 'border-r border-[var(--surface-border)]',
                  )}
                >
                  <figcaption className="absolute top-3 left-3 z-[1] rounded-lg border border-[var(--surface-border)] bg-[var(--surface-panel)] px-2.5 py-1 text-xs font-semibold">
                    {t('diagrams.version', { n: versionOf(entry) })}
                  </figcaption>
                  <DiagramPreview
                    lines={entry.lines}
                    dark={dark}
                    label={entry.description}
                    drawStyle={drawStyle}
                    fit="fill"
                  />
                </figure>
              ))}
            </div>
          ) : (
            <div className="cf-diagram-work flex min-w-0 flex-1">
              <div className="cf-diagram-stage flex min-w-0 flex-1 flex-col">
                <div className="cf-diagram-canvas min-h-0 flex-1">
                  {stageLines && stageLines.length > 0 && (
                    <DiagramPreview
                      lines={stageLines}
                      dark={dark}
                      label={selected?.description ?? shownRun?.description ?? ''}
                      drawStyle={drawStyle}
                      fit="fill"
                    />
                  )}
                </div>
                <div className="cf-diagram-composer mx-auto w-full max-w-[42rem] px-4 pb-4">
                  {composer}
                </div>
              </div>
              <div
                data-collapsed={historyCollapsed ? '' : undefined}
                className={cn(
                  'cf-diagram-chat flex min-h-0 shrink-0 flex-col border-l border-[var(--surface-line)] bg-[var(--surface-panel)]',
                  'relative',
                  historyCollapsed && 'w-12',
                )}
                style={historyCollapsed ? undefined : { width: historyWidth }}
              >
                {!historyCollapsed && (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t('diagrams.resizeHistory')}
                    aria-valuenow={historyWidth}
                    aria-valuemin={HISTORY_WIDTH.min}
                    aria-valuemax={HISTORY_WIDTH.max}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      const step =
                        event.key === 'ArrowLeft' ? 16 : event.key === 'ArrowRight' ? -16 : 0;
                      if (!step) return;
                      event.preventDefault();
                      const room =
                        event.currentTarget.closest('.cf-diagram-work')?.clientWidth ?? Infinity;
                      resizeHistory(historyWidth + step, room);
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      const handle = event.currentTarget;
                      handle.setPointerCapture(event.pointerId);
                      const startX = event.clientX;
                      const startWidth = historyWidth;
                      const room = handle.closest('.cf-diagram-work')?.clientWidth ?? Infinity;
                      const move = (next: PointerEvent) =>
                        resizeHistory(startWidth + startX - next.clientX, room);
                      const end = () => {
                        handle.removeEventListener('pointermove', move);
                        handle.removeEventListener('pointerup', end);
                        handle.removeEventListener('pointercancel', end);
                      };
                      handle.addEventListener('pointermove', move);
                      handle.addEventListener('pointerup', end);
                      handle.addEventListener('pointercancel', end);
                    }}
                    className="cf-diagram-chat-resize"
                  />
                )}
                <div hidden={historyCollapsed} className="min-h-0 flex-1">
                  <DiagramThread
                    entries={chatEntries}
                    run={shownRun}
                    notice={Boolean(noticeNote)}
                    welcome={null}
                    answer={answer}
                    request={request}
                  />
                </div>
                <div className="mt-auto flex justify-end p-2">
                  <button
                    type="button"
                    onClick={() => collapseHistory(!historyCollapsed)}
                    aria-expanded={!historyCollapsed}
                    aria-label={t(
                      historyCollapsed ? 'diagrams.showHistory' : 'diagrams.hideHistory',
                    )}
                    title={t(historyCollapsed ? 'diagrams.showHistory' : 'diagrams.hideHistory')}
                    className={cn(ghost, 'size-8 justify-center px-0')}
                  >
                    {historyCollapsed ? (
                      <ChevronLeft className="size-4" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * One thing a new chat can draw: its name, a line under it, and a picture of
 * the kind of thing it makes. One not ready yet is a plain tile, not a button.
 */
function ToolTile({
  title,
  line,
  preview,
  badge,
  className,
  on = false,
  disabled = false,
  onPick,
}: {
  title: string;
  line: string;
  preview: ReactNode;
  badge: ReactNode;
  className?: string;
  on?: boolean;
  disabled?: boolean;
  /** Left out for a tool on its way. */
  onPick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-start gap-2">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--surface-fg)]">
            {title}
          </span>
          <span className="line-clamp-2 text-[11.5px] leading-[1.35] text-[var(--surface-fg-muted)]">
            {line}
          </span>
        </span>
        <span className="flex shrink-0 items-center">{badge}</span>
      </span>
      <span className="flex min-h-0 flex-1 flex-col pt-2">{preview}</span>
    </>
  );
  const tile = cn(
    'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3 text-left',
    className,
  );
  if (!onPick) {
    return (
      <div aria-disabled="true" className={tile}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        tile,
        'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-45',
        on
          ? 'border-[var(--surface-accent)]'
          : 'hover:border-[var(--surface-fg-faint)] hover:bg-[var(--surface-raised)]',
      )}
    >
      {body}
    </button>
  );
}

/** One answer in the conversation: how it went, and a small picture to put on the stage. */
function DiagramCard({
  top,
  thumb,
  footer,
  lit = false,
}: {
  /** What is happening, or once done, how it went. */
  top: ReactNode;
  thumb?: ReactNode;
  footer: ReactNode;
  lit?: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-2xl border bg-[var(--surface-card)]',
        lit ? 'border-[var(--surface-link)]' : 'border-[var(--surface-border)]',
      )}
    >
      {top}
      {thumb}
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--surface-line)] px-3 py-2.5">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * The panel put away: a bar over the board's bottom-right corner, above the
 * zoom panel, that opens it again. While a diagram is being written it says
 * so, so the wait can be spent on the board.
 */
function MinimizedBar({
  theme,
  running,
  failed,
  onRestore,
  onClose,
}: {
  theme: SurfaceTheme;
  running: boolean;
  failed: boolean;
  onRestore: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      role="region"
      aria-label={t('diagrams.title')}
      data-testid="diagram-minimized"
      style={windowThemeVars(theme)}
      className="cf-diagram-minimized flex h-[38px] items-center gap-1 rounded-full border border-[var(--surface-border)] bg-[var(--surface-panel)] pr-1 pl-1 text-[var(--surface-fg)]"
    >
      <button
        type="button"
        onClick={onRestore}
        aria-label={t('diagrams.restore')}
        title={t('diagrams.restore')}
        className="flex h-[30px] min-w-0 items-center gap-2 rounded-full pr-2 pl-2.5 text-xs font-medium outline-none hover:bg-[var(--surface-wash)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
      >
        <img src="/brand/apple-touch-icon.png" alt="" className="size-4 shrink-0 rounded-[4px]" />
        <span className="truncate">{t('diagrams.title')}</span>
        {running && (
          <span className="flex items-center gap-1 font-normal text-[var(--surface-fg-muted)]">
            <LoaderCircle
              className="size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            {t('diagrams.drawingNow')}
          </span>
        )}
        {failed && (
          <span className="font-normal text-[var(--surface-warn)]">
            {t('diagrams.didntFinish')}
          </span>
        )}
        <Maximize2
          className="size-3.5 shrink-0 text-[var(--surface-fg-muted)]"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('diagrams.close')}
        title={t('diagrams.close')}
        className={cn(ghost, 'size-[30px] shrink-0 justify-center rounded-full px-0')}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function LimitNote({
  usage,
  resets,
  upgradeLabel,
  onUpgrade,
}: {
  usage: DiagramUsage;
  resets: string;
  /** "Upgrade to Pro", or null where there is no bigger plan. */
  upgradeLabel: string | null;
  onUpgrade: () => void;
}) {
  const t = useT();
  return (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--surface-warn)_35%,transparent)] bg-[var(--surface-warn-wash)] p-3.5">
      <h3 className="m-0 mb-1 text-[13px] font-semibold">
        {t('diagrams.limitTitle', { limit: usage.limit })}
      </h3>
      <p className="m-0 mb-2.5 text-xs leading-[1.5] text-[var(--surface-fg-muted)]">
        {t('diagrams.limitBody', {
          date: resets,
          pro: PLAN_ALLOWANCES.pro.diagramsPerMonth,
          team: PLAN_ALLOWANCES.team.diagramsPerMonth,
        })}
      </p>
      {upgradeLabel && (
        <button type="button" className={linkAction} onClick={onUpgrade}>
          {upgradeLabel}
          <ArrowUpRight aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function SignInNote({ onSignIn }: { onSignIn: () => void }) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3.5">
      <h3 className="m-0 mb-1 text-[13px] font-semibold">{t('diagrams.signInTitle')}</h3>
      <p className="m-0 mb-2.5 text-xs leading-[1.5] text-[var(--surface-fg-muted)]">
        {t('diagrams.signInBody', { free: PLAN_ALLOWANCES.free.diagramsPerMonth })}
      </p>
      <button type="button" className={cn(mainAction, '-ml-2')} onClick={onSignIn}>
        <LogIn aria-hidden="true" />
        {t('diagrams.signIn')}
      </button>
    </div>
  );
}
