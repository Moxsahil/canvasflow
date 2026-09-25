import type { ReactNode } from 'react';
import { SectionLabel } from '@/components/marketing/section-label';

export type LegalSection = {
  /** The anchor the contents list jumps to. */
  id: string;
  title: string;
  body: ReactNode;
};

/**
 * Section bodies are written as plain `p`, `ul`, `a` and `strong`, and take
 * their typography from here, so a page's text reads as text rather than as a
 * pile of styled components.
 */
const PROSE = [
  'space-y-4',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2',
  '[&_li]:pl-1 [&_li]:marker:text-black/30',
  '[&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-black/25 [&_a:hover]:decoration-black',
  '[&_strong]:font-medium [&_strong]:text-black',
].join(' ');

/** Parsed and printed in UTC, so the date never slips a day for the server's zone. */
const UPDATED_FORMAT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** The same two-digit numbering the pricing cards use. */
const sectionNumber = (index: number) => String(index + 1).padStart(2, '0');

/**
 * One legal page: its title and when it last changed, an introduction, a
 * contents list, then the numbered sections. The numbers are decoration — the
 * text refers to sections by name — so they are hidden from screen readers.
 */
export function LegalDocument({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  /** When the text last changed, as `YYYY-MM-DD`. */
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <article className="max-w-2xl mx-auto">
      <header>
        <SectionLabel>Legal</SectionLabel>
        <h1 className="mt-8 text-5xl md:text-6xl tracking-tight leading-[0.95]">{title}</h1>
        <p className="mt-6 text-sm text-black/60">
          Last updated <time dateTime={updated}>{UPDATED_FORMAT.format(new Date(updated))}</time>
        </p>
        <div className={`mt-10 text-lg leading-8 text-black/75 ${PROSE}`}>{intro}</div>
      </header>

      <nav aria-labelledby="contents" className="mt-12 py-8 border-y border-black/10">
        <h2 id="contents" className="font-mono text-xs uppercase tracking-widest text-black/55">
          Contents
        </h2>
        <ol className="mt-5 md:columns-2 gap-10 text-[15px]">
          {sections.map((section, index) => (
            <li key={section.id} className="pb-2.5 break-inside-avoid">
              <a
                href={`#${section.id}`}
                className="group flex gap-3 text-black/65 hover:text-black transition-colors"
              >
                <span aria-hidden="true" className="pt-0.5 font-mono text-xs text-black/40">
                  {sectionNumber(index)}
                </span>
                <span className="underline-offset-4 group-hover:underline">{section.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-title`}
          className="mt-16 scroll-mt-28"
        >
          <span aria-hidden="true" className="font-mono text-xs text-black/40">
            {sectionNumber(index)}
          </span>
          <h2 id={`${section.id}-title`} className="mt-2 text-2xl md:text-3xl tracking-tight">
            {section.title}
          </h2>
          <div className={`mt-5 text-[17px] leading-[1.7] text-black/75 ${PROSE}`}>
            {section.body}
          </div>
        </section>
      ))}
    </article>
  );
}
