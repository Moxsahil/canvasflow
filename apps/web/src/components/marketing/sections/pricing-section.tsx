'use client';

import { BentoCard, trackPointer } from '@/components/marketing/bento-card';
import { PixelIcon } from '@/components/marketing/pixel-icon';
import { RevealText } from '@/components/marketing/reveal-text';
import { Tag } from '@/components/marketing/tag';

type Plan = {
  name: string;
  price: string;
  period?: string;
  sub: string;
  features: string[];
  highlight?: boolean;
  delay: number;
};

const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: 'Free',
    sub: 'For your first few boards',
    features: ['3 boards', '2 editors per board', 'Guest viewer links', 'PNG export'],
    delay: 0,
  },
  {
    name: 'Team',
    price: '$49',
    period: '/mo',
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
    delay: 80,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    sub: 'For orgs at scale',
    features: [
      'Unlimited workspaces',
      'SSO + provisioning',
      'Full audit trail',
      'SOC 2 / HIPAA',
      'SLA guarantees',
      'Custom contracts',
    ],
    delay: 140,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-32 px-6 md:px-12 lg:px-20 border-t border-white/[0.08]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16 flex flex-col items-center">
          <PixelIcon type="pricing" size={40} dark />
          <div className="mt-4">
            <Tag dark>PRICING</Tag>
          </div>
          <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
            {'Pay as your team grows.'}
          </RevealText>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" onMouseMove={trackPointer}>
          {PLANS.map((plan) => (
            <BentoCard
              key={plan.name}
              className={`p-8 flex flex-col ${plan.highlight ? 'border-white/25 bg-white/[0.06]' : ''}`}
              dark
              delay={plan.delay}
            >
              <div className="mb-8">
                <div className="font-pixel text-[11px] tracking-widest text-white/40 mb-4">
                  {plan.name}
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-light">{plan.price}</span>
                  {plan.period && <span className="text-white/40 text-sm">{plan.period}</span>}
                </div>
                <p className="text-xs text-white/35 tracking-wide">{plan.sub}</p>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-white/55">
                    <div className="w-1 h-1 rounded-full bg-white/25 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`w-full py-3 rounded-xl text-sm tracking-widest transition-all duration-200 ${
                  plan.highlight
                    ? 'bg-[#F5F4F0] text-[#020204] hover:bg-white'
                    : 'border border-white/15 text-white/60 hover:border-white/30 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {plan.name === 'Enterprise' ? 'CONTACT SALES' : 'GET STARTED'}
              </button>
            </BentoCard>
          ))}
        </div>
      </div>
    </section>
  );
}
