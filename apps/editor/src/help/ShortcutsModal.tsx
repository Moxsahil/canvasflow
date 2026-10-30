import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Keyboard, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rich, useT, type I18n } from '../i18n';
import { CloseButton, SCROLLBAR } from '../settings/settings-ui';
import { SurfaceWindow, WindowButton } from '../ui/SurfaceWindow';
import type { SurfaceTheme } from '../ui/surface-palette';
import { balanceColumns } from './columns';
import { KeyCaps } from './KeyCaps';
import { formatShortcutKeys, isMac } from './platform';
import { SHORTCUTS, type ShortcutEntry } from './shortcuts-registry';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
  /** The theme on screen — the dialog surface carries its own palette for each. */
  theme: SurfaceTheme;
}

const TOTAL_SHORTCUTS = SHORTCUTS.reduce((count, category) => count + category.entries.length, 0);

/** Evened out rather than one per category, so no one group sets the height. */
const COLUMNS_NARROW = balanceColumns(SHORTCUTS, 3);
const COLUMNS_WIDE = balanceColumns(SHORTCUTS, 4);

/** From this window width there is room for four columns, and nothing has to scroll. */
const WIDE_FROM = 1400;

function useWideWindow(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= WIDE_FROM,
  );
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= WIDE_FROM);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return wide;
}

const ALL_ENTRIES = SHORTCUTS.flatMap((category) => category.entries);

/**
 * What a search looks through for one shortcut: what it does, and its keys by
 * every name someone might type for them.
 */
function searchTextOf(entry: ShortcutEntry, mac: boolean, t: I18n['t']): string {
  const synonyms: Record<string, string> = {
    mod: mac ? 'cmd command' : 'ctrl control',
    alt: mac ? 'option opt alt' : 'alt',
    shift: 'shift',
  };
  const parts = [entry.keys, entry.altKeys]
    .filter((keys): keys is string => Boolean(keys))
    .flatMap((keys) => {
      const names = formatShortcutKeys(keys);
      return keys.split('+').map((part, index) => `${names[index]} ${synonyms[part] ?? ''}`);
    });
  return [t(entry.descriptionKey), ...parts].join(' ').toLowerCase();
}

/**
 * The shortcut a key press means, in the registry's `mod+shift+z` notation.
 * Null for a modifier pressed on its own.
 */
