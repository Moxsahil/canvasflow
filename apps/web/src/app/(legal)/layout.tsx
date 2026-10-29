import { LegalShell } from '@/components/legal/legal-shell';

/**
 * The shell every legal page sits in: the landing page's header and footer
 * around one reading column, on the site's dark ground. See LegalShell.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <LegalShell>{children}</LegalShell>;
}
