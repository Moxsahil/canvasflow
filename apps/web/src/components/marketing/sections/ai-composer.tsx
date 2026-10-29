'use client';

import { useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Database,
  Network,
  Plus,
  Settings2,
  Waypoints,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** The tools, as the AI panel lists them: name, colour, and what one run uses. */
const TOOLS: { icon: LucideIcon; colour: string; name: string; cost?: number }[] = [
  { icon: Network, colour: '#5b7fc7', name: 'Text to diagram', cost: 3 },
  { icon: Waypoints, colour: '#8a74c4', name: 'Mind map', cost: 1 },
  { icon: Workflow, colour: '#4f9a7a', name: 'Flowchart' },
  { icon: Database, colour: '#b08440', name: 'Entity relationship' },
];

/** Height of one row, in px: py-2 around a 24px tile. */
const ROW = 40;
const EASE = 'duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none';

/**
 * The AI panel's prompt box with its Tools list open above it, answering like
 * the real one: one highlight glides to the tool under the pointer and settles
 * back on the picked one when it leaves, a click picks a tool — its tick and
 * the chip in the box below change with it — and, while the list has focus,
 * the keys 1 to 4 pick as the caption says. The chip under the prompt opens
 * and closes the list, picking closes it, and the × takes the tool off. The prompt is a real field: click
 * into it and type, and the words are yours.
 */
export function AiComposer() {
  const [picked, setPicked] = useState<number | null>(0);
  const [open, setOpen] = useState(true);
  const [hovered, setHovered] = useState<number | null>(null);
  const [prompt, setPrompt] = useState('Checkout, cart to payment');
  const field = useRef<HTMLInputElement>(null);
  const lit = hovered ?? picked;
  const tool = picked === null ? null : TOOLS[picked]!;
  const ChipIcon = tool?.icon ?? Settings2;

  /** Picking closes the list, as in the app; picking the picked one takes it off. */
  const pick = (index: number) => {
    setPicked(index === picked ? null : index);
    setHovered(null);
    setOpen(false);
  };

  return (
    <div className="relative text-[#fafafa]">
      <div
        id="ai-composer-tools"
        // Kept in the layout while closed, only hidden, so the card under it
        // never jumps as the list opens and shuts.
        inert={!open}
        className={cn(
          'relative z-10 mx-3 -mb-2 origin-bottom rounded-2xl bg-[#111113] px-2 py-2 shadow-xl ring-1 shadow-black/30 ring-white/10 transition-[opacity,transform,filter]',
          EASE,
          open
            ? 'translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-3 scale-95 opacity-0 blur-[2px]',
        )}
        onKeyDown={(event) => {
          const n = Number(event.key);
          if (n >= 1 && n <= TOOLS.length) pick(n - 1);
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <div className="flex items-center justify-between px-3 pt-1 pb-2 text-xs text-[#9f9fa9]">
          <span>Pick a tool</span>
          <span>Press 1–4</span>
        </div>
        <div className="relative" onMouseLeave={() => setHovered(null)}>
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-x-0 top-0 rounded-lg bg-white/6 transition-transform',
              EASE,
            )}
            style={{
              height: ROW,
              transform: `translateY(${(lit ?? 0) * ROW}px)`,
              opacity: lit === null ? 0 : 1,
            }}
          />
          {TOOLS.map((item, index) => {
            const on = index === picked;
            return (
              <button
                key={item.name}
                type="button"
                aria-pressed={on}
                onMouseEnter={() => setHovered(index)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                onClick={() => pick(index)}
                className="relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none"
                style={{ height: ROW }}
              >
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full transition-transform',
                    EASE,
                    index === lit && 'scale-110',
                  )}
                  style={{ backgroundColor: `${item.colour}26` }}
                >
                  <item.icon className="size-3.5" style={{ color: item.colour }} />
                </span>
                <span className="truncate">{item.name}</span>
                <span
                  className={cn(
                    'ml-auto inline-flex shrink-0 items-center gap-1 text-xs tabular-nums transition-colors',
                    on ? 'font-medium text-[#4d84fd]' : 'text-[#9f9fa9]',
                  )}
                >
                  {item.cost !== undefined && `×${item.cost}`}
                  {on && (
                    <Check className="size-3.5 motion-safe:animate-[tool-tick_250ms_ease-out]" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <style>{`@keyframes tool-tick { from { opacity: 0; transform: scale(0.5) } }`}</style>
      </div>

      <div className="relative">
        <div className="absolute inset-0 blur-lg" aria-hidden="true">
          <div className="absolute inset-x-6 top-8 bottom-0 -translate-y-3 bg-linear-to-r/increasing from-pink-400 to-purple-400" />
        </div>
        <div
          // A click anywhere in the box but its buttons lands in the field, as in the app.
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).closest('button, input')) return;
            event.preventDefault();
            field.current?.focus();
          }}
          className="relative cursor-text rounded-2xl bg-[#111113] px-4 pt-5 pb-3 shadow-md ring-1 shadow-black/5 ring-white/10 transition-shadow focus-within:ring-white/20"
        >
          <form onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="ai-composer-prompt" className="sr-only">
              Describe a diagram
            </label>
            <input
              ref={field}
              id="ai-composer-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe a diagram"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-transparent text-sm caret-[#4d84fd] outline-none placeholder:text-[#71717a]"
            />
            <div className="mt-3 flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full text-[#9f9fa9]"
              >
                <Plus className="size-4" />
              </span>
              <button
                type="button"
                aria-expanded={open}
                aria-controls="ai-composer-tools"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                  'group inline-flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 pr-2 pl-2.5 text-xs font-medium transition-colors hover:bg-white/8',
                  open ? 'bg-white/8' : 'bg-white/5',
                  tool ? 'text-[#4d84fd]' : 'text-[#fafafa]',
                )}
              >
                <span
                  key={tool?.name ?? 'tools'}
                  className="inline-flex min-w-0 items-center gap-1.5 motion-safe:animate-[tool-chip_250ms_ease-out]"
                >
                  <ChipIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{tool?.name ?? 'Tools'}</span>
                </span>
                <ChevronDown
                  className={cn(
                    'size-3 shrink-0 opacity-70 transition-transform',
                    EASE,
                    open && 'rotate-180',
                  )}
                />
              </button>
              {tool && (
                <button
                  type="button"
                  aria-label="Take the tool off"
                  onClick={() => setPicked(null)}
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-[#71717a] transition-colors hover:bg-white/8 hover:text-[#fafafa]"
                >
                  <X className="size-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={!prompt.trim()}
                aria-label="Generate diagram"
                className="ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-[#135dfc] text-white transition-[opacity,transform] active:scale-95 disabled:cursor-default disabled:opacity-40"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
          </form>
        </div>
        <style>{`@keyframes tool-chip { from { opacity: 0; transform: translateY(3px) } }`}</style>
      </div>
    </div>
  );
}
