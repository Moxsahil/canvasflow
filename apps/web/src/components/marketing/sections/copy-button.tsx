'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/** How long the button says it copied before going back. */
const COPIED_FOR = 1600;

/**
 * A Copy button for the landing page's pictures. A click plays what copying
 * looks like in the app — the icon turns to a tick and the label to "Copied",
 * then both turn back — without writing anything to the clipboard: there is
 * nothing real in a picture to copy.
 */
export function CopyButton({ label = 'Copy', className }: { label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FOR);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => setCopied(true)}
      aria-live="polite"
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-[#135dfc] px-2 py-1 text-[11px] font-semibold text-white outline-none transition-transform focus-visible:ring-2 focus-visible:ring-[#4d84fd] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113] active:scale-95',
        className,
      )}
    >
      <span className="relative size-3" aria-hidden="true">
        <Copy
          className={cn(
            'absolute inset-0 size-3 transition-all duration-200 motion-reduce:transition-none',
            copied ? 'scale-50 opacity-0' : 'scale-100 opacity-100',
          )}
        />
        <Check
          strokeWidth={3}
          className={cn(
            'absolute inset-0 size-3 transition-all duration-200 motion-reduce:transition-none',
            copied ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-45 opacity-0',
          )}
        />
      </span>
      {/* Both words always laid out, one over the other, so the button keeps
          its width as the label changes. */}
      <span className="grid">
        <span
          aria-hidden={copied}
          className={cn(
            '[grid-area:1/1] transition-opacity duration-200 motion-reduce:transition-none',
            copied && 'opacity-0',
          )}
        >
          {label}
        </span>
        <span
          aria-hidden={!copied}
          className={cn(
            '[grid-area:1/1] transition-opacity duration-200 motion-reduce:transition-none',
            !copied && 'opacity-0',
          )}
        >
          Copied
        </span>
      </span>
    </button>
  );
}
