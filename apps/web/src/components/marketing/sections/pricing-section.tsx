'use client';

import { useState } from 'react';
import { ArrowRight, Check, Zap } from 'lucide-react';
import { SectionLabel } from '@/components/marketing/section-label';
import { useInView } from '@/components/marketing/use-in-view';

type Billing = 'monthly' | 'yearly';

type Plan = {
  name: string;
  /** Rupees per month for each billing period; absent on the free plan. */
  price?: Record<Billing, number>;
  sub: string;
  features: string[];
  highlight?: boolean;
};

/**
 * Quoted in rupees. None of these can be bought yet — the header's badge says
 * so — so the figures are what the plans are meant to cost, not a checkout.
 *
 * Paying yearly takes 30% off the monthly figure, rounded down to the 99.
 *
 * Neither face this block is set in draws `₹`, so the symbol comes from the
 * system font; every current OS has one.
 */
const PLANS: Plan[] = [
  {
    name: 'Starter',
    sub: 'For your first few boards',
    features: ['3 boards', '2 editors per board', 'Guest viewer links', 'PNG export'],
  },
  {
    name: 'Team',
    price: { monthly: 999, yearly: 699 },
    sub: 'For teams working side by side',
    features: [
      'Unlimited boards',
      'Unlimited editors',
      'Follow mode + laser pointer',
      'Expiring share links',
      '.canvasflow export',
      'Trash + restore',
    ],
    highlight: true,
  },
  {
    name: 'Pro',
    price: { monthly: 1999, yearly: 1399 },
    sub: 'For orgs at scale',
    features: [
      'Unlimited workspaces',
      'SSO + provisioning',
      'Full audit trail',
      'SOC 2 / HIPAA',
      'SLA guarantees',
      'Custom contracts',
    ],
  },
];

/** `en-IN` groups by lakh, which only shows once a figure passes 99,999. */
const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

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
                key={plan.name}
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
                    <h3 className="text-2xl lg:text-3xl mt-2">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mt-2">{plan.sub}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-8">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl lg:text-6xl">
                        {plan.price ? rupees(plan.price[billing]) : 'Free'}
                      </span>
                      {plan.price && <span className="text-muted-foreground text-sm">/mo</span>}
                    </div>
                    {/* Kept on the free plan too, empty, so the cards stay level. */}
                    <p className="mt-3 min-h-4 text-xs text-muted-foreground">
                      {plan.price &&
                        (billing === 'yearly'
                          ? `${rupees(plan.price.yearly * 12)} billed yearly`
                          : 'Billed monthly')}
                    </p>
                  </div>

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
            href="#"
            className="text-sm underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Compare all features
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
              <span className={selected ? 'text-background/60' : 'text-[#eca8d6]'}>Save 30%</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
