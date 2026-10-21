import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUp, LogIn, Square, X } from 'lucide-react';
import {
  DIAGRAM_DETAILED_COST,
  DIAGRAM_PROMPT_MAX,
  PLAN_ALLOWANCES,
  type DiagramUsage,
} from '@canvasflow/types';
import { cn } from '@/lib/utils';
import { formatShortDate, useT, type WordKey } from '../i18n';
import { surfaceThemeVars, type SurfaceTheme } from '../ui/surface-palette';
import { DiagramMark } from './DiagramMark';
import type { DiagramStyle } from '@canvasflow/canvas-engine';
import { DiagramPreview } from './DiagramPreview';
import { DiagramSummary, DiagramWorking } from './DiagramWork';
import type { DiagramEntry } from './diagram-history';
import type { DiagramPanelState, DiagramProblem } from './useDiagramPanel';

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
  /** How the board would draw the diagram: the style panel's current settings. */
  drawStyle?: DiagramStyle;
}) {
  const t = useT();
  const { entries, run, running, usage, notice, draft, changing } = panel;
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const dark = theme === 'dark';
  const signIn = !canDraw || notice?.kind === 'sign-in';
  const limited = notice?.kind === 'limit';
  const changingEntry = changing ? entries.find((entry) => entry.id === changing) : undefined;

  // The newest card is the one being looked at.
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries.length, run?.lines.length, run?.status, notice?.kind]);

  useEffect(() => {
    if (!signIn) input.current?.focus();
  }, [signIn, changing]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
    if (event.key === 'Escape' && changing) {
      event.preventDefault();
      panel.cancelChange();
    }
  };

  const resets = usage ? formatShortDate(new Date(usage.resetsAt)) : '';
  const left = usage ? Math.max(usage.limit - usage.used, 0) : null;
  // Never cut a long description short: say how long it is as it nears the
  // limit, and refuse to send it once over, so nothing is dropped unseen.
  const nearLimit = draft.length > DIAGRAM_PROMPT_MAX * 0.8;
  const tooLong = draft.length > DIAGRAM_PROMPT_MAX;
  const send = () => {
    if (!tooLong) void panel.generate();
  };

  return (
    <aside
      aria-label={t('diagrams.title')}
      data-testid="diagram-panel"
      style={surfaceThemeVars(theme)}
      className="cf-diagram-panel grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[14px] border border-[var(--surface-border)] bg-[var(--surface-panel)] text-[var(--surface-fg)] shadow-none"
    >
      <header className="flex items-center gap-2.5 border-b border-[var(--surface-line)] bg-[var(--surface-band)] px-4 py-3">
        <DiagramMark className="size-4 text-[var(--surface-accent)]" />
        <h2 className="m-0 min-w-0 truncate text-sm font-semibold">{t('diagrams.title')}</h2>
        {!signIn && left !== null && usage && (
          <span className="ml-auto shrink-0 text-xs whitespace-nowrap text-[var(--surface-fg-faint)] tabular-nums">
            {t('diagrams.left', { left, limit: usage.limit })}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('diagrams.close')}
          className={cn(ghost, 'size-7 justify-center px-0', (signIn || !usage) && 'ml-auto')}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>

      <div ref={list} className="flex flex-col gap-3 overflow-y-auto p-3.5">
        {signIn ? (
          <SignInNote onSignIn={onSignIn} />
        ) : (
          <>
            {entries.length === 0 && !run && (
              <div>
                <p className="m-0 text-[12.5px] leading-[1.55] text-[var(--surface-fg-muted)]">
                  {t('diagrams.intro')}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example.label}
                      type="button"
                      onClick={() => {
                        panel.setDraft(t(example.text));
                        input.current?.focus();
                      }}
                      className="rounded-full border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--surface-fg-muted)] outline-none hover:bg-[var(--surface-raised-hover)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
                    >
                      {t(example.label)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entries.map((entry) => (
              <Exchange
                key={entry.id}
                description={entry.description}
                change={Boolean(entry.changeOf)}
                lines={entry.lines}
                dark={dark}
                drawStyle={drawStyle}
                top={<DiagramSummary entry={entry} />}
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
                    <button type="button" className={primary} onClick={() => onInsert(entry)}>
                      {t('diagrams.insert')}
                    </button>
                  </>
                }
              />
            ))}

            {run && (
              <Exchange
                description={run.description}
                change={Boolean(run.changeOf)}
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
                          panel.setDraft(run.description);
                          panel.dismissRun();
                          input.current?.focus();
                        }}
                      >
                        {t('diagrams.tryAgain')}
                      </button>
                    </>
                  ) : null
                }
              />
            )}

            {limited && usage && <LimitNote usage={usage} resets={resets} onUpgrade={onUpgrade} />}
            {notice?.kind === 'not-enough' && left !== null && (
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
            )}
            {notice?.kind === 'unavailable' && (
              <p className="m-0 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3 text-xs text-[var(--surface-fg-muted)]">
                {t('diagrams.unavailable')}
              </p>
            )}
          </>
        )}
      </div>

      {!signIn && (
        <div className="border-t border-[var(--surface-line)] p-2.5">
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
          <div
            className={cn(
              'rounded-xl border bg-[var(--surface-input)] transition-colors',
              tooLong
                ? 'border-[var(--surface-danger)]'
                : limited
                  ? 'border-[var(--surface-border)]'
                  : 'border-[var(--surface-border)] focus-within:border-[var(--surface-accent)] focus-within:ring-3 focus-within:ring-[var(--surface-accent-wash)]',
            )}
          >
            <div className="flex items-end gap-2 py-2 pr-2 pl-3">
              <textarea
                ref={input}
                id="diagram-description"
                rows={2}
                value={draft}
                disabled={limited}
                onChange={(event) => panel.setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                aria-label={t('diagrams.describe')}
                aria-describedby="diagram-length"
                placeholder={
                  limited
                    ? t('diagrams.placeholderLimit', { date: resets })
                    : changingEntry
                      ? t('diagrams.placeholderChange')
                      : t('diagrams.placeholder')
                }
                className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent p-0 text-[12.5px] leading-[1.5] text-[var(--surface-fg)] outline-none placeholder:text-[var(--surface-fg-faint)] disabled:cursor-not-allowed"
              />
              {running ? (
                <button
                  type="button"
                  onClick={panel.stop}
                  aria-label={t('diagrams.stop')}
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-raised)] text-[var(--surface-fg)] outline-none hover:bg-[var(--surface-raised-hover)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
                >
                  <Square className="size-3.5" fill="currentColor" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={send}
                  disabled={limited || tooLong || draft.trim().length < 3}
                  aria-label={t('diagrams.send')}
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-accent)] text-[var(--surface-on-accent)] outline-none hover:bg-[var(--surface-accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:ring-offset-1 disabled:bg-[var(--surface-wash)] disabled:text-[var(--surface-fg-faint)]"
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--surface-line)] px-2 py-1.5">
              <div
                role="radiogroup"
                aria-label={t('diagrams.mode')}
                className="inline-flex rounded-md bg-[var(--surface-wash)] p-0.5"
              >
                {(
                  [
                    { value: false, label: t('diagrams.quick'), hint: t('diagrams.quickHint') },
                    {
                      value: true,
                      label: t('diagrams.detailed'),
                      hint: t('diagrams.detailedHint', { cost: DIAGRAM_DETAILED_COST }),
                    },
                  ] as const
                ).map((option) => {
                  const on = panel.detailed === option.value;
                  const unaffordable =
                    option.value && left !== null && left < DIAGRAM_DETAILED_COST;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      title={option.hint}
                      disabled={running || (unaffordable && !on)}
                      onClick={() => panel.setDetailed(option.value)}
                      className={cn(
                        'rounded px-2 py-0.5 text-[11.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-45',
                        on
                          ? 'bg-[var(--surface-thumb)] text-[var(--surface-fg)] shadow-[var(--surface-thumb-shadow)]'
                          : 'text-[var(--surface-fg-muted)] hover:text-[var(--surface-fg)]',
                      )}
                    >
                      {option.label}
                      {option.value && (
                        <span className="ml-1 font-normal text-[var(--surface-fg-faint)] tabular-nums">
                          ×{DIAGRAM_DETAILED_COST}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <span
                id="diagram-length"
                className={cn(
                  'ml-auto text-[11px] tabular-nums',
                  tooLong ? 'text-[var(--surface-danger)]' : 'text-[var(--surface-fg-faint)]',
                  !nearLimit && 'sr-only',
                )}
              >
                {tooLong
                  ? t('diagrams.tooLong', { count: draft.length - DIAGRAM_PROMPT_MAX })
                  : t('diagrams.length', {
                      used: draft.length.toLocaleString(),
                      max: DIAGRAM_PROMPT_MAX.toLocaleString(),
                    })}
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

/** One request and its answer: the words asked, then the diagram drawn from them. */
function Exchange({
  description,
  change,
  lines,
  dark,
  drawStyle,
  top,
  footer,
}: {
  description: string;
  change: boolean;
  lines: readonly string[];
  dark: boolean;
  drawStyle: DiagramStyle | undefined;
  /** Above the drawing: what is happening, or once done, how it went. */
  top: ReactNode;
  footer: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="max-w-[85%] self-end rounded-[12px_12px_4px_12px] bg-[var(--surface-accent-wash)] px-2.5 py-2 text-[12.5px] leading-[1.45] whitespace-pre-wrap [overflow-wrap:anywhere]">
        {change && (
          <span className="mb-0.5 block text-[11px] font-medium text-[var(--surface-accent)]">
            {t('diagrams.changeLabel')}
          </span>
        )}
        {description}
      </div>
      <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)]">
        {top}
        {/* Nothing to draw until the first box arrives; the steps above say what is happening. */}
        {boxesIn(lines) > 0 && (
          <div className="bg-[var(--surface-input)]">
            <DiagramPreview lines={lines} dark={dark} label={description} drawStyle={drawStyle} />
          </div>
        )}
        {footer && (
          <div className="flex items-center justify-end gap-1.5 border-t border-[var(--surface-line)] px-2.5 py-2">
            {footer}
          </div>
        )}
      </div>
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
