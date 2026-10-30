import { Activity, Download, MessageSquare, PenTool, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTION_TYPE } from './section-type';
import { AiComposer } from './ai-composer';
import { PeerList } from './peer-list';

/**
 * A heading, then two large features over four small ones, in a ruled grid
 * with a cross at each corner: who is on a board right now on the left, the AI panel on the
 * right, and below them the smaller things a team reaches for every day.
 * Painted for the dark page the hero sits on, with its own colours rather
 * than the app's tokens, which are the light app's.
 *
 * On the landing page under the hero.
 */
export function FeatureGrid({ id, className }: { id?: string; className?: string }) {
  return (
    <section
      id={id}
      className={cn(
        '@container bg-[#09090b] py-24 text-[#fafafa] antialiased',
        SECTION_TYPE,
        className,
      )}
    >
      <div className="mx-auto w-full max-w-5xl px-6 xl:px-0">
        <div className="max-w-xl" data-reveal="children">
          <p className="text-sm font-medium text-[#4d84fd]">Features</p>
          <h2
            data-split
            className="mt-3 text-3xl font-semibold tracking-tight text-balance @4xl:text-4xl"
          >
            Everything your team needs on one board
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#9f9fa9]">
            Draw together live, let AI turn words into diagrams, and keep the conversation on the
            canvas.
          </p>
        </div>

        <div className="relative mt-14">
          <Corner className="-translate-[calc(50%-0.5px)]" />
          <Corner className="right-0 translate-x-[calc(50%-0.5px)] -translate-y-[calc(50%-0.5px)]" />
          <Corner className="right-0 bottom-0 translate-x-[calc(50%-0.5px)] translate-y-[calc(50%-0.5px)]" />
          <Corner className="bottom-0 -translate-x-[calc(50%-0.5px)] translate-y-[calc(50%-0.5px)]" />
          <div
            data-reveal="children"
            className="relative grid grid-cols-2 divide-x divide-y divide-white/10 overflow-hidden border border-white/10 *:p-4 @max-4xl:*:first:border-r-0 *:nth-1:border-b! *:nth-2:border-r-0 @max-4xl:*:nth-4:border-r-0 @max-4xl:*:nth-5:border-b-0 @4xl:grid-cols-4 @4xl:*:p-8 @4xl:*:not-nth-2:border-b-0"
          >
            <div className="col-span-full row-span-2 grid grid-rows-subgrid gap-8 p-8! @4xl:col-span-2">
              <div className="mx-auto w-full max-w-84 self-center">
                <PeerList />
              </div>
              <div className="mx-auto max-w-sm text-center">
                <h3 className="font-semibold text-balance">Work on it together, live</h3>
                <p className="mt-3 text-[15px] text-[#9f9fa9]">
                  See who&apos;s on the board, follow their view, and watch every change land the
                  moment it&apos;s made.
                </p>
              </div>
            </div>

            <div className="relative col-span-full row-span-2 grid grid-rows-subgrid gap-8 p-8! @4xl:col-span-2">
              <Corner className="bottom-0 -translate-x-[calc(50%+0.5px)] translate-y-[calc(50%+0.5px)]" />
              <div className="mx-auto w-full max-w-84 min-w-0 self-center">
                <AiComposer />
              </div>
              <div className="relative z-10 mx-auto max-w-sm text-center">
                <h3 className="font-semibold text-balance">AI that draws with you</h3>
                <p className="mt-3 text-[15px] text-[#9f9fa9]">
                  Describe a process in plain words and get an editable diagram, then change it with
                  a sentence.
                </p>
              </div>
            </div>

            <SmallFeature icon={MessageSquare} title="Comments" className="space-y-3">
              Pin feedback to any shape and @mention a teammate.
            </SmallFeature>
            <SmallFeature icon={Activity} title="Real-time activity">
              See each edit your team makes, live.
            </SmallFeature>
            <SmallFeature icon={PenTool} title="Pencil ready">
              Write and sketch naturally with Apple Pencil on iPad.
            </SmallFeature>
            <SmallFeature icon={Download} title="Export anywhere">
              PNG, SVG, JSON and Mermaid in a single click.
            </SmallFeature>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A small plus where two rules meet, fading out from its middle. */
function Corner({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute size-3 mask-radial-from-15% before:absolute before:inset-0 before:m-auto before:h-px before:bg-white/25 after:absolute after:inset-0 after:m-auto after:w-px after:bg-white/25 ${className}`}
    />
  );
}

function SmallFeature({
  icon: Icon,
  title,
  className = 'space-y-2',
  children,
}: {
  icon: LucideIcon;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-[#fafafa]" />
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <p className="text-sm text-[#9f9fa9]">{children}</p>
    </div>
  );
}
