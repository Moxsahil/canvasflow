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
 * The `cf-landing` class is what scopes this page's type scale and hidden
 * scrollbar in globals.css — without it the page inherits the app's Inter.
 */
export default function HomePage() {
  return (
    <div className="cf-landing bg-[#F5F4F0] text-[#111] min-h-screen font-sans antialiased">
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
