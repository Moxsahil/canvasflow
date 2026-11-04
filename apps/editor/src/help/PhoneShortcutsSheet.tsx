import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { rich, useT, type TranslationKey } from '../i18n';
import { Icon, type PhoneIconName } from '../settings/phone/icons';
import type { SurfaceTheme } from '../ui/surface-palette';
import { formatShortcutKeys, isMac } from './platform';
import {
  ALL_ENTRIES,
  TOTAL_SHORTCUTS,
  comboOf,
  entryFor,
  highlight,
  searchTextOf,
  type Said,
} from './shortcut-search';
import { SHORTCUTS } from './shortcuts-registry';
import '../settings/phone/phone-settings.css';

/** How far a drag on the grip has to pull the sheet down before letting go closes it. */
const DISMISS_DRAG = 110;

/** The board's own gestures, for a phone with no keyboard: first, as the group most will use. */
const TOUCH: readonly {
  icon: PhoneIconName;
  label: TranslationKey;
  how: TranslationKey;
  gesture: TranslationKey;
}[] = [
  {
    icon: 'hand',
    label: 'ps.kb.touch.move',
    how: 'ps.kb.touch.moveHow',
    gesture: 'ps.kb.touch.moveGesture',
  },
  {
    icon: 'search',
    label: 'ps.kb.touch.zoom',
    how: 'ps.kb.touch.zoomHow',
    gesture: 'ps.kb.touch.zoomGesture',
  },
  {
    icon: 'undo',
    label: 'ps.kb.touch.undo',
    how: 'ps.kb.touch.undoHow',
    gesture: 'ps.kb.touch.undoGesture',
  },
  {
    icon: 'dots',
    label: 'ps.kb.touch.menu',
    how: 'ps.kb.touch.menuHow',
    gesture: 'ps.kb.touch.menuGesture',
  },
  {
    icon: 'text',
    label: 'ps.kb.touch.text',
    how: 'ps.kb.touch.textHow',
    gesture: 'ps.kb.touch.textGesture',
  },
];
const TOUCH_GROUP = 'touch';
const GROUPS = [TOUCH_GROUP, ...SHORTCUTS.map((category) => category.title)];

/** A shortcut as key caps, in this platform's names. */
function Caps({ keys, small = false }: { keys: string; small?: boolean }) {
  return (
    <>
      {formatShortcutKeys(keys).map((key, index) => (
        <kbd key={index} className={cn('cap', small && 'sm')}>
          {key}
        </kbd>
      ))}
    </>
  );
}

/**
 * The keyboard shortcuts on a phone: the desktop window's list, search and
 * press-to-find, as a tall sheet. Each group is a card under a heading that
 * stays at the top while it scrolls; chips jump between them. A tablet's or a
 * Bluetooth keyboard's key press lights up its row, as on the desktop.
 */
