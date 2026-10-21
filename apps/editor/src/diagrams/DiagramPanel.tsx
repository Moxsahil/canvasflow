import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Check,
  LoaderCircle,
  LogIn,
  Maximize2,
  Minus,
  PanelLeft,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  DIAGRAM_DETAILED_COST,
  DIAGRAM_PROMPT_MAX,
  PLAN_ALLOWANCES,
  type DiagramUsage,
} from '@canvasflow/types';
import { InputBar } from '@/components/agent-elements/input-bar';
import { cn } from '@/lib/utils';
import { formatShortDate, useT, type WordKey } from '../i18n';
import { surfaceThemeVars, type SurfaceTheme } from '../ui/surface-palette';
import { DiagramMark } from './DiagramMark';
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

const boxesIn = (lines: readonly string[]) =>
  lines.filter((line) => line.includes('"t":"node"')).length;

const button =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:pointer-events-none disabled:opacity-45';
const primary = `${button} bg-[var(--surface-accent)] text-[var(--surface-on-accent)] hover:bg-[var(--surface-accent-hover)]`;
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
  /** The version picked in the sidebar, lit there and scrolled to here. */
  const [focused, setFocused] = useState<string | null>(null);
  const chatEntries = entries.filter((entry) => entry.chatId === panel.chat);
  const shownRun = run && run.chatId === panel.chat ? run : null;
  const isOnBoard = (entry: DiagramEntry) =>
    Boolean(boardShapeIds && entry.inserted?.some((id) => boardShapeIds.has(id)));
  const versionOf = (entry: DiagramEntry) =>
    chatEntries.findIndex((item) => item.id === entry.id) + 1;

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
  // Never cut a long description short: say how long it is as it nears the
  // limit, and refuse to send it once over, so nothing is dropped unseen.
  // Attached files count, since their text is sent with the words.
  const asked = describedAs(draft, panel.attachments);
  const nearLimit = asked.length > DIAGRAM_PROMPT_MAX * 0.8;
  const tooLong = asked.length > DIAGRAM_PROMPT_MAX;
  const picked: DiagramToolId | null = panel.detailed ? 'detailed' : null;
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

  /**
   * A new chat: what can be drawn, as cards — the tool there is, and the ones
   * on their way, marked so — and a few requests to start from.
   */
  const welcome = (
    <div className="mx-auto flex w-full max-w-[44rem] flex-col items-center gap-5 py-6 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-[var(--surface-accent-wash)]">
        <DiagramMark className="size-5 text-[var(--surface-accent)]" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 text-lg font-semibold tracking-tight">{t('diagrams.welcomeTitle')}</h3>
        <p className="m-0 max-w-[34rem] text-[13px] leading-[1.55] text-[var(--surface-fg-muted)]">
          {t('diagrams.intro')}
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-2.5 text-left sm:grid-cols-2 lg:grid-cols-3">
        {DIAGRAM_TOOLS.map((tool) => {
          const on = picked === tool.id;
          return (
            <ToolCard
              key={tool.id}
              icon={tool.icon}
              color={tool.color}
              title={t(tool.label)}
              line={t(tool.row)}
              badge={
                on ? (
                  <Check className="size-3.5 text-[var(--surface-accent)]" aria-hidden="true" />
                ) : (
                  <span className="text-[11px] text-[var(--surface-fg-muted)] tabular-nums">
                    ×{tool.cost}
                  </span>
                )
              }
              on={on}
              disabled={toolsOff || (!on && left !== null && left < tool.cost)}
              onPick={() => {
                panel.setDetailed(!on);
                focusInput();
              }}
            />
          );
        })}
        {DIAGRAM_TOOLS_SOON.map((tool) => (
          <ToolCard
            key={tool.id}
            icon={tool.icon}
            color={tool.color}
            title={t(tool.label)}
            line={t(tool.row)}
            badge={<span className={soonBadge}>{t('diagrams.soon')}</span>}
          />
        ))}
      </div>
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
            className="rounded-full border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--surface-fg-muted)] outline-none hover:bg-[var(--surface-raised-hover)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
          >
            {t(example.label)}
          </button>
        ))}
      </div>
    </div>
  );

  const noticeNote =
    limited && usage ? (
      <LimitNote usage={usage} resets={resets} onUpgrade={onUpgrade} />
    ) : notice?.kind === 'not-enough' && left !== null ? (
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3 text-xs leading-[1.5] text-[var(--surface-fg-muted)]">
        {t('diagrams.notEnough', { cost: DIAGRAM_DETAILED_COST, left })}
        <button
          type="button"
          className={cn(ghost, 'mt-1.5 -ml-2.5 text-[var(--surface-accent)]')}
          onClick={() => panel.setDetailed(false)}
        >
          {t('diagrams.useQuick')}
        </button>
      </div>
    ) : notice?.kind === 'unavailable' ? (
      <p className="m-0 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3 text-xs text-[var(--surface-fg-muted)]">
        {t('diagrams.unavailable')}
      </p>
    ) : null;

  /** The answer to one request: the diagram drawn, or being drawn, or a notice. */
  const answer = (id: string): ReactNode => {
    if (id === NOTICE_ANSWER) return noticeNote;
    if (id === RUN_ANSWER) {
      if (!run) return null;
      return (
        <DiagramCard
          label={run.description}
          lines={run.lines}
          dark={dark}
          drawStyle={drawStyle}
          top={run.status === 'running' ? <DiagramWorking run={run} /> : null}
          footer={
            run.status === 'failed' ? (
              <>
                <span className="min-w-0 flex-1 text-xs leading-[1.45] text-[var(--surface-warn)]">
                  {t(PROBLEM_KEYS[run.problem ?? 'unavailable'])}
                </span>
                <button
                  type="button"
                  className={cn(ghost, 'ml-auto shrink-0')}
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
    const version = versionOf(entry);
    const previous = previousVersion(entry, entries);
    const onBoard = isOnBoard(entry);
    // Swapping in place is offered where the version before is on the board
    // and this one is not.
    const replaces = previous && !onBoard && isOnBoard(previous) && onReplace ? previous : null;
    return (
      <div id={`diagram-${entry.id}`} className="flex min-w-0 flex-col gap-1">
        <DiagramCard
          label={entry.description}
          lines={entry.lines}
          dark={dark}
          drawStyle={drawStyle}
          top={<DiagramSummary entry={entry} />}
          compare={
            previous
              ? {
                  lines: previous.lines,
                  label: t('diagrams.version', { n: versionOf(previous) || 1 }),
                  ownLabel: t('diagrams.version', { n: version }),
                  toggle: t('diagrams.compareWith', { n: versionOf(previous) || 1 }),
                }
              : undefined
          }
          leading={
            <>
              <span className="rounded-md bg-[var(--surface-wash)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--surface-fg-muted)] tabular-nums">
                {t('diagrams.version', { n: version })}
              </span>
              {onBoard && (
                <button
                  type="button"
                  onClick={() => onShowOnBoard?.(entry)}
                  disabled={!onShowOnBoard}
                  title={t('diagrams.showOnBoard')}
                  className="inline-flex h-6 items-center gap-1.5 rounded-full bg-[var(--surface-accent-wash)] px-2 text-[11px] font-medium text-[var(--surface-fg)] outline-none hover:bg-[var(--surface-flash)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-[var(--surface-accent)]"
                  />
                  {t('diagrams.onBoard')}
                </button>
              )}
            </>
          }
          footer={
            <>
              <button
                type="button"
                className={ghost}
                disabled={running || limited}
                onClick={() => panel.startChange(entry.id)}
              >
                {t('diagrams.refine')}
              </button>
              <button
                type="button"
                className={replaces ? ghost : primary}
                onClick={() => onInsert(entry)}
              >
                {t('diagrams.insert')}
              </button>
              {replaces && (
                <button
                  type="button"
                  className={primary}
                  onClick={() => onReplace?.(entry, replaces)}
                >
                  {t('diagrams.replaceOnBoard', { n: versionOf(replaces) || 1 })}
                </button>
              )}
            </>
          }
        />
        <AnswerActions
          at={entry.createdAt}
          reaction={entry.reaction ?? null}
          onRate={(reaction) => panel.rate(entry.id, reaction)}
          onRegenerate={() => void panel.again(entry)}
          regenerateDisabled={running || limited}
          onCopy={() => copyDiagramAsPng(entry.lines, { style: drawStyle, dark })}
        />
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
        style={surfaceThemeVars(theme)}
        onClick={onClose}
        className="cf-diagram-backdrop bg-[var(--surface-backdrop)] backdrop-blur-[3px]"
      />
      <aside
        ref={setRoot}
        hidden={minimized}
        aria-label={t('diagrams.title')}
        data-testid="diagram-panel"
        style={surfaceThemeVars(theme)}
        className="cf-diagram-panel grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[14px] border border-[var(--surface-border)] bg-[var(--surface-panel)] text-[var(--surface-fg)] shadow-none"
      >
        <header className="flex items-center gap-2.5 border-b border-[var(--surface-line)] bg-[var(--surface-band)] px-4 py-3">
          {!signIn && (
            <button
              type="button"
              onClick={() => setChatsOpen((value) => !value)}
              aria-expanded={chatsOpen}
              aria-label={t('diagrams.chats')}
              title={t('diagrams.chats')}
              className={cn(ghost, 'cf-diagram-sidebar-toggle -ml-1.5 size-7 justify-center px-0')}
            >
              <PanelLeft className="size-4" aria-hidden="true" />
            </button>
          )}
          <img src="/brand/apple-touch-icon.png" alt="" className="size-5 shrink-0 rounded-[5px]" />
          <h2 className="m-0 min-w-0 truncate text-sm font-semibold">{t('diagrams.title')}</h2>
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              aria-label={t('diagrams.minimize')}
              title={t('diagrams.minimize')}
              className={cn(ghost, 'ml-auto size-7 justify-center px-0')}
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('diagrams.close')}
            title={t('diagrams.close')}
            className={cn(ghost, 'size-7 justify-center px-0', !onMinimize && 'ml-auto')}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="relative flex min-h-0">
          {!signIn && (
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
              onUpgrade={onUpgrade}
              open={chatsOpen}
              onDismiss={() => setChatsOpen(false)}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              {signIn ? (
                <div className="p-3.5">
                  <SignInNote onSignIn={onSignIn} />
                </div>
              ) : (
                <DiagramThread
                  entries={chatEntries}
                  run={shownRun}
                  notice={Boolean(noticeNote)}
                  welcome={welcome}
                  answer={answer}
                  request={request}
                />
              )}
            </div>

            {!signIn && (
              <div className="mx-auto w-full max-w-[60rem] px-4 pb-4">
                {changingEntry && (
                  <div className="mb-2 flex items-start gap-2 text-xs leading-[1.45] text-[var(--surface-fg-muted)]">
                    <span className="shrink-0 font-medium text-[var(--surface-accent)]">
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
                  <p
                    role="status"
                    className="m-0 mb-2 text-xs leading-[1.45] text-[var(--surface-warn)]"
                  >
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
                      panel.setDetailed(false);
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
                          : t('diagrams.placeholder')
                    }
                    infoBar={
                      stripShown
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
                        onPick={(id) => panel.setDetailed(id === 'detailed')}
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
                          tooLong
                            ? 'text-[var(--surface-danger)]'
                            : 'text-[var(--surface-fg-faint)]',
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
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

/**
 * One thing a new chat can draw, as a card: the tool's icon in its own muted
 * colour on a neutral tile, its name with a badge at the end, and one line
 * under the name. The card itself stays neutral; the colour is the icon's
 * alone. Every card is laid out alike; one that is not ready yet is a plain
 * card rather than a button, with Soon as its badge.
 */
function ToolCard({
  icon: Icon,
  color,
  title,
  line,
  badge,
  on = false,
  disabled = false,
  onPick,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  line: string;
  badge: ReactNode;
  on?: boolean;
  disabled?: boolean;
  /** Left out for a tool on its way. */
  onPick?: () => void;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] text-[var(--tool)]"
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] leading-5 font-medium text-[var(--surface-fg)]">
            {title}
          </span>
          <span className="flex shrink-0 items-center">{badge}</span>
        </span>
        <span className="text-xs leading-[1.45] text-[var(--surface-fg-muted)]">{line}</span>
      </span>
    </>
  );
  const card =
    'flex min-h-[84px] items-start gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3 text-left';
  const style = { '--tool': color } as CSSProperties;
  if (!onPick) {
    return (
      <div aria-disabled="true" className={card} style={style}>
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
      style={style}
      className={cn(
        card,
        'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-45',
        on
          ? 'border-[var(--surface-accent)] bg-[var(--surface-raised)]'
          : 'hover:border-[var(--surface-fg-faint)] hover:bg-[var(--surface-raised)]',
      )}
    >
      {body}
    </button>
  );
}

/** A diagram as an answer: how it went, the drawing, and what can be done with it. */
function DiagramCard({
  label,
  lines,
  dark,
  drawStyle,
  top,
  compare,
  leading,
  footer,
}: {
  /** The words it was drawn from, as the drawing's accessible name. */
  label: string;
  lines: readonly string[];
  dark: boolean;
  drawStyle: DiagramStyle | undefined;
  /** Above the drawing: what is happening, or once done, how it went. */
  top: ReactNode;
  /** The version before, to draw beside this one on asking. */
  compare?: { lines: readonly string[]; label: string; ownLabel: string; toggle: string };
  /** At the footer's start: which version it is, whether it is on the board. */
  leading?: ReactNode;
  footer: ReactNode;
}) {
  const [comparing, setComparing] = useState(false);
  const side = compare && comparing;
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)]">
      {top}
      {/* Nothing to draw until the first box arrives; the steps above say what is happening. */}
      {boxesIn(lines) > 0 &&
        (side ? (
          <div className="grid grid-cols-2 gap-px bg-[var(--surface-line)]">
            {[
              { lines: compare.lines, caption: compare.label },
              { lines, caption: compare.ownLabel },
            ].map((pane) => (
              <figure key={pane.caption} className="m-0 min-w-0 bg-[var(--surface-input)]">
                <figcaption className="px-3 pt-2 text-[11px] font-medium text-[var(--surface-fg-muted)]">
                  {pane.caption}
                </figcaption>
                <DiagramPreview
                  lines={pane.lines}
                  dark={dark}
                  label={`${pane.caption}: ${label}`}
                  drawStyle={drawStyle}
                />
              </figure>
            ))}
          </div>
        ) : (
          <div className="bg-[var(--surface-input)]">
            <DiagramPreview lines={lines} dark={dark} label={label} drawStyle={drawStyle} />
          </div>
        ))}
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-[var(--surface-line)] px-2.5 py-2">
          {(leading || compare) && (
            <div className="mr-auto flex min-w-0 items-center gap-1.5">
              {leading}
              {compare && (
                <button
                  type="button"
                  aria-pressed={comparing}
                  onClick={() => setComparing((value) => !value)}
                  className={cn(
                    'inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]',
                    comparing
                      ? 'bg-[var(--surface-raised)] text-[var(--surface-fg)]'
                      : 'text-[var(--surface-fg-muted)] hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)]',
                  )}
                >
                  {compare.toggle}
                </button>
              )}
            </div>
          )}
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
      style={surfaceThemeVars(theme)}
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
  onUpgrade,
}: {
  usage: DiagramUsage;
  resets: string;
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
      <button type="button" className={primary} onClick={onUpgrade}>
        {t('diagrams.upgrade')}
      </button>
    </div>
  );
}

function SignInNote({ onSignIn }: { onSignIn: () => void }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3.5">
      <h3 className="m-0 mb-1 text-[13px] font-semibold">{t('diagrams.signInTitle')}</h3>
      <p className="m-0 mb-2.5 text-xs leading-[1.5] text-[var(--surface-fg-muted)]">
        {t('diagrams.signInBody', { free: PLAN_ALLOWANCES.free.diagramsPerMonth })}
      </p>
      <button type="button" className={primary} onClick={onSignIn}>
        <LogIn className="size-3.5" aria-hidden="true" />
        {t('diagrams.signIn')}
      </button>
    </div>
  );
}
