'use client';

import { useState } from 'react';
import { ArrowRight, Check, Zap } from 'lucide-react';
import {
  PLAN_ALLOWANCES,
  PLAN_NAMES,
  PLAN_PRICES,
  SUPPORT_EMAIL,
  formatPlanPrice,
  type PlanPrice,
  type WorkspacePlan,
} from '@canvasflow/types';
import { SectionLabel } from '@/components/marketing/section-label';
import { useInView } from '@/components/marketing/use-in-view';

type Billing = 'monthly' | 'yearly';

type Plan = {
  id: WorkspacePlan;
  sub: string;
  features: string[];
  highlight?: boolean;
};

const perMember = (plan: WorkspacePlan) =>
  PLAN_PRICES[plan]?.per === 'member' ? ' per member' : '';

const diagrams = (plan: WorkspacePlan) =>
  `${PLAN_ALLOWANCES[plan].diagramsPerMonth} AI diagrams a month${perMember(plan)}`;

const storage = (plan: WorkspacePlan) =>
  `${PLAN_ALLOWANCES[plan].storageGb} GB storage${perMember(plan)}`;

const history = (plan: WorkspacePlan) => {
  const days = PLAN_ALLOWANCES[plan].historyDays;
  return days === null ? 'Unlimited version history' : `${days}-day version history`;
};

/**
 * Quoted in US dollars. None of these can be bought yet — the header's badge
 * says so — so the figures are what the plans are meant to cost, not a checkout.
 *
 * Names, limits and prices come from `@canvasflow/types`, the same place the
 * gateway enforces them from; only the words around them live here. Enterprise
 * has no card: it is arranged by writing to us, from the line under the cards.
 */
const PLANS: Plan[] = [
  {
    id: 'free',
    sub: 'Everything you need to draw',
    features: [
      'Unlimited boards',
      'Live drawing, comments + share links',
      diagrams('free'),
      storage('free'),
      history('free'),
      'Trash + restore',
    ],
  },
  {
    id: 'pro',
    sub: 'For your own work, without limits',
    features: [
      'Everything in Free',
      diagrams('pro'),
      storage('pro'),
      history('pro'),
      'Expiring share links',
      'Embeds without the badge',
    ],
  },
  {
    id: 'team',
    sub: 'For teams working side by side',
    features: [
      'Everything in Pro',
      diagrams('team'),
      storage('team'),
      history('team'),
      'Workspace invites + roles',
      'Guests on your boards',
    ],
    highlight: true,
  },
];

/**
 * What the yearly toggle promises: the smallest saving of any plan, rounded
 * down, so it is true of every card it applies to.
 */
const YEARLY_SAVING = Math.min(
  ...Object.values(PLAN_PRICES).map((price) =>
    Math.floor((1 - price.yearly / price.monthly) * 100),
  ),
);

const perMonth = (price: PlanPrice) => (price.per === 'member' ? '/member/mo' : '/mo');

/**
 * `cf-pricing` on the section is what makes the rest of this read correctly:
 * the layout is written against `bg-background`, `text-foreground` and
 * `border-foreground/10`, and this page's values for those are the light ones.
 * The class swaps them for the subtree, the same way the nav does — see
 * globals.css — and points the block's mono at the face it is set in.
 */
