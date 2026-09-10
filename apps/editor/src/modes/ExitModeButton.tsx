import { Eye, Maximize } from 'lucide-react';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { cn } from '@/lib/utils';
import { formatShortcut } from '../help/platform';

/** The two preferences that put the chrome away; see preferences.ts. */
export type ChromeHiddenMode = 'focus' | 'view';

/**
 * The colour each mode's sweep comes in on.
 *
 * Neither is free to be blue: that is the share button sitting in this exact
 * spot the rest of the time, and a second pill arriving in the same colour
 * would read as the same control. Green is spoken for too — the share button
 * turns green when the board is live. So the modes take a colour each: violet
 * for focus, amber for view, which is also the one that says "you cannot
 * change anything" without spending a word on it.
 *
 * Written out in full rather than composed, because the class scanner reads
 * this file as text and never sees a value that was pasted together.
 */
const SWEEP_COLOUR: Record<ChromeHiddenMode, string> = {
  focus: '[--color-primary:#7c3aed] [--color-primary-foreground:#ffffff]',
  view: '[--color-primary:#c2410c] [--color-primary-foreground:#ffffff]',
};

interface ExitModeButtonProps {
  mode: ChromeHiddenMode;
  onExit: () => void;
}

/**
 * The one control left when the chrome is put away, standing in the top-right
 * dock where the share button stands the rest of the time.
 *
 * At rest it names the mode, because with everything else gone it is the only
 * thing on screen that can. Hovered, the sweep comes across and the label
 * turns into the way out. The share button's own pill on purpose: these two
 * are never on screen together, so a single shape in that corner reads as one
 * control that changes its mind rather than as two conventions.
 *
 * Each mode carries the icon the command palette lists it under, so the row
 * and the button are recognisably the same thing.
 */
export function ExitModeButton({ mode, onExit }: ExitModeButtonProps) {
  const name = mode === 'view' ? 'View mode' : 'Focus mode';
  const exit = mode === 'view' ? 'Exit view mode' : 'Exit focus mode';
  const shortcut = formatShortcut(mode === 'view' ? 'alt+r' : 'alt+z');

  return (
    <InteractiveHoverButton
      type="button"
      text={name}
      hoverText={exit}
      icon={mode === 'view' ? <Eye /> : <Maximize />}
      // Nothing here has a state to report the way the share button's live
      // count does, so the resting mark would only read as an unexplained
      // speck beside the icon.
      showDot={false}
      onClick={onExit}
      title={`${exit} · ${shortcut}`}
      aria-label={`${exit} · ${shortcut}`}
      data-testid="exit-mode"
      className={cn(
        // The share button's build, class for class, bar the width: "Exit
        // focus mode" and its arrow need room "Share" does not.
        'h-10 w-36 text-[13px] [&_svg]:size-4',
        'border-(--default-border-color) bg-(--island-bg-color) text-(--text-primary-color)',
        // Recolouring the token rather than the utilities keeps the sweep and
        // the text it reveals in step, exactly as the live share button does.
        SWEEP_COLOUR[mode],
      )}
    />
  );
}
