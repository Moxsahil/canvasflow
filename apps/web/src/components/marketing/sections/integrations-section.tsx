'use client';

import { trackPointer } from '@/components/marketing/bento-card';
import { PixelIcon } from '@/components/marketing/pixel-icon';
import { RevealText } from '@/components/marketing/reveal-text';
import { Tag } from '@/components/marketing/tag';

const GLASS_PANEL = {
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  background: 'rgba(255,255,255,0.60)',
} as const;

export function IntegrationsSection() {
  return (
    <section
      id="integrations"
      className="py-32 px-6 md:px-12 lg:px-20 border-t border-black/[0.06]"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-16">
          <div>
            <PixelIcon type="integrations" size={40} />
            <div className="mt-4">
              <Tag>INTEGRATIONS</Tag>
            </div>
            <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
              {'Connect any tool.\nControl any system.'}
            </RevealText>
          </div>
          <p className="text-sm text-black/45 leading-relaxed max-w-xs">
            200+ native connectors. Everything from Slack to your internal database. Build custom
            tools with our SDK in minutes.
          </p>
        </div>

        {/* Full-width image block with glass cards.
            Mobile: flex-col, image + cards stacked. Desktop: image fills block, cards absolute */}
        <div
          className="rounded-2xl overflow-hidden border border-black/[0.07] flex flex-col md:block md:relative"
          onMouseMove={trackPointer}
        >
          {/* Image */}
          <div className="relative w-full h-[280px] md:h-[480px] shrink-0">
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Org%20Arc%20-%20Upscaled-Sk90jShfu7nltLnhoQbaMJC1YaQKuU.png"
              alt="Agent orchestration architecture"
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          </div>

          {/* Cards — flex row on mobile (equal spacing), absolute on desktop */}
          <div className="flex flex-col gap-3 p-4 md:absolute md:bottom-4 md:right-4 md:p-0 md:w-72">
            <div className="rounded-xl border border-white/50 p-6" style={GLASS_PANEL}>
              <Tag>SDK</Tag>
              <h3 className="mt-3 text-lg font-light mb-2">Build custom tools</h3>
              <p className="text-xs text-black/45 leading-relaxed mb-4">
                Define any function as a tool your agents can call. TypeScript and Python.
              </p>
              <div className="bg-black/[0.05] rounded-lg border border-black/[0.07] p-3 font-mono text-[11px] text-black/50 leading-relaxed">
                <span className="text-black/25">{'// tool definition'}</span>
                <br />
                <span className="text-blue-600/70">defineTool</span>
                {'({'}
                <br />
                {'  '}
                <span className="text-amber-700/70">name</span>:{' '}
                <span className="text-green-700/70">&apos;fetchPrice&apos;</span>
                ,<br />
                {'  '}
                <span className="text-amber-700/70">run</span>:{' '}
                <span className="text-black/35">async (q) </span>={'>'}
                <br />
                {'    '}
                <span className="text-blue-600/70">api</span>.get(q)
                <br />
                {'})'}
              </div>
            </div>

            <div className="rounded-xl border border-white/50 p-6" style={GLASS_PANEL}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse" />
                <span className="text-xs text-black/40 tracking-widest">LIVE API</span>
              </div>
              <p className="text-sm text-black/45">
                Full REST + WebSocket API. Stream agent outputs directly into your product.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
