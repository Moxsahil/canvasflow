'use client';

import { BentoCard, trackPointer } from '@/components/marketing/bento-card';
import { RevealText } from '@/components/marketing/reveal-text';
import { SectionLabel } from '@/components/marketing/section-label';

const STEPS = [
  {
    n: '01',
    title: 'Open a board',
    desc: 'One click from your workspace. No template to pick, no setup to sit through.',
    delay: 0,
    img: '/images/OpenBoardMenu.png',
  },
  {
    n: '02',
    title: 'Draw it out',
    desc: 'Shapes, arrows, text, images and frames. Rough strokes snap into clean shapes as you go.',
    delay: 80,
    img: '/images/DrawItOut.jpg',
  },
  {
    n: '03',
    title: 'Share the link',
    desc: 'Viewer or editor access. Set it to expire, or let guests in without an account.',
    delay: 140,
    img: '/images/ShareLink.jpg',
  },
  {
    n: '04',
    title: 'Keep the work',
    desc: 'Export to PNG or .canvasflow whenever you want. Deleted boards restore from trash.',
    delay: 200,
    img: '/images/KeepTheWork.jpg',
  },
];

export function WorkflowSection() {
  return (
    <section id="workflow" className="py-32 px-6 md:px-12 lg:px-20 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="mb-16">
          <SectionLabel dark>Getting started</SectionLabel>
          <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
            {'From blank canvas to shared link \n in under a minute.'}
          </RevealText>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3" onMouseMove={trackPointer}>
          {STEPS.map((step) => (
            <BentoCard
              key={step.n}
              className="relative overflow-hidden flex flex-col min-h-[320px]"
              dark
              delay={step.delay}
            >
              {/* Image at top — mask fades it out strongly before the bottom edge */}
              <div className="absolute inset-x-0 top-0 h-56 pointer-events-none">
                <img
                  src={step.img}
                  alt={step.title}
                  className="w-full h-full object-cover object-top"
                  style={{
                    maskImage: 'linear-gradient(to bottom, black 0%, black 30%, transparent 80%)',
                    WebkitMaskImage:
                      'linear-gradient(to bottom, black 0%, black 30%, transparent 80%)',
                  }}
                />
              </div>
              {/* Number top-left */}
              <div className="relative z-10 p-7">
                <span className="font-pixel text-[11px] text-white/25 tracking-widest block">
                  {step.n}
                </span>
              </div>
              {/* Text pushed further down */}
              <div className="relative z-10 px-7 pb-7 mt-auto pt-16">
                <h3 className="text-2xl font-light mb-3">{step.title}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{step.desc}</p>
              </div>
            </BentoCard>
          ))}
        </div>
      </div>
    </section>
  );
}