export function PhoneShortcutsSheet({
  onClose,
  theme,
}: {
  onClose: () => void;
  theme: SurfaceTheme;
}) {
  const t = useT();
  const mac = useMemo(() => isMac(), []);
  const [query, setQuery] = useState('');
  const [said, setSaid] = useState<Said | null>(null);
  const [flashing, setFlashing] = useState<string | null>(null);
  const [current, setCurrent] = useState(TOUCH_GROUP);
  // The list has moved up under the tabs: a hairline then marks where it goes.
  const [scrolled, setScrolled] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const tabs = useRef<HTMLDivElement>(null);
  // Where each tab stands in the row, measured off the tabs themselves: the
  // filled copy is laid at those places rather than left to lay itself out,
  // as a browser that sizes a button and a span apart (Safari on an iPhone)
  // would put its words and the fill out of step with the tabs under them.
  const [layout, setLayout] = useState<{
    width: number;
    tabs: readonly { left: number; width: number }[];
  } | null>(null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const searchTexts = useMemo(
    () => new Map(ALL_ENTRIES.map((entry) => [entry, searchTextOf(entry, mac, t)])),
    [mac, t],
  );
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const matches = (entry: (typeof ALL_ENTRIES)[number]) =>
    terms.every((term) => searchTexts.get(entry)?.includes(term));
  const shown = searching ? ALL_ENTRIES.filter(matches).length : TOTAL_SHORTCUTS;
  const touchMatches = (row: (typeof TOUCH)[number]) => {
    const text = [t(row.label), t(row.how), t(row.gesture), t('ps.kb.touch.words')]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => text.includes(term));
  };
  const touchShown = searching ? TOUCH.filter(touchMatches) : TOUCH;

  const find = (next: string) => {
    setQuery(next);
    if (body.current) body.current.scrollTop = 0;
  };

  // Escape clears a search before it closes; a key pressed outside the search
  // box is looked up, as in the desktop window.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (query) find('');
        else onClose();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') return;
      if (target?.tagName === 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) return;
      if (event.key === 'Tab') return;
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        search.current?.focus();
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The filled oval slides to the group in view, and its tab is kept in sight
  // as the row of tabs scrolls.
  const measure = useCallback(() => {
    const row = tabs.current;
    if (!row) {
      setLayout(null);
      return;
    }
    const buttons = [...row.querySelectorAll<HTMLElement>('[role="tab"]')];
    setLayout({
      width: row.scrollWidth,
      tabs: buttons.map((tab) => ({ left: tab.offsetLeft, width: tab.offsetWidth })),
    });
  }, []);
  // Again whenever the row changes size: the sheet turning, a font arriving.
  useEffect(() => {
    const row = tabs.current;
    if (!row) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    for (const tab of row.querySelectorAll('[role="tab"]')) observer.observe(tab);
    return () => observer.disconnect();
  }, [measure, searching]);

  // The filled oval slides to the group in view, and its tab is kept in sight
  // as the row of tabs scrolls.
  useLayoutEffect(() => {
    measure();
    const row = tabs.current;
    const tab = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !tab) return;
    const start = tab.offsetLeft - 16;
    const end = tab.offsetLeft + tab.offsetWidth + 16 - row.clientWidth;
    if (row.scrollLeft > start) row.scrollTo({ left: start, behavior: 'smooth' });
    else if (row.scrollLeft < end) row.scrollTo({ left: end, behavior: 'smooth' });
  }, [current, searching, measure]);

  const at = layout?.tabs[GROUPS.indexOf(current)];

  // A found row scrolls into view when it is out of sight.
  useEffect(() => {
    const box = body.current;
    if (!flashing || !box) return;
    const row = box.querySelector<HTMLElement>(`[data-shortcut="${CSS.escape(flashing)}"]`);
    if (!row) return;
    const rowBox = row.getBoundingClientRect();
    const bodyBox = box.getBoundingClientRect();
    if (rowBox.top < bodyBox.top + 48 || rowBox.bottom > bodyBox.bottom - 8) {
      box.scrollTo({
        top: box.scrollTop + rowBox.top - bodyBox.top - bodyBox.height / 2 + rowBox.height / 2,
        behavior: 'smooth',
      });
    }
  }, [flashing]);

  // The chip of the group at the top of the list follows the scroll.
  const followScroll = () => {
    const box = body.current;
    if (!box) return;
    setScrolled(box.scrollTop > 0);
    if (searching) return;
    const top = box.getBoundingClientRect().top + 60;
    let at = GROUPS[0]!;
    for (const group of GROUPS) {
      const section = box.querySelector<HTMLElement>(`[data-group="${group}"]`);
      if (section && section.getBoundingClientRect().top <= top) at = group;
    }
    // At the very end the last group is the one being read, however short.
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) at = GROUPS[GROUPS.length - 1]!;
    setCurrent(at);
  };
  const jumpTo = (title: string) => {
    const box = body.current;
    const section = box?.querySelector<HTMLElement>(`[data-group="${title}"]`);
    if (!box || !section) return;
    setCurrent(title);
    box.scrollTo({
      top: box.scrollTop + section.getBoundingClientRect().top - box.getBoundingClientRect().top,
      behavior: 'smooth',
    });
  };

  const groupName = (group: string) => {
    const category = SHORTCUTS.find((c) => c.title === group);
    return category ? t(category.titleKey) : t('ps.kb.touch');
  };

  const endDrag = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (drag > DISMISS_DRAG) onClose();
    else setDrag(0);
  };

  return createPortal(
    <>
      <div className="cf-ps-scrim keys" onClick={onClose} aria-hidden="true" />
      <section
        className={cn('cf-ps keys', theme === 'light' && 'light', drag ? 'dragging' : 'settle')}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.title')}
        data-testid="phone-shortcuts"
      >
        <div
          className="st-top"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            setDrag(Math.max(0, event.clientY - dragStart.current));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="grab" />
          <div className="st-bar">
            <span />
            <span className="st-bar-t on">{t('shortcuts.title')}</span>
            <button
              type="button"
              className="lib-txt r"
              style={{ fontWeight: 600 }}
              onClick={onClose}
              data-testid="phone-shortcuts-done"
            >
              {t('common.done')}
            </button>
          </div>
        </div>

        <div className="kb-head">
          <div className="kb-card">
            <b className="kb-ct">{t('shortcuts.search')}</b>
            <div className="kb-sum">
              {searching
                ? t('ps.kb.showingOf', { shown, total: TOTAL_SHORTCUTS })
                : mac
                  ? t('ps.kb.showingMac', { count: TOTAL_SHORTCUTS })
                  : t('ps.kb.showingOther', { count: TOTAL_SHORTCUTS })}
            </div>
            <label className="st-search">
              <Icon name="search" size={17} />
              <input
                ref={search}
                type="search"
                value={query}
                onChange={(event) => find(event.target.value)}
                placeholder={t('shortcuts.search')}
                aria-label={t('shortcuts.search')}
                autoComplete="off"
                spellCheck={false}
                data-testid="phone-shortcuts-search"
              />
              {query ? (
                <button
                  type="button"
                  className="kb-x"
                  onClick={() => {
                    find('');
                    search.current?.focus();
                  }}
                  aria-label={t('shortcuts.clearSearch')}
                >
                  <Icon name="x" size={12} />
                </button>
              ) : (
                <span className="kb-slash" aria-hidden="true">
                  /
                </span>
              )}
            </label>
          </div>
        </div>
        {!searching && (
          <div ref={tabs} className="kb-tabs" role="tablist" aria-label={t('ps.kb.groups')}>
            {GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={current === group}
                className="kb-tab"
                onClick={() => jumpTo(group)}
              >
                {groupName(group)}
              </button>
            ))}
            {/* The filled oval: the same row again in the other ink, cut to
                the tab in view. The cut glides, so the fill and the colour of
                the words under it move together, a word half in it half
                changed, as a segmented control does. */}
            {layout && at && (
              <div
                className="kb-pill"
                aria-hidden="true"
                style={{
                  width: layout.width,
                  clipPath: `inset(2px ${layout.width - at.left - at.width}px 12px ${at.left}px round 999px)`,
                }}
              >
                {GROUPS.map((group, index) => {
                  const box = layout.tabs[index];
                  return box ? (
                    <span
                      key={group}
                      className="kb-tab"
                      style={{ left: box.left, width: box.width }}
                    >
                      {groupName(group)}
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        <div
          ref={body}
          className={cn('st-body kb-body', scrolled && 'scrolled')}
          onScroll={followScroll}
        >
          {shown === 0 && touchShown.length === 0 ? (
            <div className="kb-empty">
              <Icon name="search" size={22} />
              {rich(t('shortcuts.noMatch'), { query: <b>{query.trim()}</b> })}
              <br />
              <button
                type="button"
                className="st-btn ghost"
                onClick={() => {
                  find('');
                  search.current?.focus();
                }}
              >
                {t('shortcuts.clearSearch')}
              </button>
            </div>
          ) : (
            <>
              {touchShown.length > 0 && (
                <section data-group={TOUCH_GROUP} aria-label={t('ps.kb.touch')}>
                  <div className="kb-cat">
                    {t('ps.kb.touch')}
                    <span>{TOUCH.length}</span>
                  </div>
                  <div className="kb-g">
                    {touchShown.map((row) => (
                      <div key={row.label} className="kb-r kb-tr">
                        <span className="g-ic">
                          <Icon name={row.icon} size={18} />
                        </span>
                        <span className="d">
                          {highlight(t(row.label), terms, 'kb-mark')}
                          <small>{highlight(t(row.how), terms, 'kb-mark')}</small>
                        </span>
                        <span className="gest">{t(row.gesture)}</span>
                      </div>
                    ))}
                  </div>
                  {!searching && <div className="kb-note">{t('ps.kb.touch.note')}</div>}
                </section>
              )}
              {SHORTCUTS.map((category) => {
                const entries = searching ? category.entries.filter(matches) : category.entries;
                if (entries.length === 0) return null;
                return (
                  <section
                    key={category.title}
                    data-group={category.title}
                    aria-label={t(category.titleKey)}
                  >
                    <div className="kb-cat">
                      {t(category.titleKey)}
                      <span>{category.entries.length}</span>
                    </div>
                    <div className="kb-g">
                      {entries.map((entry) => (
                        <div
                          key={entry.keys + entry.descriptionKey}
                          className={cn('kb-r', flashing === entry.keys && 'flash')}
                          data-shortcut={entry.keys}
                        >
                          <span className="d">
                            {highlight(t(entry.descriptionKey), terms, 'kb-mark')}
                          </span>
                          <span className="k">
                            <span className="cb">
                              <Caps keys={entry.keys} />
                            </span>
                            {entry.altKeys && (
                              <span className="cb">
                                <span className="or">{t('shortcuts.or')}</span>
                                <Caps keys={entry.altKeys} />
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>

        <p className="kb-foot" role="status">
          <Icon name="keyboard" size={16} />
          {said?.kind === 'found' ? (
            <span>
              <span className="kc">
                <Caps keys={said.entry.keys} small />
              </span>
              {rich(t('shortcuts.is'), { what: <b>{t(said.entry.descriptionKey)}</b> })}
            </span>
          ) : said?.kind === 'missed' ? (
            <span>
              {rich(t('shortcuts.nothingOn'), {
                keys: (
                  <span className="kc">
                    <Caps keys={said.combo} small />
                  </span>
                ),
              })}
            </span>
          ) : (
            <span>{t('ps.kb.pressAny')}</span>
          )}
        </p>
      </section>
    </>,
    document.querySelector<HTMLElement>('.cf-editor') ?? document.body,
  );
}
