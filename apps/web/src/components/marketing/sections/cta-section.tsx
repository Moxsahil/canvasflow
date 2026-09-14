'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInView } from '@/components/marketing/use-in-view';

/**
 * The one way in. /open picks up the board the user last touched — creating
 * their first one if they have none — and the middleware sends anyone without
 * a session to /login with this as the `next`, so the same link serves both.
 *
 * A plain anchor rather than next/link: /open answers with a redirect to the
 * editor, which is a different origin, and a client-side navigation cannot
 * follow it. `asChild` is what lets the anchor wear the button's styling.
 */
const START_HREF = '/open';

/**
 * `cf-cta` swaps the palette for this subtree — the layout is written against
 * `border-foreground`, `text-muted-foreground` and `bg-foreground`, and this
 * page's values for those are the light ones. Same mechanism as the nav and
 * the pricing block; see globals.css.
 */
export function CtaSection() {
  const { ref, inView } = useInView(0.2);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <section
      ref={ref}
      className="cf-cta font-sans relative py-24 lg:py-32 px-6 md:px-12 lg:px-20 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto">
        <div
          className={`relative border border-foreground transition-all duration-1000 ${
            inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          onMouseMove={handleMouseMove}
        >
          {/* Spotlight effect */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none transition-opacity duration-300"
            style={{
              background: `radial-gradient(600px circle at ${mousePosition.x}% ${mousePosition.y}%, rgba(0,0,0,0.15), transparent 40%)`,
            }}
          />

          <div className="relative z-10 px-8 lg:px-16 py-16 lg:py-24">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
              {/* Left content */}
              <div className="flex-1">
                <h2 className="text-6xl md:text-7xl lg:text-[72px] tracking-tight mb-8 leading-[0.95]">
                  Ready to bring
                  <br />
                  your ideas to life?
                </h2>

                <p className="text-xl text-muted-foreground mb-12 leading-relaxed max-w-xl">
                  Join teams designing, diagramming, and brainstorming on CanvasFlow. Open your
                  first board in seconds.
                </p>

                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <Button
                    asChild
                    size="lg"
                    className="bg-foreground hover:bg-foreground/90 text-background px-8 h-14 text-base font-medium rounded-full group"
                  >
                    <a href={START_HREF}>
                      Open your first board
                      <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                    </a>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 px-8 text-base font-medium rounded-full border-foreground/20 hover:bg-foreground/5"
                  >
                    Book a demo
                  </Button>
                </div>

                <p className="text-sm text-muted-foreground mt-8 font-mono">
                  Free forever for personal use
                </p>
              </div>

              {/* Right image — left empty on purpose; drop an <img> in here and
                  it lands where the reference puts its own.

                  The width is a share of the row rather than the reference's
                  flat 600px. That figure was measured against a wider container
                  than this page uses, and inside ours it left the heading 438px
                  to play with when its longest line needs 569 — so the two
                  lines it is written to break into came out as four. A share
                  keeps the text column ahead of that number as the row
                  narrows. */}
              <div className="hidden lg:flex items-end justify-center w-[38%] max-w-[480px] h-[520px] shrink-0 -mr-16" />
            </div>
          </div>

          {/* Decorative corner */}
          <div className="absolute top-0 right-0 w-32 h-32 border-b border-l border-foreground/10" />
          <div className="absolute bottom-0 left-0 w-32 h-32 border-t border-r border-foreground/10" />
        </div>
      </div>
    </section>
  );
}
