import type { CSSProperties } from 'react';
import { FeatureGrid } from '@/components/marketing/sections/feature-grid';
import { HowItWorks } from '@/components/marketing/sections/how-it-works';
import { PlanComparator } from '@/components/marketing/sections/plan-comparator';
import { PricingCards } from '@/components/marketing/sections/pricing-cards';
import { SignupCta } from '@/components/marketing/sections/signup-cta';
import { SiteFooter } from '@/components/marketing/sections/site-footer';
import { StatsBento } from '@/components/marketing/sections/stats-bento';
import HeroSection from '@/components/ui/hero-section';

// The figures in StatsBento are read from the services and the database, so
// the page is regenerated on a schedule rather than frozen at build: static to
// serve, but never far out of date. The window is short on purpose. A render
// that cannot reach them shows dashes, and whatever a render produces is what
// gets cached — so this doubles as the longest a moment's bad luck can keep
// the figures missing.
export const revalidate = 300;

/**
 * What CanvasFlow is, said to search engines in their own terms: the company
 * and its logo, the site and the names people search for it by, and the
 * whiteboard at the editor's address as the app this site is for. The live
 * addresses, as in the sitemap, so a preview build describes the real site.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://canvasflowapp.com/#organization',
      name: 'CanvasFlow',
      url: 'https://canvasflowapp.com/',
      logo: 'https://canvasflowapp.com/brand/logo-512.png',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://canvasflowapp.com/#website',
      name: 'CanvasFlow',
      alternateName: ['CanvasFlow App', 'canvasflowapp', 'CanvasFlow Whiteboard'],
      url: 'https://canvasflowapp.com/',
      publisher: { '@id': 'https://canvasflowapp.com/#organization' },
    },
    {
      '@type': 'WebApplication',
      name: 'CanvasFlow Whiteboard',
      url: 'https://app.canvasflowapp.com/',
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': 'https://canvasflowapp.com/#organization' },
    },
  ],
};

/**
 * The `cf-landing` class is what scopes this page's type scale and hidden
 * scrollbar in globals.css — without it the page inherits the app's Inter.
 */
export default function HomePage() {
  return (
    <div className="cf-landing min-h-screen bg-[#101012] font-sans text-[#fafafa] antialiased">
      <script
        type="application/ld+json"
        // A constant written above, so there is nothing here to escape.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      {/* The hero brings its own header. It reads Inter from `--font-inter`;
          `--font-sans` is Geist on this page, so it is pointed at the Inter
          kept for exactly this (`--font-inter-ui`), with the same letterforms
          as the sections under it. */}
      <HeroSection
        className="dark"
        style={
          {
            '--font-inter': 'var(--font-inter-ui)',
            fontFeatureSettings: "'cv05', 'cv10', 'cv11', 'ss01'",
          } as CSSProperties
        }
      />
      {/* On the hero's own dark ground, so the two read as one opening. */}
      <FeatureGrid id="features" className="scroll-mt-16 bg-[#101012] pt-8" />
      <HowItWorks id="how-it-works" className="scroll-mt-16 bg-[#101012] pt-8" />
      <StatsBento id="performance" className="scroll-mt-16 bg-[#101012] pt-8" />
      <PricingCards id="pricing" className="scroll-mt-16 bg-[#101012] md:pb-12" />
      <PlanComparator id="compare-plans" className="scroll-mt-16 bg-[#101012] md:pt-0" />
      <SignupCta id="get-started" className="scroll-mt-16 bg-[#101012]" />

      <SiteFooter className="bg-[#101012]" />
    </div>
  );
}
