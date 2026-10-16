import { Navigation } from '@/components/marketing/navigation';
// import { CapabilitiesMarquee } from '@/components/marketing/sections/capabilities-marquee';
import { CtaSection } from '@/components/marketing/sections/cta-section';
// import { DevExSection } from '@/components/marketing/sections/devex-section';
import { HeroSection } from '@/components/marketing/sections/hero-section';
import { LogoCloudSection } from '@/components/marketing/sections/logo-cloud-section';
// import { IntegrationsSection } from '@/components/marketing/sections/integrations-section';
// import { LiveBoardsSection } from '@/components/marketing/sections/live-boards-section';
import { PlatformSection } from '@/components/marketing/sections/platform-section';
import { PricingSection } from '@/components/marketing/sections/pricing-section';
// import { SecuritySection } from '@/components/marketing/sections/security-section';
import { SiteFooter } from '@/components/marketing/sections/site-footer';
import { SyncSection } from '@/components/marketing/sections/sync-section';
import { UseCasesSection } from '@/components/marketing/sections/use-cases-section';
import { WorkflowSection } from '@/components/marketing/sections/workflow-section';

// The figures in SyncSection are counted from the database, so the page is
// regenerated on a schedule rather than frozen at build: static to serve, but
// never far out of date. The window is short on purpose. A render that cannot
// reach the database drops the figures, and whatever a render produces is what
// gets cached — so this doubles as the longest a moment's bad luck can keep
// the section looking empty.
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
    <div className="cf-landing bg-[#F5F4F0] text-[#111] min-h-screen font-sans antialiased">
      <script
        type="application/ld+json"
        // A constant written above, so there is nothing here to escape.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <Navigation />

      <HeroSection />
      <PlatformSection />

      {/* The page turns over here: everything from the use cases down is
          painted on #020204, so each section inside asks its shared parts
          (BentoCard, Tag) for their dark form. */}
      <div className="bg-[#020204] text-[#F5F4F0]">
        <UseCasesSection />
        <LogoCloudSection />
        <WorkflowSection />
        <SyncSection />
        {/* <IntegrationsSection /> */}
        {/* <SecuritySection /> */}
        {/* <DevExSection /> */}
        {/* <CapabilitiesMarquee /> */}
        {/* <LiveBoardsSection /> */}
        <PricingSection />
        <CtaSection />
        <SiteFooter />
      </div>
    </div>
  );
}