export function PricingSection() {
  const { ref, inView } = useInView(0.1);
  // Opens on yearly, so the lower monthly figure is the one read first. The
  // "billed yearly" line under each price is what keeps that honest: the total
  // and the commitment are on the card, not first seen at checkout.
  const [billing, setBilling] = useState<Billing>('yearly');

  return (
    <section
      id="pricing"
      ref={ref}
      className="cf-pricing font-sans relative py-32 lg:py-40 px-6 md:px-12 lg:px-20 border-t border-white/[0.08]"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header - Dramatic offset */}
        <div className="grid lg:grid-cols-12 gap-8 mb-20">
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-4 mb-8">
              <SectionLabel dark>Pricing</SectionLabel>
              <span className="inline-flex items-center px-3 py-1 border border-[#eca8d6]/40 text-[#eca8d6] text-xs font-mono uppercase tracking-widest">
                Coming soon
              </span>
            </div>
            <h2
              className={`text-6xl md:text-7xl lg:text-[128px] tracking-tight leading-[0.9] transition-all duration-1000 ${
                inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              Pay for
              <br />
              <span className="text-stroke">results.</span>
            </h2>
          </div>
          <div
            className={`lg:col-span-5 flex lg:items-end lg:justify-end transition-all duration-1000 delay-300 ${
              inView ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <BillingToggle value={billing} onChange={setBilling} />
          </div>
        </div>

        {/* Pricing cards - Horizontal layout with overlap */}
        <div className="relative">
          <div className="grid lg:grid-cols-3 gap-4 lg:gap-0">
            {PLANS.map((plan, index) => (
              <div
                key={plan.id}
                className={`relative bg-background border transition-all duration-700 ${
                  plan.highlight
                    ? 'border-foreground lg:-mx-2 lg:z-10 lg:scale-105'
                    : 'border-foreground/10 lg:first:-mr-2 lg:last:-ml-2'
                } ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* Popular badge */}
                {plan.highlight && (
                  <div className="absolute -top-4 left-8 right-8 flex justify-center">
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background text-xs font-mono uppercase tracking-widest">
                      <Zap className="w-3 h-3" />
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="p-8 lg:p-10">
                  {/* Plan header */}
                  <div className="mb-8 pb-8 border-b border-foreground/10">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-2xl lg:text-3xl mt-2">{PLAN_NAMES[plan.id]}</h3>
                    <p className="text-sm text-muted-foreground mt-2">{plan.sub}</p>
                  </div>

                  {/* Price */}
                  <PlanPriceBlock price={PLAN_PRICES[plan.id]} billing={billing} />

                  {/* Features */}
                  <ul className="space-y-3 mb-10">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-[#eca8d6] mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    className={`w-full py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all group ${
                      plan.highlight
                        ? 'bg-foreground text-background hover:bg-foreground/90'
                        : 'border border-foreground/20 text-foreground hover:border-foreground hover:bg-foreground/5'
                    }`}
                  >
                    GET STARTED
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom note with icons */}
        <div
          className={`mt-20 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 pt-12 border-t border-foreground/10 transition-all duration-1000 delay-500 ${
            inView ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#eca8d6]" />
              End-to-end encryption
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#eca8d6]" />
              Full activity logs
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#eca8d6]" />
              Unlimited version history
            </span>
          </div>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=CanvasFlow%20Enterprise`}
            className="text-sm underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Enterprise? Talk to us
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * Two pressed-state buttons rather than a switch, so each side names the period
 * it picks and the saving sits on the side that earns it.
 */
function BillingToggle({
  value,
  onChange,
}: {
  value: Billing;
  onChange: (billing: Billing) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Billing period"
      className="inline-flex p-1 border border-foreground/20 font-mono text-xs uppercase tracking-widest"
    >
      {(['monthly', 'yearly'] as const).map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={`inline-flex items-center gap-2 px-4 py-2 transition-colors ${
              selected
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option === 'monthly' ? 'Monthly' : 'Yearly'}
            {option === 'yearly' && (
              <span className={selected ? 'text-background/60' : 'text-[#eca8d6]'}>
                Save {YEARLY_SAVING}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PlanPriceBlock({ price, billing }: { price: PlanPrice | undefined; billing: Billing }) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline gap-2">
        <span className="text-5xl lg:text-6xl">
          {price ? formatPlanPrice(price[billing]) : 'Free'}
        </span>
        {price && <span className="text-muted-foreground text-sm">{perMonth(price)}</span>}
      </div>
      {/* Kept on the free plan too, empty, so the cards stay level. */}
      <p className="mt-3 min-h-4 text-xs text-muted-foreground">
        {price &&
          (billing === 'yearly'
            ? `${formatPlanPrice(price.yearly * 12)}${price.per === 'member' ? ' per member' : ''} billed yearly`
            : 'Billed monthly')}
      </p>
    </div>
  );
}
