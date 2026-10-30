'use client';

import { useState } from 'react';
import NumberFlow from '@number-flow/react';
import { Check } from 'lucide-react';
import {
  PLAN_ALLOWANCES,
  PLAN_NAMES,
  PLAN_PRICES,
  PLAN_CURRENCY,
  type WorkspacePlan,
} from '@canvasflow/types';
import { cn } from '@/lib/utils';
import { WHITEBOARD_HREF } from '@/lib/whiteboard';
import { SECTION_TYPE } from './section-type';

type Billing = 'monthly' | 'yearly';

const perMember = (plan: WorkspacePlan) =>
  PLAN_PRICES[plan]?.per === 'member' ? ' per member' : '';

/** The three plans as cards, in the order the editor's upgrade page lists them. */
const PLANS: { id: WorkspacePlan; sub: string; features: string[] }[] = [
  {
    id: 'free',
    sub: 'Everything you need to start drawing with your team',
    features: [
      'Unlimited boards',
      'Live editing, comments and share links',
      `${PLAN_ALLOWANCES.free.diagramsPerMonth} AI diagrams a month`,
      `${PLAN_ALLOWANCES.free.storageGb} GB storage`,
    ],
  },
  {
    id: 'pro',
    sub: 'For your own work, with more room and no badge',
    features: [
      'Everything in Free plus:',
      `${PLAN_ALLOWANCES.pro.diagramsPerMonth} AI diagrams a month`,
      `${PLAN_ALLOWANCES.pro.storageGb} GB storage`,
      `${PLAN_ALLOWANCES.pro.historyDays} days of version history`,
      'Expiring share links',
      'Embeds without the badge',
    ],
  },
  {
    id: 'team',
    sub: 'For teams working side by side in one workspace',
    features: [
      'Everything in Pro plus:',
      `${PLAN_ALLOWANCES.team.diagramsPerMonth} AI diagrams a month${perMember('team')}`,
      `${PLAN_ALLOWANCES.team.storageGb} GB storage${perMember('team')}`,
      'Unlimited version history',
      'Workspace invites and roles',
      'Guests on your boards',
    ],
  },
];

/** The smallest yearly saving of any paid plan, so the promise holds for every one. */
const YEARLY_SAVING = Math.min(
  ...Object.values(PLAN_PRICES).map((price) =>
    Math.floor((1 - price.yearly / price.monthly) * 100),
  ),
);

/** Where a card's button goes: the editor for Free, its upgrade page for a paid plan. */
function ctaHref(plan: WorkspacePlan, billing: Billing): string {
  if (!PLAN_PRICES[plan]) return WHITEBOARD_HREF;
  const url = new URL('/upgrade', WHITEBOARD_HREF);
  url.searchParams.set('plan', plan);
  url.searchParams.set('cycle', billing);
  // The upgrade page's back link returns here rather than to the editor.
  url.searchParams.set('from', 'pricing');
  return url.toString();
}

const quiet = 'bg-[#111113] shadow-sm ring-1 shadow-black/10 ring-white/15 hover:bg-[#27272a]/50';
const primary =
  'border-[0.5px] border-transparent bg-[#135dfc] text-white shadow-md ring shadow-black/15 ring-[#4d84fd] text-shadow-sm hover:bg-[#135dfc]/90';

/**
 * Three plan cards with a monthly/annual switch over them, the middle one
 * raised. Every figure comes from `@canvasflow/types`, the same source the
 * editor's billing reads, so the page can't drift from what's charged.
 *
 * On the landing page.
 */
export function PricingCards({ id, className }: { id?: string; className?: string }) {
  const [billing, setBilling] = useState<Billing>('yearly');

  return (
    <section
      id={id}
      className={cn(
        'relative bg-[#09090b] py-16 text-[#fafafa] antialiased md:py-32',
        SECTION_TYPE,
        className,
      )}
    >
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center" data-reveal="children">
          <h2
            data-split
            className="text-3xl font-bold tracking-tight text-balance md:text-4xl lg:text-5xl lg:tracking-tight"
          >
            Pricing that grows with your team
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-balance text-[#9f9fa9]">
            Start free with unlimited boards, and upgrade when you want more AI, storage and room
            for your team
          </p>
          <div className="my-12">
            <div
              data-period={billing}
              className="relative mx-auto grid w-fit grid-cols-2 rounded-full bg-white/5 p-1 *:block *:h-8 *:w-24 *:rounded-full *:text-sm *:text-white/75 *:hover:opacity-75"
            >
              <div
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute inset-1 w-1/2 rounded-full border border-transparent bg-[#111113] shadow ring-1 ring-white/5 transition-transform duration-500 ease-in-out',
                  billing === 'yearly' && 'translate-x-full',
                )}
              />
              {(['monthly', 'yearly'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  aria-pressed={billing === period}
                  onClick={() => setBilling(period)}
                  className={cn(
                    'relative cursor-pointer',
                    billing === period && 'font-medium !text-white',
                  )}
                >
                  {period === 'monthly' ? 'Monthly' : 'Annually'}
                </button>
              ))}
            </div>
            <div className="mt-3 text-center text-xs">
              <span className="font-medium text-[#4d84fd]">Save {YEARLY_SAVING}%</span> On Annual
              Billing
            </div>
          </div>
        </div>

        <div className="@container">
          <div className="mx-auto max-w-sm rounded-xl border border-white/10 @4xl:max-w-full">
            <div data-reveal="children" className="grid *:p-8 @4xl:grid-cols-3">
              {PLANS.map((plan) => {
                const price = PLAN_PRICES[plan.id];
                const raised = plan.id === 'pro';
                const amount = price ? (billing === 'yearly' ? price.yearly : price.monthly) : 0;
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'row-span-4 grid grid-rows-subgrid gap-8',
                      raised
                        ? 'rounded-xl bg-[#111113] shadow-xl ring-1 shadow-black/6.5 ring-white/10 backdrop-blur @max-4xl:mx-1 @4xl:my-2'
                        : '@max-4xl:p-9',
                    )}
                  >
                    <div className="self-end">
                      <div className="text-lg font-medium tracking-tight">
                        {PLAN_NAMES[plan.id]}
                      </div>
                      <div className="mt-1 text-sm text-balance text-[#9f9fa9]">{plan.sub}</div>
                    </div>
                    <div>
                      {/* Rolls digit by digit to the new price when the billing switches. */}
                      <NumberFlow
                        value={amount}
                        format={{
                          style: 'currency',
                          currency: PLAN_CURRENCY,
                          maximumFractionDigits: 0,
                        }}
                        locales="en-US"
                        className="text-3xl font-semibold tracking-tight"
                      />
                      <div className="text-sm text-[#9f9fa9]">
                        {price
                          ? `Per ${price.per === 'member' ? 'member' : 'month'}${price.per === 'member' ? ' per month' : ''}${billing === 'yearly' ? ', billed yearly' : ''}`
                          : 'Per month'}
                      </div>
                    </div>
                    <a
                      href={ctaHref(plan.id, billing)}
                      className={cn(
                        'inline-flex h-9 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-transform duration-200 active:scale-98',
                        raised ? primary : quiet,
                      )}
                    >
                      {price ? `Get ${PLAN_NAMES[plan.id]}` : 'Start drawing'}
                    </a>
                    <ul role="list" className="space-y-3 text-sm">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="group flex items-center gap-2 first:data-[lead]:font-medium"
                          data-lead={feature.endsWith(':') ? '' : undefined}
                        >
                          {!feature.endsWith(':') && (
                            <Check className="size-3 text-[#9f9fa9]" strokeWidth={3.5} />
                          )}
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
