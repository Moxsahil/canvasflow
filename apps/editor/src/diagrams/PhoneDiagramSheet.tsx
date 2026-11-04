import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Network, Waypoints, type LucideIcon } from 'lucide-react';
import { DIAGRAM_PROMPT_MAX, PLAN_ALLOWANCES, PLAN_NAMES } from '@canvasflow/types';
import type { DiagramStyle } from '@canvasflow/canvas-engine';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { formatShortDate, useT } from '../i18n';
import { Icon } from '../settings/phone/icons';
import { windowThemeVars, type SurfaceTheme } from '../ui/surface-palette';
import { DiagramPreview } from './DiagramPreview';
import { DIAGRAM_TOOLS, type DiagramToolId } from './DiagramTools';
import { EXAMPLES, FILE_ACCEPT, NEXT_PLAN, PROBLEM_KEYS, kindOf } from './DiagramPanel';
import { useSteps } from './DiagramWork';
import { copyDiagramAsPng } from './copy-diagram';
import { formatRelative } from '../settings/account-format';
import { previousVersion, type DiagramEntry } from './diagram-history';
import { progressOf } from './diagram-progress';
import { describedAs, type DiagramPanelState, type DiagramRun } from './useDiagramPanel';
import '../settings/phone/phone-settings.css';

/** How far a drag on the grip pulls the sheet before it is put away. */
const DISMISS_DRAG = 110;

/**
 * AI diagrams on a phone: one tall sheet with the kind of diagram along its
 * top, the conversation in the middle and the box to describe it at the foot.
 * The same panel as the desktop's — the same tools, chats, versions, counts
 * and refusals — set out for a thumb. Put away, it goes on drawing as a pill
 * above the toolbar.
 */
