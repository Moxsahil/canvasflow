'use client';

import { useCallback, useEffect, useState } from 'react';
import { IntroAnimation, HERO_REVEAL_MS } from '@/components/marketing/intro-animation';

/**
 * The intro plays here rather than at the page root because the two are one
 * move: the curtain retracting is what cues the headline in. `IntroAnimation`
 * paints as a fixed overlay, so it sits inside this section without taking part
 * in its layout.
 */
export function HeroSection() {
  const [heroReady, setHeroReady] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const handleIntroDone = useCallback(() => {
    setHeroReady(true);
  }, []);

  // Start the video zoom slightly before the hero content reveals, so the two
  // overlap instead of running back to back.
  useEffect(() => {
    const t = setTimeout(() => setVideoReady(true), HERO_REVEAL_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <IntroAnimation onDone={handleIntroDone} />

      <section className="relative h-screen overflow-hidden">
        {/* Video background — zooms in once intro is done.
            The recording still has the editor around it. Everything but one
            piece sits in the top 7% of the frame, which any zoom past 1.15
            already swallows; the exception is the properties panel down the
            left, nearly a fifth of the width and most of the height. Zooming
            far enough to clear that on its own would crop to the middle half
            of the frame, so the crop is pushed left instead — the panel goes
            out on one side while the opposite side, which is the emptier half
            of the board, is what ends up behind the headline. Both ends of
            the move stay clear of the panel, since starting under it would
            put the whole thing on show for the two seconds the zoom takes. */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
          src="/videos/hero2.mp4"
          style={{
            transform: videoReady ? 'translateX(-8%) scale(1.35)' : 'translateX(-8%) scale(1.25)',
            transition: 'transform 2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />

        {/* Left edge fade. The panel sits at the frame's own left edge, and the
            recording zooms during the clip, so it changes size and drifts in
            and out of any fixed crop — at one moment gone, at another back as
            a sliver. Rather than chase it with zoom the whole edge is
            dissolved, which settles it at every frame and has the side
            benefit of softening the shapes the crop cuts through instead of
            leaving them sliced off mid-stroke. */}
        <div
          className="absolute inset-y-0 left-0 z-10 pointer-events-none"
          style={{
            width: '20%',
            background:
              'linear-gradient(to right, #F5F4F0 0%, rgba(245,244,240,0.9) 30%, rgba(245,244,240,0.55) 60%, rgba(245,244,240,0.2) 82%, transparent 100%)',
          }}
        />

        {/* Progressive blur + light gradient rising from bottom.
            Two things hold the type apart from the board, and they are not
            interchangeable: the blur takes the edge off the shapes, while the
            wash hides them. Leaning on the wash turned it solid around the
            third line, which killed the footage through the whole lower half
            for no gain the blur was not already giving. So the wash is light
            through the type and only closes near the floor, where it has to,
            or the footage would meet the next section on a hard seam. The
            blur does the rest, and the board stays alive to roughly the
            middle of the last two lines. */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{
            height: '58%',
            background:
              'linear-gradient(to top, #F5F4F0 0%, rgba(245,244,240,0.95) 10%, rgba(245,244,240,0.62) 30%, rgba(245,244,240,0.34) 52%, rgba(245,244,240,0.12) 76%, transparent 100%)',
          }}
        />
        {/* Backdrop blur layers — progressively lighter toward top */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{
            height: '34%',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{
            height: '54%',
            backdropFilter: 'blur(7px)',
            WebkitBackdropFilter: 'blur(7px)',
            maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{
            height: '74%',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          }}
        />

        {/* Spacer so hero content doesn't sit under the fixed nav */}
        <div className="h-20" />

        {/* Title — anchored to bottom left */}
        <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col px-6 md:px-12 pb-12 max-w-3xl">
          <h1
            className="text-6xl sm:text-7xl md:text-8xl font-light text-[#111] leading-[1.0] tracking-tight mb-10"
            style={{
              fontFamily: 'var(--font-ibm-plex-sans), sans-serif',
              opacity: heroReady ? 1 : 0,
              filter: heroReady ? 'blur(0px)' : 'blur(24px)',
              transform: heroReady ? 'translateY(0px)' : 'translateY(32px)',
              transition:
                'opacity 1s cubic-bezier(0.16,1,0.3,1) 0ms, filter 1s cubic-bezier(0.16,1,0.3,1) 0ms, transform 1s cubic-bezier(0.16,1,0.3,1) 0ms',
            }}
          >
            The whiteboard
            <br />
            your whole team
            <br />
            can actually
            <br />
            trust.
          </h1>
        </div>
      </section>
    </>
  );
}
