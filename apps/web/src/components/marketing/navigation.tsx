'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

// Every target is a section this page actually renders, listed in the order it
// renders them — see page.tsx. The sections commented out there get no entry,
// so the bar never offers a link that scrolls nowhere.
const navLinks = [
  { name: 'Product', href: '#platform' },
  { name: 'Use cases', href: '#use-cases' },
  { name: 'How it works', href: '#workflow' },
  { name: 'Pricing', href: '#pricing' },
];

/**
 * The one way in. /open picks up the board the user last touched — creating
 * their first one if they have none — and the middleware sends anyone without
 * a session to /login with this as the `next`, so the same link serves both.
 *
 * Plain anchors rather than next/link on purpose: /open answers with a redirect
 * to the editor, which is a different origin, and a client-side navigation
 * cannot follow it. That is also why the two calls to action are anchors
 * wearing the button's styling via `asChild`, rather than buttons.
 */
const START_HREF = '/open';
const SIGN_IN_HREF = '/login';

/**
 * The bar reads `bg-background`, `text-foreground` and friends, but the page it
 * sits on is light and those tokens are the app's light values. The `cf-nav`
 * class on the header redefines them for this subtree only — see globals.css —
 * so the scrolled pill comes out dark with light type. `font-sans` has to be on
 * the same element: a font family is inherited already resolved, so
 * `--font-sans` set here only takes effect if the utility reading it is here
 * too. Everything in the bar, wordmark included, sits in that one sans — there
 * is no second face to switch to.
 *
 * Before the page scrolls there is no pill, and the bar sits straight on the
 * hero video — which is a cream whiteboard, not a dark backdrop. So the
 * unscrolled state is ink rather than white, written as the same literal
 * `#111` / `black` the rest of the light half of the page uses. Reaching for
 * `text-foreground` here would pick up the inverted value and vanish.
 */
export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // The overlay and the button that opens it are both `md:hidden`, so once the
  // viewport reaches desktop the menu can be neither seen nor dismissed — but
  // the state it left behind still tells the bar to wear its pill, at the top
  // of an unscrolled page. Drop it on the way past the same 768px the `md`
  // utilities use.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeIfDesktop = () => {
      if (desktop.matches) setIsMobileMenuOpen(false);
    };
    closeIfDesktop();
    desktop.addEventListener('change', closeIfDesktop);
    return () => desktop.removeEventListener('change', closeIfDesktop);
  }, []);

  // With the menu open the bar is nothing but its own close button — no pill,
  // no inset, no wordmark — so every affordance the scrolled state would
  // otherwise add stands down. The menu is always closed at desktop width (see
  // the effect above), which keeps this mobile-only without a second
  // breakpoint check. The burger itself is deliberately left out: it needs the
  // light `text-foreground` to read against the open sheet.
  const barChrome = isScrolled && !isMobileMenuOpen;

  return (
    <header
      className={`cf-nav font-sans fixed z-50 transition-all duration-500 ${
        barChrome ? 'top-4 left-4 right-4' : 'top-0 left-0 right-0'
      }`}
    >
      {/* `relative z-50` is load-bearing: the overlay below is positioned at
          z-40, and a positioned element paints over a static one whatever the
          source order, so without this the bar — and the close button in it —
          ends up buried under the open menu.

          Both states spell out border, radius, shadow and blur rather than
          letting the resting one fall back to defaults. Dropping the `border`
          utility would send the width to 0 and the colour to `currentColor` —
          the page's near-black ink — so the hairline animated from pale to
          almost black before collapsing, leaving a dark box over the hero.

          Only the width eases. The pill's fill is near-black while the page
          behind it is cream, so fading it in or out drags a grey rectangle
          across the hero for the length of the transition — which is what
          reads as an outline hanging in mid-air. Switching the paint outright
          and easing the geometry keeps the movement without the smear. */}
      <nav
        className={`relative z-50 mx-auto rounded-2xl border transition-[max-width] duration-500 ${
          barChrome
            ? 'bg-background/80 backdrop-blur-xl border-foreground/10 shadow-lg max-w-[1200px]'
            : 'bg-transparent backdrop-blur-none border-transparent shadow-none max-w-[1400px]'
        }`}
      >
        <div
          className={`flex items-center justify-between transition-all duration-500 px-6 lg:px-8 ${
            barChrome ? 'h-14' : 'h-20'
          }`}
        >
          {/* Logo. `invisible` rather than unmounted so the close button keeps
              its place at the end of the row instead of sliding left, and so
              the hidden link leaves the tab order and the accessibility tree. */}
          <a href="#" className={`flex items-center group ${isMobileMenuOpen ? 'invisible' : ''}`}>
            <span
              className={`tracking-tight transition-all duration-500 ${
                barChrome ? 'text-xl text-foreground' : 'text-2xl text-[#111]'
              }`}
            >
              CanvasFlow
            </span>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-12">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className={`text-sm transition-colors duration-300 relative group ${
                  isScrolled
                    ? 'text-foreground/70 hover:text-foreground'
                    : 'text-black/60 hover:text-black'
                }`}
              >
                {link.name}
                <span
                  className={`absolute -bottom-1 left-0 w-0 h-px transition-all duration-300 group-hover:w-full ${
                    isScrolled ? 'bg-foreground' : 'bg-black'
                  }`}
                />
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            <a
              href={SIGN_IN_HREF}
              className={`transition-all duration-500 ${
                isScrolled
                  ? 'text-xs text-foreground/70 hover:text-foreground'
                  : 'text-sm text-black/60 hover:text-black'
              }`}
            >
              Sign in
            </a>
            <Button
              asChild
              size="sm"
              className={`rounded-full font-medium transition-all duration-500 ${
                isScrolled
                  ? 'bg-foreground hover:bg-foreground/90 text-background px-4 h-8 text-xs'
                  : 'bg-[#111] hover:bg-[#111]/90 text-[#F5F4F0] px-6 text-sm'
              }`}
            >
              <a href={START_HREF}>Open canvas</a>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`md:hidden p-2 transition-colors duration-500 ${
              isScrolled || isMobileMenuOpen ? 'text-foreground' : 'text-[#111]'
            }`}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu - Full Screen Overlay */}
      <div
        className={`md:hidden fixed inset-0 bg-background z-40 transition-all duration-500 ${
          isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ top: 0 }}
      >
        <div className="flex flex-col h-full px-8 pt-28 pb-8">
          {/* Navigation Links */}
          <div className="flex-1 flex flex-col justify-center gap-8">
            {navLinks.map((link, i) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`text-5xl text-foreground hover:text-muted-foreground transition-all duration-500 ${
                  isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: isMobileMenuOpen ? `${i * 75}ms` : '0ms' }}
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Bottom CTAs */}
          <div
            className={`flex gap-4 pt-8 border-t border-foreground/10 transition-all duration-500 ${
              isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: isMobileMenuOpen ? '300ms' : '0ms' }}
          >
            <Button
              asChild
              variant="outline"
              className="flex-1 rounded-full h-14 text-base font-medium"
            >
              <a href={SIGN_IN_HREF} onClick={() => setIsMobileMenuOpen(false)}>
                Sign in
              </a>
            </Button>
            <Button
              asChild
              className="flex-1 bg-foreground text-background rounded-full h-14 text-base font-medium"
            >
              <a href={START_HREF} onClick={() => setIsMobileMenuOpen(false)}>
                Open canvas
              </a>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
