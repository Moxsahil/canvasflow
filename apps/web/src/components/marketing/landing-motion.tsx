'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/** Where in the window a block has to reach before it plays: a little above the bottom edge. */
const START = 'top 88%';
/** Fast off the mark, long soft landing. */
const EASE = 'power3.out';
/** A little before the CSS failsafe (4s) shows everything anyway. */
const FAILSAFE_MS = 3600;

/**
 * The landing page's scroll motion, played once per visit as each part comes
 * into view. The sections only mark what moves, so they stay server-rendered:
 *
 * - `data-reveal="children"` — its children rise and fade in one after another.
 * - `data-reveal="self"` — the element itself rises and fades in.
 * - `data-split` — a heading whose words rise out of their own lines in turn.
 *
 * The hidden starting state is in globals.css, applied before the first paint
 * so nothing shows and then vanishes. It is only there when scripts can run and
 * the visitor hasn't asked for less movement, so without either the page is
 * simply still; and if this never runs, a failsafe there brings everything
 * in after a few seconds. `data-motion="on"` tells the CSS this has taken
 * over, which it only does in time to beat the failsafe: arriving later, it
 * would hide what the visitor is already reading just to play it in again.
 */
export function LandingMotion({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (performance.now() > FAILSAFE_MS) return;
        el.dataset.motion = 'on';

        for (const group of gsap.utils.toArray<HTMLElement>('[data-reveal="children"]', el)) {
          const items = Array.from(group.children).filter(
            (child) => !(child as HTMLElement).hasAttribute('data-split'),
          );
          // `from`, so each lands on its own opacity: some are meant to be faint.
          gsap.from(items, {
            autoAlpha: 0,
            y: 24,
            duration: 0.9,
            ease: EASE,
            stagger: 0.09,
            clearProps: 'transform',
            scrollTrigger: { trigger: group, start: START, once: true },
          });
        }

        for (const item of gsap.utils.toArray<HTMLElement>('[data-reveal="self"]', el)) {
          gsap.from(item, {
            autoAlpha: 0,
            y: 16,
            duration: 0.9,
            ease: EASE,
            clearProps: 'transform',
            scrollTrigger: { trigger: item, start: START, once: true },
          });
        }

        for (const heading of gsap.utils.toArray<HTMLElement>('[data-split]', el)) {
          SplitText.create(heading, {
            type: 'words',
            mask: 'words',
            wordsClass: 'cf-word',
            // Splits again when the fonts land or the width changes, so lines
            // still break where the browser would break them. The animation
            // returned here is carried over to the new words at the point it
            // had reached.
            autoSplit: true,
            onSplit(split) {
              gsap.set(heading, { visibility: 'inherit' });
              return gsap.from(split.words, {
                yPercent: 110,
                duration: 0.9,
                ease: EASE,
                stagger: 0.045,
                scrollTrigger: { trigger: heading, start: START, once: true },
              });
            },
          });
        }

        // Pictures and fonts landing late move everything below them.
        const refresh = () => ScrollTrigger.refresh();
        window.addEventListener('load', refresh);
        return () => window.removeEventListener('load', refresh);
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className={className} style={style}>
      {children}
    </div>
  );
}
