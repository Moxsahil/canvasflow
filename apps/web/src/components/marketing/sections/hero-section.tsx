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
        {/* Video background — zooms in once intro is done */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
          src="/videos/hero.mp4"
          style={{
            transform: videoReady ? 'scale(1.05)' : 'scale(0.85)',
            transition: 'transform 2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />

        {/* Progressive blur + light gradient rising from bottom */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{
            height: '65%',
            background:
              'linear-gradient(to top, #F5F4F0 0%, #F5F4F0 18%, rgba(245,244,240,0.85) 35%, rgba(245,244,240,0.5) 55%, rgba(245,244,240,0.15) 75%, transparent 100%)',
          }}
        />
        {/* Backdrop blur layers — progressively lighter toward top */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{
            height: '20%',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{
            height: '38%',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{
            height: '55%',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
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
