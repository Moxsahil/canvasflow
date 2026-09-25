// Rooted at `/` for the same reason as the nav's links: the legal pages end in
// this footer too.
const SECTION_LINKS = [
  { label: 'Platform', href: '/#platform' },
  { label: 'Use cases', href: '/#use-cases' },
  { label: 'Workflow', href: '/#workflow' },
  { label: 'Integrations', href: '/#integrations' },
  { label: 'Live', href: '/#live' },
  { label: 'Pricing', href: '/#pricing' },
];

const LEGAL_LINKS = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Docs', href: '#' },
  { label: 'GitHub', href: '#' },
];

export function SiteFooter() {
  return (
    <footer className="py-10 px-6 md:px-12 lg:px-20 border-t border-white/[0.08]">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <span className="font-pixel text-xs tracking-[0.25em] text-white/50">CanvasFlow</span>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          {SECTION_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-xs text-white/35 hover:text-white/70 transition-colors tracking-widest"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-6">
          {LEGAL_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-xs text-white/25 hover:text-white/55 transition-colors tracking-widest"
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-white/[0.06]">
        <span className="text-xs text-white/20">© 2026 CanvasFlow. All rights reserved.</span>
      </div>
    </footer>
  );
}
