import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  MenuGlide,
  menuLabelClasses,
  menuRowClasses,
  menuSurfaceClasses,
} from '@/components/ui/menu-look';
import { ScrollThumb } from '@/components/ui/scroll-thumb';
import { useT } from '../i18n';
import {
  FONT_CATALOG,
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS,
  findFont,
  firstFontName,
  type FontChoice,
} from '../fonts/font-catalog';
import { chipClasses, mutedText, wellOpenClasses } from './inspector';

/**
 * The Font row's control: the font in effect, set in itself, opening a list
 * of every font the editor serves — each name shown in its own letters,
 * grouped by kind, with a search box at the top.
 *
 * The list is portalled to the editor root, so it is never clipped by the
 * panel it opens from, and still wears the editor's theme.
 */
export function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  /** The stack in effect; empty when the selection mixes fonts. */
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const nameOf = (font: FontChoice) => (font.labelKey ? t(font.labelKey) : (font.name ?? ''));
  const current = findFont(value);
  const shownName = current ? nameOf(current) : value ? firstFontName(value) : t('style.font');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const named = FONT_CATALOG.map((font) => ({
      font,
      name: font.labelKey ? t(font.labelKey) : (font.name ?? ''),
    }));
    return needle
      ? named.filter(
          ({ font, name }) =>
            name.toLowerCase().includes(needle) ||
            // A group is found by how its name starts — "mono", "serif" —
            // so a few letters of a font's name don't bring in a whole group.
            t(FONT_CATEGORY_LABELS[font.category])
              .toLowerCase()
              .split(' ')
              .some((word) => word.startsWith(needle)),
        )
      : named;
  }, [query, t]);

  const pick = (font: FontChoice) => {
    onChange(font.value);
    setOpen(false);
  };

  const moveTo = (index: number) => {
    const next = Math.max(0, Math.min(matches.length - 1, index));
    setActive(next);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-font-index="${next}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveTo(active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = matches[active];
      if (chosen) pick(chosen.font);
    }
  };

  // Rows in list order, numbered across the groups so the keys walk them all.
  let index = 0;
  const groups = FONT_CATEGORIES.map((category) => ({
    category,
    rows: matches
      .filter(({ font }) => font.category === category)
      .map((match) => ({ ...match, index: index++ })),
  })).filter((group) => group.rows.length > 0);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          const at = FONT_CATALOG.findIndex((font) => font.value === value);
          setActive(Math.max(0, at));
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${label}: ${shownName}`}
          className={cn(chipClasses, open && wellOpenClasses)}
          data-font-picker=""
        >
          <span
            className="min-w-0 flex-1 truncate"
            style={value ? { fontFamily: value } : undefined}
          >
            {shownName}
          </span>
          <ChevronDown aria-hidden="true" className={cn('size-3 shrink-0', mutedText)} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        container={triggerRef.current?.closest<HTMLElement>('.cf-editor')}
        // Straight down from the chip, its right edge on the chip's, as a
        // select's list drops from its field — so it opens in the panel's own
        // column instead of out over the board. Up, if there is no room below.
        side="bottom"
        align="end"
        sideOffset={4}
        collisionPadding={8}
        aria-label={label}
        className={cn(
          menuSurfaceClasses,
          'flex w-44 flex-col p-0 text-xs shadow-none data-[state=open]:animate-none',
        )}
        // Opened from inside a style popover, and part of it: a press in here
        // must not read as a press away from that one.
        data-inspector-nested=""
        // Letters typed into the search are the search's, not the board's
        // tool shortcuts.
        onKeyDown={(event) => {
          if (event.key !== 'Escape') event.stopPropagation();
        }}
        onOpenAutoFocus={(event) => {
          // Into the search box, ready to type.
          event.preventDefault();
          (event.currentTarget as HTMLElement).querySelector('input')?.focus();
        }}
      >
        <label className="flex items-center gap-2 border-b border-neutral-300 px-2.5 py-1.5 dark:border-neutral-700">
          <Search aria-hidden="true" className={cn('size-3.5 shrink-0', mutedText)} />
          <input
            type="search"
            value={query}
            placeholder={t('style.font.search')}
            aria-label={t('style.font.search')}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onSearchKeyDown}
          />
        </label>
        <div className="relative">
          <div
            ref={listRef}
            role="listbox"
            aria-label={label}
            className="relative max-h-56 overflow-y-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <MenuGlide />
            {groups.length === 0 ? (
              <p className={cn('m-0 px-2 py-3 text-center', mutedText)}>
                {t('style.font.noMatch')}
              </p>
            ) : (
              groups.map(({ category, rows }) => (
                <div key={category} role="group" aria-label={t(FONT_CATEGORY_LABELS[category])}>
                  <p className={cn(menuLabelClasses, 'm-0')}>{t(FONT_CATEGORY_LABELS[category])}</p>
                  {rows.map(({ font, name, index: rowIndex }) => {
                    const selected = font.value === value;
                    return (
                      <button
                        key={font.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        data-font-index={rowIndex}
                        // Lit by the gliding highlight, which follows this mark
                        // from row to row — by pointer or by the arrow keys.
                        data-highlighted={rowIndex === active ? '' : undefined}
                        className={cn(menuRowClasses, 'min-h-[26px] py-1 text-left text-[12px]')}
                        onPointerMove={() => setActive(rowIndex)}
                        onClick={() => pick(font)}
                      >
                        <span className="truncate" style={{ fontFamily: font.value }}>
                          {name}
                        </span>
                        {selected && <Check aria-hidden="true" className="size-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <ScrollThumb target={listRef} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
