import { LiveBoardCounter, LiveBoardFeed } from '@/components/marketing/live-board-feed';
import { RevealText } from '@/components/marketing/reveal-text';
import { SectionLabel } from '@/components/marketing/section-label';

export function LiveBoardsSection() {
  return (
    <section id="live" className="py-32 px-6 md:px-12 lg:px-20 border-t border-black/[0.06]">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div>
            <SectionLabel>Live right now</SectionLabel>
            <RevealText className="mt-5 text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05]">
              {'Boards in motion,\nright this second.'}
            </RevealText>
            <p className="mt-6 text-base text-black/40 leading-relaxed max-w-sm">
              At any moment, teams around the world are drawing, planning and reviewing together —
              every stroke landing live for everyone.
            </p>
            <div className="mt-10 flex items-end gap-2">
              <LiveBoardCounter />
              <span className="text-black/30 text-sm mb-1 tracking-wide">
                boards open right now
              </span>
            </div>
          </div>
          <div className="relative">
            <LiveBoardFeed />
          </div>
        </div>
      </div>
    </section>
  );
}
