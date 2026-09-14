'use client';

import { BentoCard } from '@/components/marketing/bento-card';
import { RevealText } from '@/components/marketing/reveal-text';
import { SectionLabel } from '@/components/marketing/section-label';

const GUARANTEES = [
  {
    label: 'SOC 2 Type II',
    desc: 'Independently audited security controls',
  },
  {
    label: 'Full Audit Trail',
    desc: 'Every decision logged with full traceability',
  },
  {
    label: 'Real-time Observability',
    desc: 'Monitor, debug, and replay any execution',
  },
];

const BADGES = ['SOC 2', 'GDPR', 'HIPAA Ready', 'ISO 27001'];

const AUDIT_LOG = [
  { time: '12:34:21', action: 'agent_executed', status: 'success' },
  { time: '12:34:18', action: 'decision_logged', status: 'success' },
  { time: '12:34:15', action: 'tool_called', status: 'success' },
  { time: '12:34:12', action: 'memory_updated', status: 'success' },
  { time: '12:34:09', action: 'output_generated', status: 'success' },
];

export function SecuritySection() {
  return (
    <section id="security" className="py-32 px-6 md:px-12 lg:px-20 border-t border-black/[0.06]">
      <div className="max-w-6xl mx-auto">
        <div className="mb-16">
          <SectionLabel>Security</SectionLabel>
          <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
            {'Enterprise-grade\nfrom day one.'}
          </RevealText>
        </div>

        {/* Asymmetric grid: left text + title, right interactive audit log */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left side — descriptions */}
          <div className="space-y-6">
            <p className="text-sm text-black/45 leading-relaxed">
              Every action is logged, every decision is traceable. Built for teams that need
              compliance without compromise.
            </p>

            <div className="space-y-4">
              {GUARANTEES.map((item) => (
                <div key={item.label} className="flex gap-4">
                  <div className="w-1 bg-black/10 rounded-full shrink-0" />
                  <div>
                    <h3 className="text-sm font-light mb-1">{item.label}</h3>
                    <p className="text-xs text-black/35">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Compliance badges — vertical stack */}
            <div className="pt-4 flex flex-col gap-2">
              {BADGES.map((badge) => (
                <div key={badge} className="flex items-center gap-2 text-xs text-black/25">
                  <span className="w-1 h-1 rounded-full bg-black/25" />
                  {badge}
                </div>
              ))}
            </div>
          </div>

          {/* Right side — live audit log visualization */}
          <BentoCard className="p-6 lg:row-span-1" delay={0}>
            <div className="text-xs text-black/30 tracking-widest uppercase mb-4">
              Live Audit Trail
            </div>
            <div className="space-y-2">
              {AUDIT_LOG.map((log, i) => (
                <div
                  key={log.time}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-black/[0.02] hover:bg-black/[0.04] transition-colors border border-black/[0.04] group cursor-pointer"
                  style={{
                    animation: `fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms both`,
                  }}
                >
                  <span className="text-[10px] text-black/25 font-mono min-w-[60px]">
                    {log.time}
                  </span>
                  <span className="text-[11px] text-black/50 font-light flex-1">{log.action}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/60 group-hover:bg-green-500 transition-colors" />
                </div>
              ))}
            </div>
            <style>{`
              @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
