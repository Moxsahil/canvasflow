'use client';

import { useEffect, useRef, useState } from 'react';

const USE_CASES = [
  {
    label: 'DESIGN REVIEW',
    title: 'Critique without a meeting',
    desc: 'Drop screens on the board, group them in frames, mark them up with arrows and text. Reviewers join by link — no account needed.',
    // stats: [
    //   { v: "2.4M", l: "tasks run" },
    //   { v: "98.2%", l: "accuracy" },
    // ],
    img: '/images/DesignReview2.jpg',
  },
  {
    label: 'PLANNING',
    title: 'Sprint planning everyone can see',
    desc: 'Lay out the work, move it as priorities shift, and watch the board update live for the whole team.',
    // stats: [
    //   { v: "1.1M", l: "PRs merged" },
    //   { v: "3.2s", l: "avg response" },
    // ],
    img: '/images/SprintPlanning.jpg',
  },
  {
    label: 'ARCHITECTURE',
    title: 'Diagram systems at speed',
    desc: 'Sketch boxes and arrows freehand — rough strokes snap into clean shapes as you draw.',
    // stats: [
    //   { v: "880K", l: "reports" },
    //   { v: "12x", l: "faster" },
    // ],
    img: '/images/Architecture.jpg',
  },
  {
    label: 'WORKSHOPS',
    title: 'Run the room, wherever it is',
    desc: 'Point with the laser, pull everyone to your viewport with follow mode, let people in with a QR code.',
    // stats: [
    //   { v: "5.6M", l: "executions" },
    //   { v: "99.9%", l: "uptime" },
    // ],
    img: '/images/Workshop.jpg',
  },
];

const STICKY_TOP = 80; // matches top: 80px on first card
const STICKY_STEP = 16; // each card stacks 16px lower
const SCALE_STEP = 0.04; // scale reduction per card stacked on top
const OFFSET_STEP = 8; // px pushed down per card stacked on top

/** The card surface. The desktop image fade below has to dissolve into the
 *  same value, so both read it from here rather than repeating the hex. */
const CARD_BG = '#0A0A0E';

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] tracking-widest font-sans text-white/45 bg-white/[0.06]">
      {children}
    </span>
  );
}

export function StackingUseCaseCards() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  // depth[i] = 0..N how many cards are currently stacked on top of card i
  const [depth, setDepth] = useState<number[]>(USE_CASES.map(() => 0));

  useEffect(() => {
    function onScroll() {
      const nextDepth = USE_CASES.map((_, i) => {
        // Count how many cards j > i are currently in sticky position (i.e. have scrolled past card i)
        let count = 0;
        for (let j = i + 1; j < USE_CASES.length; j++) {
          const el = cardRefs.current[j];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const stickyTopJ = STICKY_TOP + j * STICKY_STEP;
          // Card j is "on top of" card i when it has reached its sticky position
          if (rect.top <= stickyTopJ + 2) count++;
        }
        return count;
      });
      setDepth(nextDepth);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex flex-col" style={{ perspective: '1400px', perspectiveOrigin: '50% 0%' }}>
      {USE_CASES.map((useCase, i) => {
        const d = depth[i]!;
        const scale = 1 - d * SCALE_STEP;
        const translateY = d * OFFSET_STEP;

        return (
          <div
            key={useCase.label}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="sticky mb-4"
            style={{ top: `${STICKY_TOP + i * STICKY_STEP}px`, zIndex: 10 + i }}
          >
            <div
              style={{
                transform: `scale(${scale}) translateY(${translateY}px)`,
                transformOrigin: 'top center',
                transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
                willChange: 'transform',
              }}
            >
              <div
                className="group relative rounded-2xl border border-white/[0.08] overflow-hidden cursor-pointer"
                style={{ background: CARD_BG }}
              >
                {/* ── MOBILE: image top, fades out at bottom ── */}
                {useCase.img && (
                  <div className="relative w-full h-52 pointer-events-none md:hidden">
                    <img
                      src={useCase.img}
                      alt={useCase.label}
                      className="absolute inset-0 w-full h-full object-cover object-center"
                      style={{
                        maskImage:
                          'linear-gradient(to bottom, black 0%, black 35%, transparent 85%)',
                        WebkitMaskImage:
                          'linear-gradient(to bottom, black 0%, black 35%, transparent 85%)',
                      }}
                    />
                  </div>
                )}

                {/* ── DESKTOP: image right, fades out at left (absolute) ── */}
                {useCase.img && (
                  <div className="hidden md:block absolute inset-y-0 right-0 w-1/2 pointer-events-none">
                    <img
                      src={useCase.img}
                      alt={useCase.label}
                      className="w-full h-full object-cover object-center"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(to right, ${CARD_BG} 0%, transparent 55%)`,
                      }}
                    />
                  </div>
                )}

                {/* Text content */}
                <div
                  className="relative z-10 p-8"
                  style={{ maxWidth: useCase.img ? undefined : '100%' }}
                  // On desktop limit to left 60% so text doesn't overlap image
                >
                  <div className="md:max-w-[60%]">
                    <div className="flex items-start justify-between mb-6">
                      <Tag>{useCase.label}</Tag>
                    </div>
                    <h3 className="text-xl font-light mb-3">{useCase.title}</h3>
                    <p className="text-sm text-white/45 leading-relaxed mb-8">{useCase.desc}</p>
                  </div>
                  {/* <div className="flex gap-8 pt-6 border-t border-black/[0.06]">
                    {useCase.stats.map((s) => (
                      <div key={s.l}>
                        <div className="text-2xl font-light">{s.v}</div>
                        <div className="text-[11px] text-black/35 tracking-widest mt-0.5">
                          {s.l}
                        </div>
                      </div>
                    ))}
                  </div> */}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
