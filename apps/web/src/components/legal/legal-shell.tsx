import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/marketing/sections/site-footer';
import { SiteHeader } from '@/components/ui/hero-section';
import { cn } from '@/lib/utils';

/**
 * The frame for the legal pages in the site's new look: the landing page's
 * header and footer around one reading column, on the same dark ground and in
 * the same Inter.
 */
export function LegalShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "cf-legal min-h-screen bg-[#101012] font-[family-name:var(--font-inter-ui)] text-[#fafafa] antialiased [font-feature-settings:'cv05','cv10','cv11','ss01']",
        className,
      )}
    >
      <SiteHeader />
      {/* As wide as the header and footer, so the page's edges line up top to bottom. */}
      <main className="mx-auto max-w-5xl px-6 pt-36 pb-24 md:pt-44 md:pb-32">{children}</main>
      <SiteFooter className="bg-[#101012]" />
    </div>
  );
}
