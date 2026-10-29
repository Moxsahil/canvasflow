import type { ReactNode } from 'react';

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
  '[&_li]:pl-1 [&_li]:marker:text-white/30',
  '[&_a]:text-[#4d84fd] [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-[#4d84fd]/40 [&_a:hover]:decoration-[#4d84fd]',
  '[&_strong]:font-medium [&_strong]:text-white',
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
    <article>
      <header>
        <p className="text-sm font-medium text-[#4d84fd]">Legal</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-sm text-[#9f9fa9]">
          Last updated <time dateTime={updated}>{UPDATED_FORMAT.format(new Date(updated))}</time>
        </p>
        <div className={`mt-10 text-lg leading-8 text-white/70 ${PROSE}`}>{intro}</div>
      </header>

      <nav aria-labelledby="contents" className="mt-12 py-8 border-y border-white/10">
        <h2
          id="contents"
          className="font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-widest text-[#9f9fa9]"
        >
          Contents
        </h2>
        <ol className="mt-5 md:columns-2 gap-10 text-[15px]">
          {sections.map((section, index) => (
            <li key={section.id} className="pb-2.5 break-inside-avoid">
              <a
                href={`#${section.id}`}
                className="group flex gap-3 text-white/65 transition-colors hover:text-white"
              >
                <span
                  aria-hidden="true"
                  className="pt-0.5 font-[family-name:var(--font-geist-mono)] text-xs text-white/35"
                >
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
          <span
            aria-hidden="true"
            className="font-[family-name:var(--font-geist-mono)] text-xs text-white/35"
          >
            {sectionNumber(index)}
          </span>
          <h2
            id={`${section.id}-title`}
            className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl"
          >
            {section.title}
          </h2>
          <div className={`mt-5 text-[17px] leading-[1.7] text-white/70 ${PROSE}`}>
            {section.body}
          </div>
        </section>
      ))}
    </article>
  );
}
