'use client';

import { useState } from 'react';

export function CtaSection() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <section className="relative py-32 px-6 md:px-12 lg:px-20 border-t border-white/[0.08] overflow-hidden">
      {/* Glass panels image — anchored to bottom center */}
      <img
        src="/images/footer.png"
        alt=""
        aria-hidden="true"
        className="absolute bottom-0 left-0 w-full object-cover object-bottom pointer-events-none select-none"
        style={{ opacity: 0.35 }}
      />
      {/* Progressive blur from bottom — blends into site bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          maskImage: 'linear-gradient(to top, transparent 0%, black 55%)',
          WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 55%)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
        }}
      />
      {/* Colour fade from bottom to site bg #020204 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to top, rgb(2,2,4) 0%, rgba(2,2,4,0.92) 18%, rgba(2,2,4,0.55) 35%, transparent 55%)',
        }}
      />
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05] mb-6">
          Start with a
          <br />
          blank canvas.
        </h2>
        <p className="text-sm text-white/45 leading-relaxed mb-10">
          Join thousands of teams thinking out loud on one board, across every timezone.
        </p>
        {!submitted ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email) setSubmitted(true);
            }}
            className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto"
          >
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 bg-white/[0.04] border border-white/15 rounded-xl px-4 py-3 text-sm text-[#F5F4F0] placeholder:text-white/25 focus:outline-none focus:border-white/35 transition-colors"
            />
            <button
              type="submit"
              className="px-8 py-3 bg-[#F5F4F0] text-[#020204] text-sm rounded-xl hover:bg-white transition-colors tracking-widest font-medium"
            >
              JOIN
            </button>
          </form>
        ) : (
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300 text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {"You're on the list. We'll be in touch."}
          </div>
        )}
      </div>
    </section>
  );
}
