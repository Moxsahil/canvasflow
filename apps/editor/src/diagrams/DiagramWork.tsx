import { useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Orb, type OrbLook } from '@/components/ui/thinking-orbs';
import { cn } from '@/lib/utils';
import { formatLocale, useT } from '../i18n';
import type { DiagramEntry } from './diagram-history';
import { progressOf, type DiagramProgress, type WorkPhase } from './diagram-progress';
import type { DiagramRun } from './useDiagramPanel';

/** Which orb each step shows while it is the one happening. */
const ORBS: Record<WorkPhase, OrbLook> = {
  reading: { state: 'reasoning' },
  layout: { state: 'searching' },
  boxes: { state: 'working' },
  arrows: { state: 'working', variant: 'gyro' },
  fixing: { state: 'retrying' },
};

const ORDER: readonly WorkPhase[] = ['reading', 'layout', 'boxes', 'arrows', 'fixing'];

interface Step {
  phase: WorkPhase;
  label: string;
  detail?: string;
}

function seconds(ms: number): string {
  return new Intl.NumberFormat(formatLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ms / 1000);
}

/**
 * The steps a diagram has been through, in the words for whether each is still
 * happening (`now`) or done. Only steps the stream has shown are listed.
 */
function useSteps() {
  const t = useT();
  return (
    progress: DiagramProgress,
    change: boolean,
    now: WorkPhase | null,
    /** The detailed model thinks before its first line, so that wait is planning. */
    planning = false,
  ): Step[] => {
    const live = (phase: WorkPhase) => phase === now;
    const steps: Step[] = [
      {
        phase: 'reading',
        label: planning
          ? t(live('reading') ? 'diagrams.step.planning' : 'diagrams.step.planned')
          : change
            ? t(live('reading') ? 'diagrams.step.readingChange' : 'diagrams.step.readChange')
            : t(live('reading') ? 'diagrams.step.reading' : 'diagrams.step.read'),
      },
    ];
    if (progress.direction) {
      steps.push({
        phase: 'layout',
        label: t(live('layout') ? 'diagrams.step.layingOut' : 'diagrams.step.laidOut'),
        detail: t(progress.direction === 'LR' ? 'diagrams.step.across' : 'diagrams.step.down'),
      });
    }
    if (progress.topics.length > 0) {
      steps.push({
        phase: 'boxes',
        label: live('boxes')
          ? t('diagrams.step.addingTopics')
          : t('diagrams.step.addedTopics', { count: progress.topics.length }),
        detail: progress.topics.join(', '),
      });
    }
    if (progress.boxes.length > 0) {
      steps.push({
        phase: 'boxes',
        label: live('boxes')
          ? t('diagrams.step.adding')
          : t('diagrams.step.added', { count: progress.boxes.length }),
        detail: progress.boxes.join(', '),
      });
    }
    if (progress.arrows > 0) {
      steps.push({
        phase: 'arrows',
        label: live('arrows')
          ? t('diagrams.step.connecting')
          : t('diagrams.step.connected', { count: progress.arrows }),
        ...(live('arrows') ? { detail: t('diagrams.step.soFar', { count: progress.arrows }) } : {}),
      });
    }
    if (progress.fixing > 0) {
      steps.push({
        phase: 'fixing',
        label: live('fixing')
          ? t('diagrams.step.fixing', { count: progress.fixing })
          : t('diagrams.step.fixed', { count: progress.fixing }),
      });
    }
    return steps.sort((a, b) => ORDER.indexOf(a.phase) - ORDER.indexOf(b.phase));
  };
}

function StepList({ steps, now, elapsed }: { steps: Step[]; now?: WorkPhase; elapsed?: string }) {
  const t = useT();
  return (
    <ol className="m-0 grid list-none gap-1.5 p-0">
      {steps.map((step) => {
        const live = step.phase === now;
        return (
          <li key={step.phase} className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2">
            {live ? (
              <Orb
                {...ORBS[step.phase]}
                size={18}
                label={t('diagrams.working')}
                className="mt-px text-[var(--surface-link)]"
              />
            ) : (
              <Check className="mt-0.5 size-3.5 text-[var(--surface-ok)]" aria-hidden="true" />
            )}
            <div className="min-w-0 text-[12.5px] leading-[1.45]">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'min-w-0',
                    live ? 'text-[var(--surface-fg)]' : 'text-[var(--surface-fg-muted)]',
                  )}
                >
                  {step.label}
                </span>
                {live && elapsed && (
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--surface-fg-faint)] tabular-nums">
                    {elapsed}
                  </span>
                )}
              </div>
              {step.detail && (
                <span className="block text-[11.5px] text-[var(--surface-fg-faint)] [overflow-wrap:anywhere]">
                  {step.detail}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What a diagram being drawn is doing right now: each step the stream has
 * reached, the current one with its orb and the seconds so far.
 */
export function DiagramWorking({ run }: { run: DiagramRun }) {
  const stepsOf = useSteps();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);
  const progress = progressOf(run.lines, run.fixing);
  const steps = stepsOf(progress, Boolean(run.changeOf), progress.phase, run.detailed);
  return (
    <div className="border-b border-[var(--surface-line)] px-3 py-2.5" aria-live="polite">
      <StepList
        steps={steps}
        now={progress.phase}
        elapsed={`${seconds(Math.max(now - run.startedAt, 0))} s`}
      />
    </div>
  );
}

/**
 * A finished diagram's one-line account — how long it took and what it drew —
 * which opens to the steps it went through.
 */
export function DiagramSummary({ entry }: { entry: DiagramEntry }) {
  const t = useT();
  const stepsOf = useSteps();
  const [open, setOpen] = useState(false);
  const progress = progressOf(entry.lines, entry.fixed ?? 0);
  const drew =
    progress.topics.length > 0
      ? t('diagrams.topics', { count: progress.topics.length })
      : `${t('diagrams.boxes', { count: progress.boxes.length })}, ${t('diagrams.arrows', { count: progress.arrows })}`;
  const text =
    entry.took === undefined
      ? drew
      : `${t('diagrams.drawnIn', { seconds: seconds(entry.took) })} · ${drew}`;
  return (
    <div className="border-b border-[var(--surface-line)]">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${text}. ${t(open ? 'diagrams.hideSteps' : 'diagrams.showSteps')}`}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--surface-fg-muted)] outline-none hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:ring-inset"
      >
        <Check className="size-3.5 shrink-0 text-[var(--surface-ok)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{text}</span>
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="px-3 pb-2.5">
          <StepList steps={stepsOf(progress, Boolean(entry.changeOf), null)} />
        </div>
      )}
    </div>
  );
}
