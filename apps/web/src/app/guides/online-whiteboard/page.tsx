import { Navigation } from '@/components/marketing/navigation';
import { SiteFooter } from '@/components/marketing/sections/site-footer';
import { APP_URL, publicPageMetadata } from '@/lib/seo';

export const metadata = publicPageMetadata(
  'How to Use an Online Whiteboard for Teamwork — CanvasFlow',
  'Plan a useful whiteboard session: gather ideas, draw a workflow, collaborate with your team and export the result. A practical guide using CanvasFlow.',
  '/guides/online-whiteboard',
);

const sections = [
  {
    title: 'What is an online whiteboard?',
    paragraphs: [
      'An online whiteboard is a shared visual space in your browser. Instead of fitting every idea into a document or slide, you can place text, shapes, drawings and images next to each other, then connect them with arrows. A team can work on the same board during a meeting and return to it afterward.',
      'CanvasFlow gives you an infinite canvas with real-time collaboration, frames to organize sections, and viewer or editor sharing. It is useful when the relationship between ideas matters as much as the words: brainstorming, explaining a system, mapping a process or planning a project.',
    ],
  },
  {
    title: '1. Start with one question',
    paragraphs: [
      'Before inviting anyone, write the question your session should answer at the top of the board. “How should a new customer get started?” is easier to work with than “Product ideas.” Add any constraints beside it, such as the audience, available time or decision you need to make.',
      'Open CanvasFlow and sign in to create a board. Give it a name that your teammates will recognize later. Create separate frames for the context, ideas and decisions so a large canvas still has a clear reading order.',
    ],
  },
  {
    title: '2. Make ideas visible',
    paragraphs: [
      'Use text for short ideas, shapes for steps or groups, and arrows for relationships. For a workflow, start with its beginning and end, then fill in the steps between them. Label a branching arrow with the condition that decides which way the process goes.',
      'Keep one idea in each text block and group related ideas together. Images can add useful context, but a short label helps someone understand them without having attended the meeting. Use color consistently, such as one color for open questions and another for agreed decisions.',
    ],
  },
  {
    title: '3. Invite the right people',
    paragraphs: [
      'Choose whether a shared link should let people view or edit the board. CanvasFlow also supports guest access when enabled for a share link, so an invited participant can join without creating an account. Review the access settings before sending the link, and revoke it when it is no longer needed.',
      'During a session, let everyone add ideas before discussing them as a group. Live cursors show where collaborators are working. Use follow mode when one person needs to walk the group through a diagram, then return to independent exploration.',
    ],
  },
  {
    title: '4. Leave a useful result',
    paragraphs: [
      'End with a frame that records the decision, unresolved questions and next steps. Give each next step an owner in the text. This turns a busy brainstorm into something the team can act on.',
      'Keep the board link for continued collaboration, export a PNG or SVG for a document or presentation, or save a .canvasflow file for reuse. Revisit the board when the process changes rather than letting an old diagram become the only source of context.',
    ],
  },
  {
    title: 'Choosing a whiteboard application',
    paragraphs: [
      'Try a small real task when comparing whiteboard applications. Check whether your team can draw and label a simple flow, find its way around a larger board, understand sharing permissions and export a useful result. The right choice is the one that fits how you work together.',
      'CanvasFlow focuses on collaborative drawing in the browser. Explore the editor with a short planning session, then decide whether its canvas, sharing controls and export options suit your team.',
    ],
  },
];

export default function WhiteboardGuide() {
  return (
    <div className="cf-landing min-h-screen bg-[#F5F4F0] text-[#111] font-sans">
      <Navigation />
      <main className="mx-auto max-w-3xl px-6 pt-36 pb-24 md:pt-44">
        <nav aria-label="Breadcrumb" className="mb-10 text-sm text-black/60">
          <a href="/" className="underline underline-offset-4">
            CanvasFlow
          </a>
          <span aria-hidden="true"> / </span>
          <span>Whiteboard guide</span>
        </nav>
        <article>
          <p className="mb-5 text-xs uppercase tracking-[0.2em] text-black/60">A practical guide</p>
          <h1 className="text-4xl md:text-6xl font-light tracking-tight leading-[1.1]">
            How to use an online whiteboard for teamwork
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-black/70">
            A good whiteboard session gives your team a shared picture of a problem and a clear next
            step. Here is a simple way to get there with CanvasFlow.
          </p>
          <div className="mt-14 space-y-12">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="mb-4 text-2xl font-medium tracking-tight">{section.title}</h2>
                <div className="space-y-4 text-base leading-8 text-black/75">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
        <aside className="mt-16 border-t border-black/15 pt-8">
          <h2 className="text-2xl font-medium">Put your next idea on a board.</h2>
          <p className="mt-3 mb-6 text-black/70">
            Open the CanvasFlow app to get started, or explore the product and sharing features.
          </p>
          <div className="flex flex-wrap gap-5 items-center">
            <a href={`${APP_URL}/`} className="rounded-full bg-[#111] px-6 py-3 text-white">
              Open CanvasFlow app
            </a>
            <a href="/#platform" className="underline underline-offset-4">
              Explore the whiteboard
            </a>
          </div>
        </aside>
      </main>
      <div className="bg-[#020204] text-[#F5F4F0]">
        <SiteFooter />
      </div>
    </div>
  );
}
