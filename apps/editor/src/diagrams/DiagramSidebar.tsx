import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { PLAN_NAMES, type DiagramUsage } from '@canvasflow/types';
import { cn } from '@/lib/utils';
import { relativeTime } from '../comments/comment-time';
import { formatShortDate, useT } from '../i18n';
import { PersonAvatar } from '../ui/PersonAvatar';
import { chatsOf, type DiagramEntry } from './diagram-history';
import type { DiagramRun } from './useDiagramPanel';

const iconButton =
  'grid size-7 shrink-0 place-items-center rounded-md text-[var(--surface-fg-muted)] outline-none hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]';

/**
 * The diagrams panel's sidebar: the board's chats, each opening to its
 * versions in order, and at the foot who is drawing and how many diagrams are
 * left this month.
 *
 * Beside the conversation on a wide panel; on a narrow one it opens over it
 * from the header's button and puts itself away once something is picked.
 */
export function DiagramSidebar({
  entries,
  chat,
  run,
  focused,
  isOnBoard,
  onShowChat,
  onShowVersion,
  onNewChat,
  profile,
  usage,
  upgradeLabel,
  onUpgrade,
  open,
  onDismiss,
}: {
  entries: readonly DiagramEntry[];
  /** The chat on show, or null for a new one. */
  chat: string | null;
  run: DiagramRun | null;
  /** The version last picked here, lit in its chat. */
  focused: string | null;
  isOnBoard: (entry: DiagramEntry) => boolean;
  onShowChat: (id: string) => void;
  onShowVersion: (entry: DiagramEntry) => void;
  onNewChat: () => void;
  profile: { name: string; avatarUrl: string | null } | null;
  usage: DiagramUsage | null;
  /** "Upgrade to Pro", or null where there is no bigger plan. */
  upgradeLabel: string | null;
  onUpgrade: () => void;
  /** Open over the conversation, on a narrow panel. */
  open: boolean;
  onDismiss: () => void;
}) {
  const t = useT();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const chats = useMemo(() => {
    const all = chatsOf(entries);
    const words = query.trim().toLowerCase();
    if (!words) return all;
    return all.filter((item) =>
      item.entries.some((entry) => entry.description.toLowerCase().includes(words)),
    );
  }, [entries, query]);

  // A chat whose first diagram is still being drawn has no entries yet.
  const pending =
    run && !entries.some((entry) => entry.chatId === run.chatId) && !query.trim() ? run : null;
  const inserted = entries.filter(isOnBoard).length;
  const left = usage ? Math.max(usage.limit - usage.used, 0) : null;

  /**
   * One highlight for the list, gliding from row to row under the pointer or
   * the keyboard's focus rather than each row lighting on its own. It appears
   * where it is first needed, then slides; it fades once nothing is under it.
   */
  const list = useRef<HTMLDivElement>(null);
  const [glide, setGlide] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    shown: boolean;
    instant: boolean;
  } | null>(null);
  const follow = (target: EventTarget | null) => {
    const wrap = list.current;
    if (!wrap || !(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('[data-glide]');
    if (!row || !wrap.contains(row)) return;
    const outer = wrap.getBoundingClientRect();
    const inner = row.getBoundingClientRect();
    setGlide((current) => ({
      x: inner.left - outer.left,
      y: inner.top - outer.top,
      w: inner.width,
      h: inner.height,
      shown: true,
      instant: !current?.shown,
    }));
  };
  const rest = () => setGlide((current) => current && { ...current, shown: false });

  /**
   * The chats opened to their versions. The chevron opens and closes one
   * without leaving the chat on show; picking a chat opens it as well.
   */
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(chat ? [chat] : []));
  useEffect(() => {
    if (chat) setOpened((current) => (current.has(chat) ? current : new Set(current).add(chat)));
  }, [chat]);
  const toggle = (id: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const pick = (action: () => void) => {
    action();
    onDismiss();
  };

  return (
    <nav
      aria-label={t('diagrams.chats')}
      data-open={open ? '' : undefined}
      className="cf-diagram-sidebar flex min-h-0 flex-col border-r border-[var(--surface-line)] bg-[var(--surface-band)]"
    >
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <span className="min-w-0 flex-1 truncate pl-1 text-[13px] font-semibold">
          {t('diagrams.chats')}
        </span>
        <button
          type="button"
          className={iconButton}
          aria-label={t('diagrams.searchChats')}
          title={t('diagrams.searchChats')}
          aria-pressed={searching}
          onClick={() => {
            setSearching((value) => !value);
            setQuery('');
          }}
        >
          <Search className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => pick(onNewChat)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2.5 text-xs font-medium outline-none hover:bg-[var(--surface-raised-hover)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {t('diagrams.newChat')}
        </button>
        {open && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('diagrams.hideChats')}
            title={t('diagrams.hideChats')}
            className={iconButton}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {searching && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('diagrams.searchChats')}
            placeholder={t('diagrams.searchChats')}
            className="h-8 w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-input)] px-2.5 text-xs text-[var(--surface-fg)] outline-none placeholder:text-[var(--surface-fg-faint)] focus:border-[var(--surface-accent)]"
          />
        </div>
      )}

      {/* A scroll moves the rows from under the highlight, so it fades. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" onScroll={rest}>
        <div
          ref={list}
          className="relative"
          onPointerOver={(event) => follow(event.target)}
          onPointerLeave={rest}
          onFocus={(event) => follow(event.target)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) rest();
          }}
        >
          {glide && (
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute top-0 left-0 rounded-md bg-[var(--surface-wash)] motion-reduce:transition-none',
                glide.instant
                  ? 'transition-opacity duration-150'
                  : 'transition-[transform,width,height,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
              )}
              style={{
                transform: `translate(${glide.x}px, ${glide.y}px)`,
                width: glide.w,
                height: glide.h,
                opacity: glide.shown ? 1 : 0,
              }}
            />
          )}
          {pending && (
            <div className="relative flex items-center gap-2 rounded-md bg-[var(--surface-wash)] px-2 py-1.5 text-[13px]">
              <LoaderCircle
                className="size-3.5 shrink-0 animate-spin text-[var(--surface-accent)] motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{pending.description}</span>
            </div>
          )}
          {chats.length === 0 && !pending && (
            <p className="m-0 px-2 py-3 text-xs text-[var(--surface-fg-faint)]">
              {query.trim() ? t('diagrams.noChatsMatch') : t('diagrams.noChats')}
            </p>
          )}
          {chats.map((item) => {
            const shown = item.id === chat;
            const expanded = opened.has(item.id);
            const drawing = run?.status === 'running' && run.chatId === item.id;
            return (
              <div key={item.id} className="mt-0.5">
                <div
                  data-glide=""
                  className={cn(
                    'relative flex w-full items-center rounded-md text-[13px]',
                    shown
                      ? 'font-medium text-[var(--surface-fg)]'
                      : 'text-[var(--surface-fg-muted)]',
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={t(expanded ? 'diagrams.hideVersions' : 'diagrams.showVersions')}
                    title={t(expanded ? 'diagrams.hideVersions' : 'diagrams.showVersions')}
                    onClick={() => toggle(item.id)}
                    className="grid size-7 shrink-0 place-items-center rounded-md outline-none hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
                  >
                    <ChevronRight
                      className={cn(
                        'size-3.5 transition-transform duration-150 motion-reduce:transition-none',
                        expanded && 'rotate-90',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    aria-current={shown ? 'true' : undefined}
                    onClick={() => pick(() => onShowChat(item.id))}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
                  >
                    <span className="min-w-0 flex-1 truncate" title={item.title}>
                      {item.title}
                    </span>
                    {drawing ? (
                      <LoaderCircle
                        className="size-3.5 shrink-0 animate-spin text-[var(--surface-accent)] motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="shrink-0 text-[11px] font-normal text-[var(--surface-fg-faint)] tabular-nums">
                        {item.entries.length}
                      </span>
                    )}
                  </button>
                </div>
                {expanded && (
                  <ol className="relative m-0 list-none py-0.5 pl-0">
                    <span
                      aria-hidden="true"
                      className="absolute top-3 bottom-3 left-[13px] w-px bg-[var(--surface-border)]"
                    />
                    {item.entries.map((entry, index) => {
                      const lit = focused
                        ? entry.id === focused
                        : index === item.entries.length - 1;
                      const label =
                        index === 0
                          ? t('diagrams.versionFirst')
                          : entry.changeOf
                            ? entry.description
                            : t('diagrams.versionAgain');
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            data-glide=""
                            aria-current={lit ? 'true' : undefined}
                            onClick={() => pick(() => onShowVersion(entry))}
                            className={cn(
                              'relative flex w-full items-start gap-2 rounded-md py-1.5 pr-2 pl-7 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]',
                              lit && 'bg-[var(--surface-wash)]',
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                'absolute top-[9px] left-[9px] size-[9px] rounded-full border-2',
                                lit
                                  ? 'border-[var(--surface-accent)] bg-[var(--surface-accent)]'
                                  : 'border-[var(--surface-fg-faint)] bg-[var(--surface-band)]',
                              )}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[var(--surface-fg)]">
                                {t('diagrams.version', { n: index + 1 })} · {label}
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--surface-fg-faint)]">
                                {entry.changeOf ? `${t('diagrams.versionRefine')} · ` : ''}
                                {relativeTime(entry.createdAt)}
                                {isOnBoard(entry) && (
                                  <span className="rounded-full bg-[var(--surface-accent-wash)] px-1.5 text-[10.5px] text-[var(--surface-fg)]">
                                    {t('diagrams.onBoard')}
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-[var(--surface-line)] px-3 pt-3 pb-3">
        {inserted > 0 && (
          <div className="flex justify-between text-xs text-[var(--surface-fg-muted)]">
            <span>{t('diagrams.insertedOnBoard')}</span>
            <span className="text-[var(--surface-fg)] tabular-nums">{inserted}</span>
          </div>
        )}
        {profile && (
          <div className="flex items-center gap-2.5">
            <PersonAvatar
              url={profile.avatarUrl}
              name={profile.name}
              className="size-7 text-[11px]"
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{profile.name}</span>
            {usage && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                  usage.plan === 'free'
                    ? 'border border-[var(--surface-border)] text-[var(--surface-fg-muted)]'
                    : 'bg-[var(--surface-accent-wash)] text-[var(--surface-fg)]',
                )}
              >
                {PLAN_NAMES[usage.plan]}
              </span>
            )}
          </div>
        )}
        {usage && left !== null && (
          <div className="flex flex-col gap-1.5">
            <div
              role="progressbar"
              aria-label={t('diagrams.left', { left, limit: usage.limit })}
              aria-valuemin={0}
              aria-valuemax={usage.limit}
              aria-valuenow={left}
              className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-wash)]"
            >
              <div
                className={cn(
                  'h-full rounded-full',
                  left === 0
                    ? 'bg-[var(--surface-danger)]'
                    : left / usage.limit < 0.2
                      ? 'bg-[var(--surface-warn)]'
                      : 'bg-[var(--surface-accent)]',
                )}
                style={{ width: `${Math.min(100, (left / usage.limit) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--surface-fg-muted)]">
              <span className="tabular-nums">
                {t('diagrams.left', { left, limit: usage.limit })} ·{' '}
                {t('diagrams.resets', { date: formatShortDate(new Date(usage.resetsAt)) })}
              </span>
              {usage.plan === 'free' && upgradeLabel && (
                <button
                  type="button"
                  onClick={onUpgrade}
                  className="shrink-0 rounded font-semibold text-[var(--diagram-link)] underline-offset-[3px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
                >
                  {upgradeLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
