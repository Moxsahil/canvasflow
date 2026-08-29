import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronUpIcon } from '../assets/icons';
import type { Tool, ToolMeta } from '../tools/tool';
import './ToolOverflow.css';

interface ToolOverflowProps {
  tools: readonly ToolMeta[];
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where to portal the list. Outside `.cf-editor` the theme tokens are empty. */
  container: HTMLElement | null;
}

/**
 * The toolbar's overflow: a chevron at the end of the row that opens the tools
 * not worth a permanent slot.
 *
 * A list rather than more icons in a tray. The tools in here are the ones you
 * reach for rarely, which is exactly when an icon alone is not enough to go
 * on — so each row spells out its name and the key that gets you there without
 * opening this at all.
 *
 * Built on the popover primitive for what surrounds it rather than what it
 * draws: dismissing on a click anywhere else, on Escape, and returning focus
 * to the chevron afterwards are all behaviours worth not writing twice.
 */
export function ToolOverflow({
  tools,
  activeTool,
  onToolChange,
  open,
  onOpenChange,
  container,
}: ToolOverflowProps) {
  // The chevron stands in for whichever of these is in use, so it has to carry
  // the selected look — otherwise picking the laser leaves the row showing
  // nothing selected at all.
  const holdsActiveTool = tools.some((meta) => meta.id === activeTool);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className="cf-tool-overflow__trigger"
        data-active={holdsActiveTool || undefined}
        data-open={open || undefined}
        aria-label="More tools"
        data-testid="toolbar-overflow"
      >
        <span className="cf-tool-overflow__chevron" aria-hidden="true">
          <ChevronUpIcon />
        </span>
      </PopoverTrigger>

      <PopoverContent
        container={container}
        side="top"
        align="end"
        sideOffset={10}
        // Tailwind utilities rather than a class in the stylesheet beside
        // this file: the primitive's own defaults (w-72, p-4, bg-sidebar) are
        // single-class selectors, so a plain rule of equal specificity would
        // win or lose on stylesheet order. Passed this way tailwind-merge
        // drops the defaults outright.
        className="flex w-auto min-w-52 flex-col gap-0.5 rounded-2xl border-(--dock-border-color) bg-(--dock-bg-color) p-1 text-(--text-primary-color) shadow-(--dock-shadow) backdrop-blur-xl backdrop-saturate-150"
        // Focus stays on the board. Moving it into the list would mean the
        // next keystroke went to a menu item rather than to the canvas, and
        // these rows exist to be clicked, not tabbed through.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {tools.map((meta) => {
          const Icon = meta.icon;
          return (
            <button
              key={meta.id}
              type="button"
              className="cf-tool-overflow__item"
              data-active={activeTool === meta.id || undefined}
              onClick={() => {
                onToolChange(meta.id);
                // Picking a tool is the whole errand; leaving the list open
                // would cover the board you just chose a tool to draw on.
                onOpenChange(false);
              }}
            >
              <span className="cf-tool-overflow__icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="cf-tool-overflow__label">{meta.label}</span>
              <kbd className="cf-tool-overflow__shortcut">{meta.shortcut}</kbd>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
