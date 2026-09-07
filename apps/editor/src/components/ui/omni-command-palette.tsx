import * as React from 'react';
import { ChevronRight, Search, SearchX, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/** A half-open `[start, end)` slice of the label to emphasise. */
export type OmniHighlight = readonly [number, number];

export interface OmniPaletteItem {
  readonly id: string;
  readonly label: string;
  /** Rendered at 16px in the row's icon column. */
  readonly icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** Second line, for context the label alone doesn't give. */
  readonly subtitle?: string;
  /** Pre-formatted key symbols, one per pill — see help/platform. */
  readonly shortcut?: readonly string[];
  readonly destructive?: boolean;
  readonly ranges?: readonly OmniHighlight[];
}

export interface OmniPaletteSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly OmniPaletteItem[];
}

export interface OmniCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  sections: readonly OmniPaletteSection[];
  /** The row Enter would run, drawn as highlighted. */
  activeId: string | null;
  /** Pointing at a row with the mouse, which must not scroll it. */
  onActiveIdChange: (id: string) => void;
  onSelect: (id: string) => void;
  /** Arrow keys, Enter and Escape — owned by the caller. */
  onKeyDown?: (event: React.KeyboardEvent) => void;
  placeholder?: string;
  /** Key symbols for the pill in the header, e.g. `['⌘', '/']`. */
  hintKeys?: readonly string[];
  emptyMessage?: React.ReactNode;
  /** The editor root. Outside it the theme tokens resolve to nothing. */
  portalContainer?: HTMLElement | null;
  className?: string;
  contentClassName?: string;
}

/**
 * The command palette's surface: a search field over a grouped, single-select
 * list, with the keys that drive it spelled out along the bottom.
 *
 * Presentation only. It is handed its sections already ranked and told which
 * row is live, so the searching, the ordering and the keyboard live together
 * in one hook rather than being split between a hook and a view.
 */
export function OmniCommandPalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
  sections,
  activeId,
  onActiveIdChange,
  onSelect,
  onKeyDown,
  placeholder = 'Search for a command…',
  hintKeys,
  emptyMessage = 'No commands match that.',
  portalContainer,
  className,
  contentClassName,
}: OmniCommandPaletteProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Follow the highlight when the keyboard moves it past the fold. `nearest`
  // rather than `center`, so stepping one row does not scroll the whole list.
  React.useEffect(() => {
    if (!activeId) return;
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-row-id="${CSS.escape(activeId)}"]`,
    );
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const empty = sections.every((section) => section.items.length === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        container={portalContainer}
        showClose={false}
        // Stripped back to a positioned box: the Card inside carries the
        // surface, matching the rename and share dialogs. Sits high rather
        // than centred, so the list grows downwards into open space instead
        // of shifting the field under the cursor as results come and go.
        className={cn(
          'top-[12vh] w-[min(100%-2rem,40rem)] translate-y-0 border-0 bg-transparent p-0 shadow-none',
          contentClassName,
        )}
        onOpenAutoFocus={(event) => {
          // Radix would focus the Card; the field is the only thing here that
          // wants the keyboard.
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>

        <Card className="w-full p-0">
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="cf-command-list"
              aria-activedescendant={activeId ? `cf-command-${activeId}` : undefined}
              aria-label="Search for a command"
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {hintKeys && hintKeys.length > 0 && (
              <span className="hidden items-center gap-1 sm:flex" aria-hidden="true">
                {hintKeys.map((key, index) => (
                  <Kbd key={`${key}-${index}`}>{key}</Kbd>
                ))}
              </span>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="rounded-ele p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div
            id="cf-command-list"
            ref={listRef}
            role="listbox"
            aria-label="Commands"
            className={cn(
              'max-h-[min(24rem,50vh)] overflow-y-auto overscroll-contain p-1.5',
              className,
            )}
          >
            {empty ? (
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                  <SearchX className="size-4 text-muted-foreground" aria-hidden="true" />
                </span>
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.id} className="pb-1 last:pb-0">
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                    {section.label}
                  </div>
                  {section.items.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      active={item.id === activeId}
                      onActivate={onActiveIdChange}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <Hint keys={['↑', '↓']}>to navigate</Hint>
            <Hint keys={['↵']}>to run</Hint>
            <Hint keys={['esc']}>to close</Hint>
          </div>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

interface RowProps {
  item: OmniPaletteItem;
  active: boolean;
  onActivate: (id: string) => void;
  onSelect: (id: string) => void;
}

function Row({ item, active, onActivate, onSelect }: RowProps) {
  const Icon = item.icon;

  return (
    // A div rather than a button: in a combobox the field keeps the keyboard
    // and `aria-activedescendant` says which row is live, so a focusable row
    // here would take the caret out of the field the user is still typing in.
    <div
      id={`cf-command-${item.id}`}
      data-row-id={item.id}
      role="option"
      aria-selected={active}
      onMouseMove={() => onActivate(item.id)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(item.id)}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-ele px-2.5 py-2 text-sm',
        active ? 'bg-accent text-accent-foreground' : 'text-foreground',
        item.destructive && 'text-destructive',
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            'size-4 shrink-0',
            item.destructive ? 'text-destructive' : 'text-muted-foreground',
            active && !item.destructive && 'text-accent-foreground',
          )}
          aria-hidden="true"
        />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate">
          <Highlighted label={item.label} ranges={item.ranges} />
        </span>
        {item.subtitle && (
          <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
        )}
      </span>

      {item.shortcut && item.shortcut.length > 0 && (
        <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
          {item.shortcut.map((key, index) => (
            <Kbd key={`${key}-${index}`}>{key}</Kbd>
          ))}
        </span>
      )}

      <ChevronRight
        className={cn(
          'size-3.5 shrink-0 text-muted-foreground transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden="true"
      />
    </div>
  );
}

/** Emphasises the slices of the label the query actually matched. */
function Highlighted({ label, ranges }: { label: string; ranges?: readonly OmniHighlight[] }) {
  if (!ranges || ranges.length === 0) return <>{label}</>;

  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(label.slice(at, start));
    parts.push(
      <mark key={start} className="bg-transparent font-semibold text-inherit underline-offset-2">
        {label.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < label.length) parts.push(label.slice(at));

  return <>{parts}</>;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-sm bg-muted px-1.5 py-0.5 font-sans text-[10px] leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}

function Hint({ keys, children }: { keys: readonly string[]; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex items-center gap-1" aria-hidden="true">
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </span>
      {children}
    </span>
  );
}
