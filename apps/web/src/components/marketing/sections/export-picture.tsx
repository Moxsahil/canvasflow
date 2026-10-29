'use client';

import { useState, type KeyboardEvent } from 'react';
import { Download } from 'lucide-react';
import { CopyButton } from './copy-button';

/**
 * What each format gives you, as the export step shows it: the file it makes,
 * a word on what kind of file that is, and how you take it — the three that
 * write a file download it, Mermaid is copied as text, as in the app.
 */
const FORMATS = [
  { id: 'png', label: 'PNG', file: 'checkout.png', note: '2×', action: 'Export' },
  { id: 'svg', label: 'SVG', file: 'checkout.svg', note: 'Vector', action: 'Export' },
  { id: 'json', label: 'JSON', file: 'checkout.json', note: 'Shapes', action: 'Export' },
  {
    id: 'mermaid',
    label: 'Mermaid',
    file: 'checkout.mmd',
    note: 'Flowchart',
    action: 'Copy',
  },
] as const;

type FormatId = (typeof FORMATS)[number]['id'];

/**
 * The export step's picture, live: the four formats switch like the real
 * picker, the highlight sliding across, and the preview and file below change
 * with the pick. The previews cross-fade, all four always laid out, so the
 * card never changes size as you switch.
 */
export function ExportPicture() {
  const [picked, setPicked] = useState<FormatId>('png');
  const index = FORMATS.findIndex((format) => format.id === picked);
  const format = FORMATS[index]!;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = FORMATS[(index + step + FORMATS.length) % FORMATS.length]!;
    setPicked(next.id);
    document.getElementById(`export-format-${next.id}`)?.focus();
  };

  return (
    <div className="flex size-full flex-col rounded-2xl bg-[#111113] p-3 ring-1 ring-white/10">
      <div
        role="tablist"
        aria-label="Export format"
        className="relative grid grid-cols-4 rounded-lg bg-white/5 p-1 text-center text-[11px] font-medium"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/4)] rounded-md bg-[#27272a] shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {FORMATS.map((item) => (
          <button
            key={item.id}
            id={`export-format-${item.id}`}
            type="button"
            role="tab"
            aria-selected={item.id === picked}
            tabIndex={item.id === picked ? 0 : -1}
            onClick={() => setPicked(item.id)}
            onKeyDown={onKeyDown}
            className={`relative cursor-pointer rounded-md py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#4d84fd] ${item.id === picked ? 'text-[#fafafa]' : 'text-[#9f9fa9] hover:text-[#fafafa]'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-label={`${format.label} preview`}
        className="relative mt-3 flex-1 overflow-hidden rounded-lg bg-[radial-gradient(circle,rgb(255_255_255/0.08)_1px,transparent_1px)] bg-size-[10px_10px] ring-1 ring-white/7"
      >
        <Preview shown={picked === 'png'}>
          <span className="h-5 w-9 rounded-[3px] bg-[#fde68a]/80" />
          <span className="h-px w-4 bg-[#9f9fa9]" />
          <span className="h-5 w-9 rounded-[3px] ring-1 ring-[#4d84fd]" />
          <span className="h-px w-4 bg-[#9f9fa9]" />
          <span className="size-4 rotate-45 rounded-[2px] ring-1 ring-[#a855f7]" />
        </Preview>
        <Preview shown={picked === 'svg'}>
          <Handles className="h-5 w-9 ring-[#fde68a]" />
          <span className="h-px w-4 bg-[#9f9fa9]" />
          <Handles className="h-5 w-9 ring-[#4d84fd]" />
          <span className="h-px w-4 bg-[#9f9fa9]" />
          <Handles className="size-4 rotate-45 ring-[#a855f7]" />
        </Preview>
        <Code shown={picked === 'json'}>
          <span className="text-[#9f9fa9]">{'{ '}</span>
          <span className="text-[#4d84fd]">&quot;type&quot;</span>: <Str>&quot;note&quot;</Str>,{' '}
          <span className="text-[#4d84fd]">&quot;text&quot;</span>:{' '}
          <Str>&quot;Guest checkout?&quot;</Str>
          <span className="text-[#9f9fa9]">{' },'}</span>
          {'\n'}
          <span className="text-[#9f9fa9]">{'{ '}</span>
          <span className="text-[#4d84fd]">&quot;type&quot;</span>: <Str>&quot;rectangle&quot;</Str>
          , <span className="text-[#4d84fd]">&quot;text&quot;</span>: <Str>&quot;Cart&quot;</Str>
          <span className="text-[#9f9fa9]">{' }'}</span>
        </Code>
        <Code shown={picked === 'mermaid'}>
          <span className="text-[#a855f7]">flowchart</span> LR{'\n'}
          {'  '}A[Guest checkout?] <span className="text-[#9f9fa9]">--&gt;</span> B[Cart]{'\n'}
          {'  '}B <span className="text-[#9f9fa9]">--&gt;</span> C{'{'}Pay{'}'}
        </Code>
      </div>

      <div className="mt-3 flex items-center gap-2 px-1">
        <span className="min-w-0 flex-1 truncate text-xs">
          {format.file}
          <span className="ml-1.5 text-[#9f9fa9]">{format.note}</span>
        </span>
        {format.action === 'Copy' ? (
          <CopyButton key={format.id} />
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#135dfc] px-2 py-1 text-[11px] font-semibold text-white">
            <Download className="size-3" />
            {format.action}
          </span>
        )}
      </div>
    </div>
  );
}

/** One format's preview, faded in over the others when it's the pick. */
function Preview({ shown, children }: { shown: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!shown}
      className={`absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-300 motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0'}`}
    >
      {children}
    </div>
  );
}

/** A preview of text the format writes, set as code on the dots. */
function Code({ shown, children }: { shown: boolean; children: React.ReactNode }) {
  return (
    <pre
      aria-hidden={!shown}
      className={`absolute inset-0 overflow-hidden bg-[#111113]/85 px-2.5 py-2 font-[family-name:var(--font-geist-mono)] text-[9.5px] leading-[1.6] whitespace-pre-wrap text-[#fafafa] transition-opacity duration-300 motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0'}`}
    >
      {children}
    </pre>
  );
}

function Str({ children }: { children: React.ReactNode }) {
  return <span className="text-[#22c55e]">{children}</span>;
}

/** An outlined shape with a handle at each corner, as a vector reads. */
function Handles({ className }: { className: string }) {
  return (
    <span className={`relative rounded-[2px] ring-1 ${className}`}>
      {['-top-1 -left-1', '-top-1 -right-1', '-bottom-1 -left-1', '-right-1 -bottom-1'].map(
        (corner) => (
          <span
            key={corner}
            className={`absolute size-1.5 rounded-[1px] bg-[#fafafa] ring-1 ring-[#111113] ${corner}`}
          />
        ),
      )}
    </span>
  );
}
