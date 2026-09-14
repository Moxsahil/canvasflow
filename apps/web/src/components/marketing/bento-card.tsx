'use client';

import React from 'react';
import { useInView } from '@/components/marketing/use-in-view';

/**
 * Feeds the hover glow below. Put it on the grid that wraps the cards, not on
 * a card: the position is measured against the grid, so the glow tracks across
 * a row as one light source rather than restarting inside each card.
 */
export function trackPointer(e: React.MouseEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
  el.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
}

/** A panel that fades and lifts into place the first time it is scrolled to. */
export function BentoCard({
  children,
  className = '',
  delay = 0,
  dark = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** Set on the page's dark half: a lifted surface instead of white paper. */
  dark?: boolean;
}) {
  const { ref, inView } = useInView(0.1);
  const surface = dark
    ? 'border-white/[0.08] bg-[#0A0A0E] hover:border-white/20 hover:bg-[#101016]'
    : 'border-black/[0.07] bg-white hover:border-black/[0.15] hover:bg-[#fafaf8]';
  return (
    <div
      ref={ref}
      className={`group relative rounded-2xl border overflow-hidden transition-all duration-700 ${surface} ${className}`}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms, border-color 0.3s ease, background-color 0.3s ease`,
      }}
    >
      {/* Hover glow spot */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${
            dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'
          }, transparent 60%)`,
        }}
      />
      {children}
    </div>
  );
}