function comboOf(event: ReactKeyboardEvent): string | null {
  const named: Record<string, string> = {
    Escape: 'escape',
    Delete: 'delete',
    Backspace: 'backspace',
    Enter: 'enter',
    ArrowLeft: 'arrow-left',
    ArrowRight: 'arrow-right',
    ArrowUp: 'arrow-up',
    ArrowDown: 'arrow-down',
    ' ': 'space',
  };
  const key =
    named[event.key] ??
    (event.code.startsWith('Key') ? event.code.slice(3).toLowerCase() : event.key.toLowerCase());
  if (['control', 'meta', 'alt', 'shift', 'altgraph'].includes(key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  // Shift is part of the name only where it changes nothing else: `?` is
  // already the shifted key, but a letter or a named key is not.
  if (event.shiftKey && (event.key in named || /^[a-z]$/.test(key) || key === '?')) {
    parts.push('shift');
  }
  return [...parts, key].join('+');
}

function entryFor(combo: string): ShortcutEntry | undefined {
  // Ctrl+Y is written `ctrl+y` in the registry, not `mod+y`.
  const tries = [combo, combo.replace(/^mod\+/, 'ctrl+')];
  return ALL_ENTRIES.find(
    (entry) =>
      tries.includes(entry.keys) ||
      (entry.altKeys !== undefined && tries.includes(entry.altKeys)) ||
      (combo === 'space' && entry.keys.startsWith('space+')),
  );
}

/** The description with what the search matched picked out. */
function highlight(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;
  const lower = text.toLowerCase();
  const hits: [number, number][] = [];
  for (const term of terms) {
    let at = lower.indexOf(term);
    while (at !== -1) {
      hits.push([at, at + term.length]);
      at = lower.indexOf(term, at + term.length);
    }
  }
  if (hits.length === 0) return text;
  hits.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of hits) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const out: ReactNode[] = [];
  let at = 0;
  merged.forEach(([start, end], index) => {
    out.push(text.slice(at, start));
    out.push(
      <mark
        key={index}
        className="rounded-[3px] bg-[var(--surface-accent-wash)] text-[var(--surface-fg)] shadow-[0_0_0_1px_var(--surface-accent-wash)]"
      >
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  out.push(text.slice(at));
  return out;
}

type Said = { kind: 'found'; entry: ShortcutEntry } | { kind: 'missed'; combo: string };

/**
 * Everything the keyboard can do, on one page.
 *
 * Four columns on a wide window and three on a narrower one, so all of them are
 * in view at once and read as a reference rather than a list to scroll. The search filters in place: a category with nothing
 * left folds away and the rest close up from the left. Pressing a shortcut
 * while the window is open lights up its row, and the foot says what it does.
 */
export function ShortcutsModal({ open, onClose, theme }: ShortcutsModalProps) {
  const t = useT();
  const titleId = useId();
  const wide = useWideWindow();
  const mac = useMemo(() => isMac(), []);
  const [query, setQuery] = useState('');
  const [said, setSaid] = useState<Said | null>(null);
  const [flashing, setFlashing] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  // Held at its full height once a search starts, so the window doesn't jump
  // as rows fold away.
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) return;
    setQuery('');
    setSaid(null);
    setFlashing(null);
    setStuck(false);
    setBodyHeight(null);
  }, [open]);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const searchTexts = useMemo(
    () => new Map(ALL_ENTRIES.map((entry) => [entry, searchTextOf(entry, mac, t)])),
    [mac, t],
  );
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const matches = (entry: ShortcutEntry) =>
    terms.every((term) => searchTexts.get(entry)?.includes(term));
  const shown = searching ? ALL_ENTRIES.filter(matches).length : TOTAL_SHORTCUTS;

  const search = (next: string) => {
    if (next && bodyHeight === null && bodyRef.current) {
      setBodyHeight(bodyRef.current.offsetHeight);
    }
    setQuery(next);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };

  // A found row scrolls into view, up and down only, when it is out of sight.
  useEffect(() => {
    const body = bodyRef.current;
    if (!flashing || !body) return;
    const row = body.querySelector<HTMLElement>(`[data-shortcut="${CSS.escape(flashing)}"]`);
    if (!row) return;
    const rowBox = row.getBoundingClientRect();
    const bodyBox = body.getBoundingClientRect();
    if (rowBox.top < bodyBox.top + 8 || rowBox.bottom > bodyBox.bottom - 8) {
      body.scrollTo({
        top: body.scrollTop + rowBox.top - bodyBox.top - bodyBox.height / 2 + rowBox.height / 2,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }
  }, [flashing]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT') return;
    if (target.tagName === 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) return;
    if (event.key === 'Tab' || event.key === 'Escape') return;
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }

    const combo = comboOf(event);
    if (!combo) return;
    const entry = entryFor(combo);
    if (!entry) {
      if (combo.includes('+') || combo.length === 1) setSaid({ kind: 'missed', combo });
      return;
    }
    event.preventDefault();
    if (query) setQuery('');
    setSaid({ kind: 'found', entry });
    setFlashing(entry.keys);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashing(null), 900);
  };

  return (
    <SurfaceWindow
      open={open}
      theme={theme}
      onClose={onClose}
      width={wide ? 1500 : 980}
      labelledBy={titleId}
      onEscape={() => {
        if (!query) return false;
        setQuery('');
        return true;
      }}
      onKeyDown={handleKeyDown}
      data-testid="shortcuts-dialog"
    >
      <div
        className={cn(
          'relative z-[2] flex shrink-0 items-start gap-[12px] bg-[var(--surface-panel)] pt-[18px] pr-[16px] pb-[14px] pl-[22px] transition-shadow',
          stuck && 'shadow-[var(--surface-stuck)]',
        )}
      >
        <div className="grid min-w-0 flex-1 gap-[4px] pt-[1px]">
          <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.01em]">
            {t('shortcuts.title')}
          </h2>
          <span className="flex items-center gap-[5px] text-[12px] text-[var(--surface-fg-muted)]">
            {searching ? (
              <>
                <Search className="size-[12px]" aria-hidden="true" />
                {t('shortcuts.shownOf', { shown, total: TOTAL_SHORTCUTS })}
              </>
            ) : (
              <>
                <Keyboard className="size-[12px]" aria-hidden="true" />
                {mac
                  ? t('shortcuts.summaryMac', { count: TOTAL_SHORTCUTS })
                  : t('shortcuts.summaryOther', { count: TOTAL_SHORTCUTS })}
              </>
            )}
          </span>
        </div>
        <label className="group flex h-[30px] w-[240px] shrink-0 cursor-text items-center gap-[8px] rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface-input)] pr-[6px] pl-[10px] text-[var(--surface-fg-faint)] transition-[border-color,box-shadow] focus-within:border-[var(--surface-accent)] focus-within:shadow-[0_0_0_3px_var(--surface-accent-wash)]">
          <Search className="size-[14px] shrink-0" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={t('shortcuts.search')}
            aria-label={t('shortcuts.search')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => search(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--surface-fg)] outline-none placeholder:text-[var(--surface-fg-faint)] [&::-webkit-search-cancel-button]:hidden"
          />
          {!query && <KeyCaps keys="/" size="sm" className="group-focus-within:hidden" />}
        </label>
        <CloseButton label={t('common.close')} onClick={onClose} />
      </div>

      <div
        ref={bodyRef}
        onScroll={(event) => setStuck(event.currentTarget.scrollTop > 4)}
        style={bodyHeight === null ? undefined : { minHeight: bodyHeight }}
        className={cn(
          'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-[22px] pt-[4px] pb-[14px]',
          SCROLLBAR,
        )}
      >
        {shown === 0 ? (
          <div className="grid justify-items-center gap-[12px] py-[96px] text-center text-[12.5px] text-[var(--surface-fg-muted)]">
            <Search className="size-[16px]" aria-hidden="true" />
            <p>
              {rich(t('shortcuts.noMatch'), {
                query: <b className="font-medium text-[var(--surface-fg)]">{query.trim()}</b>,
              })}
            </p>
            <WindowButton
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
            >
              {t('shortcuts.clearSearch')}
            </WindowButton>
          </div>
        ) : (
          <div
            className={cn(
              searching
                ? wide
                  ? 'block columns-4 gap-x-[40px]'
                  : 'block columns-3 gap-x-[32px]'
                : wide
                  ? 'grid grid-cols-4 items-start gap-x-[40px]'
                  : 'grid grid-cols-3 items-start gap-x-[32px]',
            )}
          >
            {(wide ? COLUMNS_WIDE : COLUMNS_NARROW).map((column, index) => (
              <div
                key={index}
                className={searching ? 'contents' : 'grid min-w-0 content-start gap-[24px]'}
              >
                {column.map((category) => {
                  const entries = searching ? category.entries.filter(matches) : category.entries;
                  if (entries.length === 0) return null;
                  return (
                    <section
                      key={category.title}
                      aria-label={t(category.titleKey)}
                      className={cn('grid min-w-0', searching && 'break-inside-avoid pb-[16px]')}
                    >
                      <h3 className="mb-[6px] flex items-baseline justify-between text-[12px] font-semibold">
                        {t(category.titleKey)}
                        <span className="text-[11px] font-normal text-[var(--surface-fg-faint)] tabular-nums">
                          {category.entries.length}
                        </span>
                      </h3>
                      {entries.map((entry) => (
                        <ShortcutRow
                          key={entry.keys + entry.descriptionKey}
                          entry={entry}
                          terms={terms}
                          flashing={flashing === entry.keys}
                        />
                      ))}
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-[10px] border-t border-[var(--surface-line)] pt-[12px] pr-[20px] pb-[16px] pl-[22px]">
        <p
          role="status"
          className="flex min-w-0 flex-1 items-center gap-[7px] text-[11.5px] text-[var(--surface-fg-muted)]"
        >
          <Keyboard className="size-[14px] shrink-0" aria-hidden="true" />
          {said?.kind === 'found' ? (
            <>
              <KeyCaps keys={said.entry.keys} size="sm" />
              <span>
                {rich(t('shortcuts.is'), {
                  what: (
                    <b className="font-medium text-[var(--surface-fg)]">
                      {t(said.entry.descriptionKey)}
                    </b>
                  ),
                })}
              </span>
            </>
          ) : said?.kind === 'missed' ? (
            <>
              <span>
                {rich(t('shortcuts.nothingOn'), {
                  keys: <KeyCaps keys={said.combo} size="sm" />,
                })}
              </span>
            </>
          ) : (
            <span>{t('shortcuts.pressAny')}</span>
          )}
        </p>
        <WindowButton variant="primary" onClick={onClose}>
          {t('common.done')}
        </WindowButton>
      </div>
    </SurfaceWindow>
  );
}

/**
 * One line of the reference: what it does on the left, what to press on the
 * right, split from the line above by a hairline that stops at the text.
 */
function ShortcutRow({
  entry,
  terms,
  flashing,
}: {
  entry: ShortcutEntry;
  terms: string[];
  flashing: boolean;
}) {
  const t = useT();
  return (
    <div
      data-shortcut={entry.keys}
      data-flash={flashing ? '' : undefined}
      className="relative -mx-[6px] flex min-h-[32px] items-center gap-[12px] rounded-[6px] px-[6px] py-[4px] transition-colors duration-[600ms] before:absolute before:inset-x-[6px] before:top-0 before:h-px before:bg-[var(--surface-line)] first-of-type:before:hidden data-[flash]:bg-[var(--surface-flash)] data-[flash]:duration-0 data-[flash]:before:hidden"
    >
      <span className="min-w-0 flex-1 text-[12px] leading-[1.35]">
        {highlight(t(entry.descriptionKey), terms)}
      </span>
      <span className="inline-flex shrink-0 items-center gap-[3px]">
        <KeyCaps keys={entry.keys} />
        {entry.altKeys && (
          <>
            <span className="px-[3px] text-[10.5px] text-[var(--surface-fg-faint)]">
              {t('shortcuts.or')}
            </span>
            <KeyCaps keys={entry.altKeys} />
          </>
        )}
      </span>
    </div>
  );
}
