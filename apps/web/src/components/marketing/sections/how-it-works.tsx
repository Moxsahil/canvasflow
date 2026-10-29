import { ArrowRight, ChevronDown, Link2, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTION_TYPE } from './section-type';
import { CopyButton } from './copy-button';
import { ExportPicture } from './export-picture';

/**
 * How CanvasFlow is used, in three steps across a ruled grid: draw on a board,
 * bring the team in, take the result out. Each step shows the part of the app
 * it happens in, and a rail of numbers along the top ties the three together.
 * Painted for the dark page, in the feature grid's colours, so the two read as
 * one family.
 *
 * On the landing page under the feature grid.
 */
export function HowItWorks({ id, className }: { id?: string; className?: string }) {
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
        <div className="max-w-xl">
          <p className="text-sm font-medium text-[#4d84fd]">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance @4xl:text-4xl">
            From a blank canvas to a plan everyone agrees on
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#9f9fa9]">
            Three steps on one board, with nothing to install and no files to send round.
          </p>
        </div>

        <div className="relative mt-14">
          <Corner className="-translate-[calc(50%-0.5px)]" />
          <Corner className="right-0 translate-x-[calc(50%-0.5px)] -translate-y-[calc(50%-0.5px)]" />
          <Corner className="right-0 bottom-0 translate-x-[calc(50%-0.5px)] translate-y-[calc(50%-0.5px)]" />
          <Corner className="bottom-0 -translate-x-[calc(50%-0.5px)] translate-y-[calc(50%-0.5px)]" />
          <ol className="grid grid-cols-[minmax(0,1fr)] divide-y divide-white/10 border border-white/10 @4xl:grid-cols-3 @4xl:divide-x @4xl:divide-y-0">
            <Step
              number="01"
              title="Sketch it out"
              description="Open a board and draw: shapes, sticky notes and arrows that snap where they should."
            >
              <CanvasPicture />
            </Step>
            <Step
              number="02"
              title="Bring your team in"
              description="Send one link. Teammates join the same board, edit with you live, or just watch."
              interactive
            >
              <SharePicture />
            </Step>
            <Step
              number="03"
              title="Take it anywhere"
              description="Export a crisp image, the raw shapes or Mermaid, ready for docs, decks and tickets."
              last
              interactive
            >
              <ExportPicture />
            </Step>
          </ol>
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

/**
 * One step: its number on the rail, the picture, then its words. The rail
 * runs on into the next step, ending in an arrow, except after the last.
 */
function Step({
  number,
  title,
  description,
  last = false,
  interactive = false,
  children,
}: {
  number: string;
  title: string;
  description: string;
  last?: boolean;
  /** The picture can be used, so screen readers are let into it. */
  interactive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-8 p-8">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="rounded-full bg-white/5 px-2.5 py-1 font-[family-name:var(--font-geist-mono)] text-xs text-[#fafafa] ring-1 ring-white/10">
          {number}
        </span>
        {!last && (
          <span className="hidden flex-1 items-center gap-1 text-white/20 @4xl:flex">
            <span className="h-px flex-1 bg-[linear-gradient(90deg,currentColor_4px,transparent_4px)] bg-size-[8px_1px]" />
            <ArrowRight className="size-3.5" />
          </span>
        )}
      </div>
      <div className="flex h-44 min-w-0 items-center" aria-hidden={!interactive}>
        {children}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-[#9f9fa9]">{description}</p>
      </div>
    </li>
  );
}

/** A corner of a board: a sticky note and two shapes joined by arrows, with your cursor. */
function CanvasPicture() {
  return (
    <div className="relative size-full overflow-hidden rounded-2xl bg-[#111113] bg-[radial-gradient(circle,rgb(255_255_255/0.09)_1px,transparent_1px)] bg-size-[14px_14px] ring-1 ring-white/10">
      <div className="absolute top-5 left-5 flex h-16 w-20 rotate-[-3deg] items-center justify-center rounded-md bg-[#fde68a] p-2 text-center text-[11px] leading-tight font-medium text-[#3f3f46] shadow-lg shadow-black/30">
        Guest checkout?
      </div>
      <svg
        className="absolute inset-0 size-full text-[#9f9fa9]"
        viewBox="0 0 280 176"
        preserveAspectRatio="none"
        fill="none"
      >
        <path d="M104 52 C 130 52, 132 46, 150 46" stroke="currentColor" strokeWidth="1.5" />
        <path d="M146 42 l5 4 -5 4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M205 66 V 104" stroke="currentColor" strokeWidth="1.5" />
        <path d="M201 100 l4 5 4 -5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div className="absolute top-8 right-8 flex h-9 w-26 items-center justify-center rounded-lg text-[11px] font-medium ring-[1.5px] ring-[#4d84fd]">
        Cart
      </div>
      <div className="absolute right-8 bottom-6 flex h-12 w-26 items-center justify-center">
        <div className="absolute size-10 rotate-45 rounded-[4px] ring-[1.5px] ring-[#a855f7]" />
        <span className="relative text-[11px] font-medium">Pay</span>
      </div>
      <div className="absolute bottom-7 left-24 flex items-start">
        <MousePointer2 className="size-4 fill-[#135dfc] text-[#135dfc]" />
        <span className="mt-3 -ml-0.5 rounded-md bg-[#135dfc] px-1.5 py-0.5 text-[10px] font-semibold text-white">
          You
        </span>
      </div>
    </div>
  );
}

/**
 * The share window: the board's link to copy, and who has it with what access.
 * It fills the same box as the other two pictures, so the three line up.
 */
function SharePicture() {
  return (
    <div className="flex size-full flex-col justify-between rounded-2xl bg-[#111113] p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-2 rounded-lg bg-white/5 py-1.5 pr-1.5 pl-2.5 ring-1 ring-white/7">
        <Link2 className="size-3.5 shrink-0 text-[#9f9fa9]" />
        <span className="min-w-0 flex-1 truncate text-xs text-[#9f9fa9]">
          canvasflowapp.com/b/payment-sprint
        </span>
        <CopyButton />
      </div>
      <div className="space-y-0.5">
        <Person photo="priya" colour="#22c55e" name="Priya Shah" access="Can edit" />
        <Person photo="alex" colour="#f97316" name="Alex Morgan" access="Can edit" />
        <Person photo="sam" colour="#a855f7" name="Sam Lee" access="Can view" />
      </div>
    </div>
  );
}

function Person({
  photo,
  colour,
  name,
  access,
}: {
  photo: string;
  colour: string;
  name: string;
  access: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px]">
      <span
        className="block size-6 shrink-0 overflow-hidden rounded-full"
        style={{ backgroundColor: colour }}
      >
        <img src={`/assets/features/avatars/${photo}.svg`} alt="" className="size-full scale-110" />
      </span>
      <span className="truncate">{name}</span>
      <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-[#9f9fa9]">
        {access}
        <ChevronDown className="size-3" />
      </span>
    </div>
  );
}
