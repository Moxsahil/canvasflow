'use client';

import { BentoCard, trackPointer } from '@/components/marketing/bento-card';
import { PixelIcon } from '@/components/marketing/pixel-icon';
import { RevealText } from '@/components/marketing/reveal-text';
import { Tag } from '@/components/marketing/tag';

export function PlatformSection() {
  return (
    <section id="platform" className="py-32 px-6 md:px-12 lg:px-20">
      <div className="max-w-6xl mx-auto">
        <div className="mb-16">
          <PixelIcon type="platform" size={40} />
          <div className="mt-4">
            <Tag>PRODUCT</Tag>
          </div>
          <RevealText className="mt-5 text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05]">
            {'Everything a team needs\nto think out louds.'}
          </RevealText>
        </div>

        <div className="grid grid-cols-12 grid-rows-auto gap-3" onMouseMove={trackPointer}>
          {/* Wide card — text on the card's own white, panorama picking up where it ends */}
          <BentoCard className="col-span-12 p-8 min-h-60 relative overflow-hidden" delay={0}>
            {/* Desktop: panorama on the right, dissolving into the card before it reaches the text */}
            <div
              className="hidden md:block absolute inset-y-0 right-0 w-[58%] pointer-events-none"
              style={{
                maskImage: 'linear-gradient(to right, transparent 0%, black 45%)',
                WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 45%)',
              }}
            >
              <img
                src="/images/infiniteCanvas.jpg"
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
                style={{ objectPosition: 'center 30%' }}
              />
            </div>

            {/* Content */}
            <div className="relative z-10 md:max-w-[42%]">
              <div className="w-10 h-10 rounded-xl border border-black/10 flex items-center justify-center mb-6">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  <path d="m4.93 4.93 2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
                </svg>
              </div>
              <h3 className="text-xl font-light mb-3">An infinite canvas</h3>
              <p className="text-sm text-black/45 leading-relaxed">
                Shapes, arrows, text, images and frames on a board that never runs out of room. Find
                anything on it instantly.
              </p>
            </div>

            {/* Mobile: panorama below the text, bleeding to the card edges */}
            <div
              className="md:hidden relative z-10 -mx-8 -mb-8 mt-8 h-36 pointer-events-none"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 40%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40%)',
              }}
            >
              <img
                src="/images/infiniteCanvas.jpg"
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
                style={{ objectPosition: 'center 30%' }}
              />
            </div>
          </BentoCard>

          {/* Bottom row */}
          <BentoCard className="col-span-12 md:col-span-4 p-8 min-h-[200px]" delay={120}>
            <div className="w-10 h-10 rounded-xl border border-black/10 flex items-center justify-center mb-5">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3 className="text-lg font-light mb-2">Real-time collaboration</h3>
            <p className="text-sm text-black/45 leading-relaxed">
              Live cursors, presence and follow mode. Everyone sees the same board at the same
              moment.
            </p>
          </BentoCard>

          <BentoCard className="col-span-12 md:col-span-4 p-8 min-h-[200px]" delay={160}>
            <div className="w-10 h-10 rounded-xl border border-black/10 flex items-center justify-center mb-5">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M8 10h8M8 14h5" />
              </svg>
            </div>
            <h3 className="text-lg font-light mb-2">Sharing you control</h3>
            <p className="text-sm text-black/45 leading-relaxed">
              Viewer or editor links that expire, get revoked, or let guests in without an account.
            </p>
          </BentoCard>

          <BentoCard className="col-span-12 md:col-span-4 p-8 min-h-[200px]" delay={200}>
            <div className="w-10 h-10 rounded-xl border border-black/10 flex items-center justify-center mb-5">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 className="text-lg font-light mb-2">Your work stays yours</h3>
            <p className="text-sm text-black/45 leading-relaxed">
              Export to .canvasflow or PNG — with the full scene tucked inside the image.
            </p>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
