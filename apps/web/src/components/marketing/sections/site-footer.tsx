import { CONTACT } from '@/lib/legal';
import { getLiveMetrics } from '@/lib/marketing/live-metrics';
import { cn } from '@/lib/utils';
import { WHITEBOARD_HREF } from '@/lib/whiteboard';
import { NewsletterForm } from './newsletter-form';
import { SECTION_TYPE } from './section-type';

/** The link columns, every one pointing at a page or section that exists. */
const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'Whiteboard', href: WHITEBOARD_HREF },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Compare plans', href: '/#compare-plans' },
      { label: 'Performance', href: '/#performance' },
      { label: 'Support', href: `mailto:${CONTACT.support}` },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Refunds', href: '/refunds' },
    ],
  },
] as const;

/**
 * The social accounts, in the template's corner. An empty address leaves the
 * icon in place pointing nowhere yet; fill each in as the account exists.
 */
const SOCIALS = [
  {
    label: 'Instagram',
    href: '',
    path: 'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4zm9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8A1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5a5 5 0 0 1-5 5a5 5 0 0 1-5-5a5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3a3 3 0 0 0 3 3a3 3 0 0 0 3-3a3 3 0 0 0-3-3',
  },
  {
    label: 'X/Twitter',
    href: '',
    path: 'M10.488 14.651L15.25 21h7l-7.858-10.478L20.93 3h-2.65l-5.117 5.886L8.75 3h-7l7.51 10.015L2.32 21h2.65zM16.25 19L5.75 5h2l10.5 14z',
  },
  {
    label: 'LinkedIn',
    href: '',
    path: 'M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z',
  },
] as const;

const link = 'block text-[#9f9fa9] transition-colors duration-150 hover:text-[#4d84fd]';

/**
 * The page's foot: the mark and where CanvasFlow is made, a dotted rule,
 * three columns of links beside the newsletter box, and a strip with the
 * copyright and whether the services answer right now.
 *
 * On the landing page.
 */
export async function SiteFooter({ className }: { className?: string }) {
  const metrics = await getLiveMetrics();
  const allUp = metrics.apiUp && metrics.syncUp;

  return (
    <footer
      className={cn(
        'bg-[#09090b] pt-8 text-[#fafafa] antialiased sm:pt-20',
        SECTION_TYPE,
        className,
      )}
    >
      <div data-reveal="children" className="mx-auto max-w-5xl space-y-16 px-6">
        <div className="flex flex-wrap justify-between gap-6">
          <div className="max-w-xs space-y-6">
            <a aria-label="CanvasFlow home" className="flex size-fit items-center gap-1.5" href="/">
              <svg className="size-5" viewBox="20 20 80 80" fill="currentColor" aria-hidden="true">
                <path d="M34.5 34.5H67.5L58.5 44.5H32V73.5H58.5L50 83H34.5A12 12 0 0 1 22.5 71V46.5A12 12 0 0 1 34.5 34.5ZM73.5 34.5H98.5V44.5H72.5V54.5H98.5L92.5 64.5H72.5V83H63V46.2Z" />
              </svg>
              <span className="text-lg font-semibold tracking-tight">CanvasFlow</span>
            </a>
            <p className="text-sm text-balance text-[#9f9fa9]">Rohtak, Haryana - India</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href || '#'}
                target={social.href ? '_blank' : undefined}
                rel="noopener noreferrer"
                aria-label={social.label}
                className="block text-[#9f9fa9] hover:text-[#4d84fd]"
              >
                <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d={social.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="h-px bg-[linear-gradient(90deg,#fafafa_1px,transparent_1px)] bg-size-[6px_1px] bg-repeat-x opacity-25"
        />

        <div className="grid gap-12 md:grid-cols-5">
          <div className="grid gap-6 sm:grid-cols-3 md:col-span-3">
            {COLUMNS.map((column) => (
              <div key={column.title} className="space-y-4 text-sm">
                <span className="block font-medium">{column.title}</span>
                <div className="flex flex-wrap gap-4 sm:flex-col">
                  {column.links.map((item) => (
                    <a key={item.label} className={link} href={item.href}>
                      <span>{item.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="md:col-span-2">
            <NewsletterForm />
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-4 border-t border-white/10 py-8">
          <span className="text-sm text-[#9f9fa9]">
            © {new Date().getFullYear()} CanvasFlow, All rights reserved
          </span>
          <a
            href="/#performance"
            className="flex items-center gap-2 rounded-full border border-transparent bg-[#111113] py-1 pr-4 pl-2 shadow ring-1 ring-white/5"
          >
            <span className="relative flex size-3">
              <span
                className={cn(
                  'absolute inset-0 block size-full animate-pulse rounded-full',
                  allUp ? 'bg-emerald-100' : 'bg-amber-100',
                )}
              />
              <span
                className={cn(
                  'relative m-auto block size-1 rounded-full',
                  allUp ? 'bg-emerald-500' : 'bg-amber-500',
                )}
              />
            </span>
            <span className="text-sm">
              {allUp ? 'All Systems Normal' : 'Some Systems Not Answering'}
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
