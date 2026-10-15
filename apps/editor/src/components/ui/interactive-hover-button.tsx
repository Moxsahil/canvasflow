import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InteractiveHoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
  /** What the sweep reveals. The resting text again when unset. */
  hoverText?: string;
  /** Sits before the resting text, and leaves with it as the sweep comes in. */
  icon?: React.ReactNode;
  /**
   * Whether the mark the sweep grows out of shows while the button rests.
   *
   * On by default, because on the share button that mark is doing a job — it
   * carries the live colour. Turn it off where the button has no such state
   * to report and the dot would just be an unexplained speck; the sweep still
   * grows from the same corner, fading in as it comes.
   */
  showDot?: boolean;
}

const InteractiveHoverButton = React.forwardRef<HTMLButtonElement, InteractiveHoverButtonProps>(
  ({ text = 'Button', hoverText, icon, showDot = true, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // `text-foreground` is not in the upstream snippet, but without it
          // the resting label inherits the page foreground, which does not
          // follow the theme — leaving black text on the dark pill.
          // A grid of one cell, so a caller that sets `w-auto` gets a button as
          // wide as the longer of its two labels — translations run longer.
          'group relative inline-grid w-32 cursor-pointer overflow-hidden rounded-full border bg-background p-2 text-center font-semibold text-foreground',
          className,
        )}
        {...props}
      >
        {/* Laid out as flex only when there is an icon to sit beside the
            label, so a caller that passes none renders exactly as before. */}
        <span
          className={cn(
            'col-start-1 row-start-1 translate-x-1 justify-self-center transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0',
            icon ? 'inline-flex items-center gap-2' : 'inline-block',
          )}
        >
          {icon}
          {text}
        </span>
        {/* Never seen: holds the cell open to the width the sweep's label
            and arrow need. */}
        <span
          aria-hidden="true"
          className="invisible col-start-1 row-start-1 inline-flex items-center justify-center gap-2"
        >
          <span>{hoverText ?? text}</span>
          <ArrowRight />
        </span>
        <div className="absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 text-primary-foreground opacity-0 transition-all duration-300 group-hover:-translate-x-1 group-hover:opacity-100">
          <span>{hoverText ?? text}</span>
          <ArrowRight />
        </div>
        <div
          className={cn(
            // A fixed distance from the edge, not a share of the width: on a
            // button widened for a longer word, 20% lands on the first letter.
            'absolute left-[1.2rem] top-[40%] h-2 w-2 scale-[1] rounded-lg bg-primary transition-all duration-300 group-hover:left-[0%] group-hover:top-[0%] group-hover:h-full group-hover:w-full group-hover:scale-[1.8] group-hover:bg-primary',
            !showDot && 'opacity-0 group-hover:opacity-100',
          )}
        ></div>
      </button>
    );
  },
);

InteractiveHoverButton.displayName = 'InteractiveHoverButton';

export { InteractiveHoverButton };
