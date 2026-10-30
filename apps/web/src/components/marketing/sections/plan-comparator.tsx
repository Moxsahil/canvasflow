'use client';

import { useState } from 'react';
import { Gem, Sparkles, Users } from 'lucide-react';
import { PLAN_ALLOWANCES, PLAN_NAMES, PLAN_PRICES, type WorkspacePlan } from '@canvasflow/types';
import { cn } from '@/lib/utils';
import { WHITEBOARD_HREF } from '@/lib/whiteboard';
import { SECTION_TYPE } from './section-type';

type Cell = boolean | string;

const history = (days: number | null) => (days === null ? 'Unlimited' : `${days} days`);

const PLANS: { id: WorkspacePlan; icon: typeof Gem; cta: string }[] = [
  { id: 'free', icon: Sparkles, cta: 'Start drawing' },
  { id: 'pro', icon: Gem, cta: 'Get Pro' },
  { id: 'team', icon: Users, cta: 'Get Team' },
];

/** Each row: what it is, a hint for the ones that need one, and each plan's answer. */
const ROWS: { label: string; hint?: string; cells: Record<string, Cell> }[] = [
  { label: 'Unlimited boards', cells: { free: true, pro: true, team: true } },
  {
    label: 'AI diagrams',
    hint: 'Diagrams and mind maps drawn from a prompt, each month',
    cells: Object.fromEntries(
      PLANS.map((p) => [p.id, `${PLAN_ALLOWANCES[p.id].diagramsPerMonth} / month`]),
    ),
  },
  {
    label: 'Storage',
    cells: Object.fromEntries(PLANS.map((p) => [p.id, `${PLAN_ALLOWANCES[p.id].storageGb} GB`])),
  },
  {
    label: 'Version history',
    hint: 'How far back you can restore an earlier version of a board',
    cells: Object.fromEntries(PLANS.map((p) => [p.id, history(PLAN_ALLOWANCES[p.id].historyDays)])),
  },
  {
    label: 'Badge-free embeds',
    cells: Object.fromEntries(PLANS.map((p) => [p.id, !PLAN_ALLOWANCES[p.id].embedBadge])),
  },
  {
    label: 'Team workspace',
    hint: 'One shared workspace with invites and owner, admin and member roles',
    cells: Object.fromEntries(PLANS.map((p) => [p.id, PLAN_ALLOWANCES[p.id].teamWorkspace])),
  },
];

function ctaHref(plan: WorkspacePlan): string {
  if (!PLAN_PRICES[plan]) return WHITEBOARD_HREF;
  const url = new URL('/upgrade', WHITEBOARD_HREF);
  url.searchParams.set('plan', plan);
  // The upgrade page's back link returns here rather than to the editor.
  url.searchParams.set('from', 'pricing');
  return url.toString();
}

function Mark({ value }: { value: Cell }) {
  if (typeof value === 'string') return <div>{value}</div>;
  return value ? (
    <span
      className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 font-sans text-xs font-semibold text-emerald-600"
      aria-label="Included"
    >
      ✓
    </span>
  ) : (
    <span
      className="flex size-5 items-center justify-center rounded-full bg-white/6.5 font-sans text-xs font-semibold text-white/65"
      aria-label="Not included"
    >
      ✗
    </span>
  );
}

const cell =
  'flex h-14 items-center justify-center border-t border-white/10 px-6 text-sm max-md:border-l max-md:last:h-[calc(3.5rem+1px)] max-md:last:border-b';

/**
 * Every plan side by side, a row per allowance, the Pro column raised. The
 * figures come from `@canvasflow/types`, the same source the editor's billing
 * reads.
 *
 * On the landing page.
 */
