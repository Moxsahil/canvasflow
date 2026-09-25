import { Navigation } from '@/components/marketing/navigation';
import { SiteFooter } from '@/components/marketing/sections/site-footer';

/**
 * The shell every legal page sits in: the site's own nav and footer around one
 * reading column, on the cream the home page opens with. `cf-legal` gives the
 * subtree the home page's type — see globals.css.
 *
 * The nav is fixed, so the column starts clear of it.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cf-legal bg-[#F5F4F0] text-[#111] min-h-screen font-sans antialiased">
      <Navigation />
      <main className="px-6 md:px-12 pt-36 md:pt-44 pb-24 md:pb-32">{children}</main>
      {/* The footer is drawn for the dark half of the home page. */}
      <div className="bg-[#020204] text-[#F5F4F0]">
        <SiteFooter />
      </div>
    </div>
  );
}