export function PhoneDiagramSheet({
  panel,
  theme,
  canDraw,
  onInsert,
  onSignIn,
  onUpgrade,
  onClose,
  minimized,
  onMinimize,
  onRestore,
  boardShapeIds,
  onShowOnBoard,
  onReplace,
  drawStyle,
  container,
}: {
  panel: DiagramPanelState;
  theme: SurfaceTheme;
  canDraw: boolean;
  onInsert: (entry: DiagramEntry) => void;
  onSignIn: () => void;
  onUpgrade: () => void;
  onClose: () => void;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  boardShapeIds?: ReadonlySet<string>;
  onShowOnBoard?: (entry: DiagramEntry) => void;
  onReplace?: (entry: DiagramEntry, previous: DiagramEntry) => void;
  drawStyle?: DiagramStyle;
  container: HTMLElement | null;
}) {
  const t = useT();
  const { entries, run, running, usage, notice, draft, changing } = panel;
  const [drag, setDrag] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const dragStart = useRef<number | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const dark = theme === 'dark';
  const signIn = !canDraw || notice?.kind === 'sign-in';
  const limited = notice?.kind === 'limit';
  const chatEntries = entries.filter((entry) => entry.chatId === panel.chat);
  const shownRun = run && run.chatId === panel.chat ? run : null;
  const picked: DiagramToolId | null = panel.mindMap
    ? 'mindmap'
    : panel.detailed
      ? 'detailed'
      : null;
  const asked = describedAs(draft, panel.attachments);
  const tooLong = asked.length > DIAGRAM_PROMPT_MAX;
  const changingEntry = changing ? entries.find((entry) => entry.id === changing) : undefined;
  const isOnBoard = (entry: DiagramEntry) =>
    Boolean(boardShapeIds && entry.inserted?.some((id) => boardShapeIds.has(id)));
  const versionOf = (entry: DiagramEntry) =>
    chatEntries.findIndex((item) => item.id === entry.id) + 1;
  // Put away, if there is anything to come back to; otherwise closed.
  const away = () => (chatEntries.length > 0 || running ? onMinimize() : onClose());

  // The newest message in view as it arrives.
  const lineCount = shownRun?.lines.length ?? 0;
  useEffect(() => {
    const scroller = body.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [chatEntries.length, lineCount, panel.chat, minimized]);

  // The box shrinks back once what was typed has gone, sent or cleared.
  useEffect(() => {
    if (draft === '' && input.current) input.current.style.height = '';
  }, [draft]);

  useEffect(() => {
    if (minimized) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') away();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const send = () => {
    if (!asked.trim() || tooLong || running || limited) return;
    void panel.generate();
  };

  const addFiles = async (files: readonly File[]) => {
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
    input.current?.focus();
  };

  const stepsOf = useSteps();
  const where = container ?? document.querySelector<HTMLElement>('.cf-editor') ?? document.body;

  if (minimized) {
    const now = shownRun ?? run;
    const label =
      now?.status === 'running'
        ? stepsOf(
            progressOf(now.lines, now.fixing),
            Boolean(now.changeOf),
            progressOf(now.lines, now.fixing).phase,
            now.detailed,
          ).at(-1)?.label
        : null;
    return createPortal(
      <div className="cf-ai-pill" role="status" data-testid="phone-ai-pill">
        {label ? <span className="spin" /> : <Icon name="spark" size={16} />}
        <span className="tx">{label ? `${label}…` : t('ps.ai.ready')}</span>
        <button type="button" onClick={onRestore} data-testid="phone-ai-open">
          {label ? t('ps.ai.show') : t('ps.ai.open')}
        </button>
        <button type="button" className="x" onClick={onClose} aria-label={t('diagrams.close')}>
          <Icon name="x" size={13} />
        </button>
      </div>,
      where,
    );
  }

  const resets = usage ? formatShortDate(new Date(usage.resetsAt)) : '';
  const left = usage ? Math.max(usage.limit - usage.used, 0) : null;
  const nextPlan = usage ? NEXT_PLAN[usage.plan] : undefined;
  const isStart = !signIn && chatEntries.length === 0 && !shownRun && !notice;
  const toolIcon: Record<DiagramToolId | 'quick', LucideIcon> = {
    quick: Network,
    detailed: Network,
    mindmap: Waypoints,
  };
  const ToolIcon = toolIcon[picked ?? 'quick'];
  const toolLabel = picked
    ? t(DIAGRAM_TOOLS.find((tool) => tool.id === picked)!.label)
    : t('ps.ai.quick');

  return createPortal(
    <>
      <div className="cf-ps-scrim" onClick={away} aria-hidden="true" />
      <section
        className={cn('cf-ps ai', theme === 'light' && 'light', drag ? 'dragging' : 'settle')}
        style={{
          ...windowThemeVars(theme),
          ...(drag ? { transform: `translateY(${drag}px)` } : {}),
          ...({ '--diagram-link': dark ? '#4d84fd' : '#135dfc' } as CSSProperties),
        }}
        role="dialog"
        aria-modal="true"
        aria-label={t('ps.ai.title')}
        data-testid="phone-ai"
      >
        <div
          className="st-top"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            setDrag(Math.max(0, event.clientY - dragStart.current));
          }}
          onPointerUp={() => {
            if (dragStart.current === null) return;
            dragStart.current = null;
            if (drag > DISMISS_DRAG) away();
            setDrag(0);
          }}
          onPointerCancel={() => {
            dragStart.current = null;
            setDrag(0);
          }}
        >
          <div className="grab" />
          <div className="st-bar">
            <button
              type="button"
              className="ai-new"
              onClick={() => panel.showChat(null)}
              disabled={running}
              data-testid="phone-ai-new"
            >
              <Icon name="newchat" size={16} />
              {t('diagrams.newChat')}
            </button>
            <span className="st-bar-t" style={{ opacity: 1, transform: 'none' }}>
              {t('ps.ai.title')}
            </span>
            <button
              type="button"
              className="st-ib r"
              onClick={away}
              aria-label={t('diagrams.minimize')}
              data-testid="phone-ai-min"
            >
              <Icon name="chevdown" size={17} />
            </button>
          </div>
        </div>

        <div className="st-body" ref={body}>
          {signIn ? (
            <NoticeCard
              title={t('diagrams.signInTitle')}
              body={t('diagrams.signInBody', { free: PLAN_ALLOWANCES.free.diagramsPerMonth })}
              action={t('diagrams.signIn')}
              onAction={onSignIn}
            />
          ) : isStart ? (
            <>
              <div className="ai-hero">
                <div className="ai-orb">
                  <Icon name="spark" size={24} />
                </div>
                <b>{t('diagrams.welcomeTitle')}</b>
                <span>
                  {picked === 'mindmap'
                    ? t('diagrams.mindmapHint')
                    : picked === 'detailed'
                      ? t('diagrams.detailedHint', { cost: DIAGRAM_TOOLS[0]!.cost })
                      : t('diagrams.intro')}
                </span>
              </div>
              <div className="ai-sugs">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    className="ai-sug"
                    onClick={() => {
                      panel.setDraft(t(example.text));
                      input.current?.focus();
                    }}
                  >
                    <ToolIcon aria-hidden="true" className="i" />
                    <span>{t(example.label)}</span>
                    <Icon name="chevright" size={16} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="ai-thread">
              {chatEntries.map((entry) => {
                const previous = previousVersion(entry, entries);
                const replaces =
                  previous && !isOnBoard(entry) && isOnBoard(previous) && onReplace
                    ? previous
                    : null;
                const progress = progressOf(entry.lines, entry.fixed ?? 0);
                const drew =
                  progress.topics.length > 0
                    ? t('diagrams.topics', { count: progress.topics.length })
                    : `${t('diagrams.boxes', { count: progress.boxes.length })} · ${t('diagrams.arrows', { count: progress.arrows })}`;
                return (
                  <div key={entry.id} className="ai-a">
                    <Request
                      text={entry.description}
                      change={Boolean(entry.changeOf)}
                      at={entry.createdAt}
                      busy={running || limited}
                      onRetry={() => void panel.again(entry)}
                      onEdit={() => {
                        panel.setDraft(entry.description);
                        if (entry.changeOf) panel.startChange(entry.changeOf);
                        else panel.cancelChange();
                        input.current?.focus();
                      }}
                    />
                    {isOnBoard(entry) && (
                      <button
                        type="button"
                        className="ai-done-note"
                        onClick={() => onShowOnBoard?.(entry)}
                      >
                        <Icon name="check" size={15} />
                        {t('diagrams.onBoard')}
                      </button>
                    )}
                    <div className="st-card ai-res">
                      <div className="ai-prev">
                        <DiagramPreview
                          lines={entry.lines}
                          dark={dark}
                          label={entry.description}
                          drawStyle={drawStyle}
                          fit="fill"
                        />
                      </div>
                      <div className="ai-meta">
                        <b>{t('diagrams.version', { n: versionOf(entry) })}</b>
                        <span>{drew}</span>
                      </div>
                      <div className="ai-acts">
                        {replaces ? (
                          <button
                            type="button"
                            className="st-btn"
                            onClick={() => onReplace?.(entry, replaces)}
                          >
                            <Icon name="plus" size={17} />
                            {t('ps.ai.replace', { n: versionOf(replaces) || 1 })}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="st-btn"
                            onClick={() => onInsert(entry)}
                            data-testid="phone-ai-insert"
                          >
                            <Icon name="plus" size={17} />
                            {isOnBoard(entry) ? t('ps.ai.insertAgain') : t('diagrams.insert')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="st-btn ghost"
                          onClick={() => void panel.again(entry)}
                          disabled={running || limited}
                        >
                          <Icon name="refresh" size={17} />
                          {t('diagrams.regenerate')}
                        </button>
                        <button
                          type="button"
                          className="st-btn ghost"
                          onClick={() => {
                            panel.startChange(entry.id);
                            input.current?.focus();
                          }}
                          disabled={running || limited}
                        >
                          <Icon name="pencil" size={17} />
                          {t('diagrams.refine')}
                        </button>
                      </div>
                    </div>
                    <Answer
                      at={entry.createdAt}
                      reaction={entry.reaction ?? null}
                      onRate={(reaction) => panel.rate(entry.id, reaction)}
                      onCopy={() => copyDiagramAsPng(entry.lines, { style: drawStyle, dark })}
                    />
                  </div>
                );
              })}
              {shownRun && <RunCard run={shownRun} onRetry={panel.retry} />}
              {notice && (
                <NoticeCard
                  title={
                    notice.kind === 'limit'
                      ? t('diagrams.limitTitle', { limit: usage?.limit ?? 0 })
                      : notice.kind === 'not-enough'
                        ? t('diagrams.notEnough', {
                            cost: DIAGRAM_TOOLS[0]!.cost,
                            left: left ?? 0,
                          })
                        : t('diagrams.unavailable')
                  }
                  body={
                    notice.kind === 'limit'
                      ? t('diagrams.limitBody', {
                          date: resets,
                          pro: PLAN_ALLOWANCES.pro.diagramsPerMonth,
                          team: PLAN_ALLOWANCES.team.diagramsPerMonth,
                        })
                      : null
                  }
                  action={
                    notice.kind === 'limit' && nextPlan
                      ? t('diagrams.upgradeTo', { plan: PLAN_NAMES[nextPlan] })
                      : notice.kind === 'not-enough'
                        ? t('diagrams.useQuick')
                        : null
                  }
                  onAction={
                    notice.kind === 'limit'
                      ? onUpgrade
                      : () => {
                          panel.setTool(null);
                          void panel.generate();
                        }
                  }
                />
              )}
            </div>
          )}
        </div>

        {!signIn && (
          <div className="ai-comp">
            {changingEntry && (
              <div className="ai-ctx">
                <Icon name="pencil" size={13} />
                {`${t('diagrams.changing')} ${t('diagrams.version', { n: versionOf(changingEntry) })}`}
                <button
                  type="button"
                  onClick={panel.cancelChange}
                  aria-label={t('diagrams.cancelChange')}
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
            )}
            {panel.attachments.map((attached) => (
              <div key={attached.id} className="ai-ctx">
                <Icon name="note" size={13} />
                {attached.filename}
                <button
                  type="button"
                  onClick={() => panel.detach(attached.id)}
                  aria-label={t('diagrams.removeFile')}
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
            {toolsOpen && (
              <>
                <div
                  className="ai-tools-scrim"
                  onClick={() => setToolsOpen(false)}
                  aria-hidden="true"
                />
                <div className="ai-tools" role="radiogroup" aria-label={t('diagrams.tools')}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={picked === null}
                    className={cn('ai-tool', picked === null && 'on')}
                    disabled={running || limited}
                    onClick={() => {
                      panel.setTool(null);
                      setToolsOpen(false);
                    }}
                    data-testid="phone-ai-tool-quick"
                  >
                    <Network aria-hidden="true" />
                    {t('ps.ai.quick')}
                  </button>
                  {DIAGRAM_TOOLS.map((tool) => {
                    const ToolGlyph = tool.icon;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        role="radio"
                        aria-checked={picked === tool.id}
                        className={cn('ai-tool', picked === tool.id && 'on')}
                        disabled={running || limited}
                        onClick={() => {
                          panel.setTool(tool.id);
                          setToolsOpen(false);
                        }}
                        data-testid={`phone-ai-tool-${tool.id}`}
                      >
                        <ToolGlyph aria-hidden="true" />
                        {t(tool.label)}
                        {tool.cost > 1 && <em>×{tool.cost}</em>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <div className="ai-box">
              <textarea
                ref={input}
                rows={1}
                value={draft}
                disabled={limited}
                placeholder={
                  limited
                    ? t('diagrams.placeholderLimit', { date: resets })
                    : changing
                      ? t('diagrams.placeholderChange')
                      : picked === 'mindmap'
                        ? t('diagrams.placeholderMindmap')
                        : t('diagrams.placeholder')
                }
                aria-label={t('diagrams.describe')}
                onChange={(event) => {
                  panel.setDraft(event.target.value);
                  event.target.style.height = 'auto';
                  event.target.style.height = `${Math.min(120, event.target.scrollHeight)}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
                data-testid="phone-ai-input"
              />
              <div className="ai-row">
                <button
                  type="button"
                  className="ai-ib"
                  onClick={() => file.current?.click()}
                  disabled={limited}
                  aria-label={t('diagrams.attach')}
                >
                  <Icon name="plus" size={17} />
                </button>
                <input
                  ref={file}
                  type="file"
                  accept={FILE_ACCEPT}
                  multiple
                  hidden
                  onChange={(event) => {
                    const picked = Array.from(event.target.files ?? []);
                    event.target.value = '';
                    void addFiles(picked);
                  }}
                />
                <button
                  type="button"
                  className="ai-type"
                  onClick={() => setToolsOpen((open) => !open)}
                  aria-expanded={toolsOpen}
                  aria-label={t('diagrams.pickTool')}
                  disabled={running || limited}
                  data-testid="phone-ai-tool"
                >
                  <ToolIcon aria-hidden="true" className="i" />
                  {toolLabel}
                  <Icon name="chevdown" size={13} />
                </button>
                <span className="grow" />
                {tooLong && (
                  <span className="ai-len">
                    {t('diagrams.length', { used: asked.length, max: DIAGRAM_PROMPT_MAX })}
                  </span>
                )}
                {running ? (
                  <button
                    type="button"
                    className="ai-send"
                    onClick={panel.stop}
                    aria-label={t('diagrams.stop')}
                  >
                    <span className="ai-stop" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ai-send"
                    onClick={send}
                    disabled={!asked.trim() || tooLong || limited}
                    aria-label={t('diagrams.send')}
                    data-testid="phone-ai-send"
                  >
                    <Icon name="arrowup" size={19} />
                  </button>
                )}
              </div>
            </div>
            <div className="ai-note">
              {usage && left !== null
                ? `${t('ps.ai.note')} · ${t('diagrams.left', { left, limit: usage.limit })}`
                : t('ps.ai.note')}
            </div>
          </div>
        )}
      </section>
    </>,
    where,
  );
}

/** How long ago, in words, for the line under a message. */
function ago(at: number): string {
  return formatRelative(new Date(at).toISOString());
}

/** A long request is folded to a few lines until asked to show it all. */
const FOLD_AT = 220;

/** Briefly says "Copied" once a copy has gone through. */
function useCopied(): [boolean, (copy: () => Promise<void>) => void] {
  const [copied, setCopied] = useState(false);
  const run = (copy: () => Promise<void>) => {
    void copy().then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };
  return [copied, run];
}

/**
 * What was asked, as a bubble, folded when long — with the desktop's actions
 * under it: when, ask again, edit, copy.
 */
function Request({
  text,
  change,
  at,
  busy,
  onRetry,
  onEdit,
}: {
  text: string;
  change: boolean;
  at: number;
  busy: boolean;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const long = text.length > FOLD_AT;
  const [open, setOpen] = useState(false);
  const [copied, copy] = useCopied();
  return (
    <div className="ai-req">
      <div className="ai-u">
        {change && <small>{t('diagrams.changeLabel')}</small>}
        <span className={cn('ai-u-text', long && !open && 'folded')}>{text}</span>
      </div>
      {long && (
        <button type="button" className="ai-more" onClick={() => setOpen((was) => !was)}>
          {open ? t('diagrams.showLess') : t('diagrams.showMore')}
          <Icon name={open ? 'chevup' : 'chevdown'} size={13} />
        </button>
      )}
      <div className="ai-msg-acts end">
        <span className="when">{ago(at)}</span>
        <button type="button" onClick={onRetry} disabled={busy} aria-label={t('diagrams.retry')}>
          <Icon name="refresh" size={16} />
        </button>
        <button type="button" onClick={onEdit} disabled={busy} aria-label={t('diagrams.edit')}>
          <Icon name="pencil" size={16} />
        </button>
        <button
          type="button"
          onClick={() => copy(() => navigator.clipboard.writeText(text))}
          aria-label={copied ? t('diagrams.copied') : t('diagrams.copyText')}
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} />
        </button>
      </div>
    </div>
  );
}

/** Under a diagram, as on the desktop: copy it as a picture, rate it, and when. */
function Answer({
  at,
  reaction,
  onRate,
  onCopy,
}: {
  at: number;
  reaction: 'up' | 'down' | null;
  onRate: (reaction: 'up' | 'down' | null) => void;
  onCopy: () => Promise<void>;
}) {
  const t = useT();
  const [copied, copy] = useCopied();
  return (
    <div className="ai-msg-acts">
      <button
        type="button"
        onClick={() => copy(onCopy)}
        aria-label={copied ? t('diagrams.copiedImage') : t('diagrams.copyImage')}
      >
        <Icon name={copied ? 'check' : 'copy'} size={16} />
      </button>
      <button
        type="button"
        className={cn(reaction === 'up' && 'on')}
        aria-pressed={reaction === 'up'}
        onClick={() => onRate(reaction === 'up' ? null : 'up')}
        aria-label={t('diagrams.helpful')}
      >
        <Icon name="thumbup" size={16} />
      </button>
      <button
        type="button"
        className={cn(reaction === 'down' && 'on')}
        aria-pressed={reaction === 'down'}
        onClick={() => onRate(reaction === 'down' ? null : 'down')}
        aria-label={t('diagrams.unhelpful')}
      >
        <Icon name="thumbdown" size={16} />
      </button>
      <span className="when">{ago(at)}</span>
    </div>
  );
}

/** The diagram being drawn: what was asked, then its steps as they happen. */
function RunCard({ run, onRetry }: { run: DiagramRun; onRetry: (description: string) => void }) {
  const t = useT();
  const stepsOf = useSteps();
  const progress = progressOf(run.lines, run.fixing);
  const live = run.status === 'running';
  const steps = stepsOf(
    progress,
    Boolean(run.changeOf),
    live ? progress.phase : null,
    run.detailed,
  );
  return (
    <div className="ai-a" aria-live="polite">
      <div className="ai-u">{run.description}</div>
      <div className="ai-steps">
        {steps.map((step, index) => {
          const now = live && index === steps.length - 1;
          return (
            <div key={step.phase} className={cn('ai-step', !now && 'done')}>
              <span className="dot">
                {now ? <span className="spin" /> : <Icon name="check" size={11} />}
              </span>
              <span>
                {step.label}
                {step.detail && <small>{step.detail}</small>}
              </span>
            </div>
          );
        })}
      </div>
      {run.status === 'failed' && (
        <div className="st-card ai-fail">
          <p>{t(PROBLEM_KEYS[run.problem ?? 'unavailable'])}</p>
          <button type="button" className="st-btn ghost" onClick={() => onRetry(run.description)}>
            {t('diagrams.tryAgain')}
          </button>
        </div>
      )}
    </div>
  );
}

function NoticeCard({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string | null;
  action: string | null;
  onAction: () => void;
}) {
  return (
    <div className="st-card live-card">
      <span className="pulse">
        <Icon name="spark" size={26} />
      </span>
      <b>{title}</b>
      {body && <p>{body}</p>}
      {action && (
        <button type="button" className="st-btn" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