export function PlanComparator({ id, className }: { id?: string; className?: string }) {
  // On a phone one plan's column shows at a time, picked from the bar on top.
  const [shown, setShown] = useState<WorkspacePlan>('pro');
  const shownPlan = PLANS.find((plan) => plan.id === shown)!;

  return (
    <section
      id={id}
      className={cn(
        'bg-[#09090b] pb-16 text-[#fafafa] antialiased md:py-24',
        SECTION_TYPE,
        className,
      )}
    >
      <div className="mx-auto max-w-5xl md:px-6">
        <div className="flex items-center justify-between gap-2 px-4 pb-4 md:hidden">
          <div className="flex gap-1">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                aria-pressed={shown === plan.id}
                onClick={() => setShown(plan.id)}
                className={cn(
                  'h-8 cursor-pointer rounded-md px-3 text-sm',
                  shown === plan.id
                    ? 'bg-[#111113] text-[#4d84fd] ring-1 ring-white/10'
                    : 'text-[#9f9fa9]',
                )}
              >
                {PLAN_NAMES[plan.id]}
              </button>
            ))}
          </div>
          <a
            href={ctaHref(shown)}
            className="inline-flex h-8 items-center justify-center rounded-md border-[0.5px] border-transparent bg-[#135dfc] px-3 text-xs font-medium whitespace-nowrap text-white shadow-md ring shadow-black/15 ring-[#4d84fd] text-shadow-sm"
          >
            {shownPlan.cta}
          </a>
        </div>
        <div className="grid grid-cols-2 border-white/10 max-md:border-t md:grid-cols-4">
          <div>
            <div className="flex h-14 items-center px-6 md:h-18">
              <div className="font-medium">Benefits</div>
            </div>
            {ROWS.map((row) => (
              <div
                key={row.label}
                className="flex h-14 items-center gap-2 border-t border-white/10 px-6 text-[#9f9fa9] last:h-[calc(3.5rem+1px)] last:border-b md:border-l md:nth-2:rounded-tl-xl md:last:rounded-bl-xl"
              >
                <div className="max-lg:text-sm">{row.label}</div>
                {row.hint && (
                  <span
                    title={row.hint}
                    className="flex size-4 cursor-help items-center justify-center rounded-full bg-white/10 text-sm text-white/65"
                  >
                    ?
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="grid rounded-xl border-white/10 max-md:rounded-bl-none md:col-span-3 md:-translate-y-px md:grid-cols-3 md:border">
            <div className="h-14 md:hidden" aria-hidden="true" />
            {PLANS.map((plan) => {
              const raised = plan.id === 'pro';
              return (
                <div key={plan.id} className={plan.id === shown ? '' : 'max-md:hidden'}>
                  <div
                    className={cn(
                      raised &&
                        'md:-my-2 md:rounded-xl md:bg-[#111113] md:shadow-xl md:ring-1 md:shadow-black/6.5 md:ring-white/10',
                    )}
                  >
                    <div
                      className={cn(
                        'flex justify-center px-4 text-center max-md:hidden lg:px-6',
                        raised ? 'md:h-20' : 'h-18 pt-2 lg:px-8',
                      )}
                    >
                      <div className="mt-auto flex h-18 flex-col items-center justify-center gap-1.5">
                        <plan.icon className="size-4" />
                        <div className="text-sm font-medium">{PLAN_NAMES[plan.id]}</div>
                      </div>
                    </div>
                    <div>
                      {ROWS.map((row) => (
                        <div key={row.label} className={cell}>
                          <Mark value={row.cells[plan.id]!} />
                        </div>
                      ))}
                    </div>
                    <div
                      className={cn(
                        'border-t border-white/10 px-4 text-sm max-md:hidden lg:px-6',
                        raised ? 'h-20' : 'h-18',
                      )}
                    >
                      <div className="flex h-18 items-center justify-center">
                        <a
                          href={ctaHref(plan.id)}
                          className={cn(
                            'inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium whitespace-nowrap transition-transform active:scale-98 lg:w-full',
                            raised
                              ? 'border-[0.5px] border-transparent bg-[#135dfc] text-white shadow-md ring shadow-black/15 ring-[#4d84fd] text-shadow-sm hover:bg-[#135dfc]/90'
                              : 'bg-[#111113] shadow-sm ring-1 shadow-black/10 ring-white/15 hover:bg-[#27272a]/50',
                          )}
                        >
                          {plan.cta}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
