import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Copy,
  Crown,
  Eye,
  Lock,
  Pencil,
  Play,
  Radio,
  Square,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuDangerRowClasses } from '@/components/ui/menu-look';
import { initialsOf } from '@/lib/initials';
import { PersonAvatar } from '../ui/PersonAvatar';
import {
  InlineDropdownMenu,
  InlineDropdownMenuChoiceItem,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuRadioGroup,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import {
  CloseButton,
  EASE,
  INPUT,
  SCROLLBAR,
  SettingsButton,
  StatusTag,
  Toggle,
} from '../settings/settings-ui';
import type { ShareRole } from './share-api';

/** Someone on the board, as the list shows them. */
export interface SharePerson {
  id: string;
  name: string;
  email: string;
  isGuest: boolean;
  isOwner: boolean;
  role: ShareRole | 'owner';
  photo: string | null;
  /** The person looking at this dialog. */
  you: boolean;
  /** Arrived while the dialog was open, a moment ago. */
  justJoined: boolean;
}

/** The session that is live, when one is. Its terms were fixed when it started. */
export interface LiveSession {
  role: ShareRole;
  allowGuests: boolean;
  startedAt: string;
  expiresAt: string | null;
}

export interface ShareSessionPanelProps {
  boardName: string;
  people: SharePerson[];
  session: LiveSession | null;
  /** The link, when this browser made it. The server keeps only a hash. */
  url: string | null;
  /** What the next session will allow, chosen before it starts. */
  role: ShareRole;
  allowGuests: boolean;
  onRoleChange: (role: ShareRole) => void;
  onAllowGuestsChange: (allow: boolean) => void;
  busy: boolean;
  copied: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onCopy: () => void;
  onClose: () => void;
  onMemberRole: (userId: string, role: ShareRole) => void;
  onRemoveMember: (userId: string) => void;
  /** Where a role menu portals: the dialog's backdrop, which carries the palette. */
  menuContainer: HTMLElement | null;
  /** A role menu opened or closed, so Escape can close it before the dialog. */
  onMenuOpenChange?: (open: boolean) => void;
  /** The QR code for `url`, drawn by the caller. */
  qr?: ReactNode;
  /** Pinned in tests; otherwise the clock. */
  now?: number;
}

const PERMISSIONS: Record<ShareRole, { label: string; hint: string; icon: typeof Eye }> = {
  viewer: { label: 'Can view', hint: 'See it, but not change it', icon: Eye },
  editor: { label: 'Can edit', hint: 'Draw and change the board', icon: Pencil },
};

/** Chosen from a person's menu, where it reads as one more thing to set. */
const REMOVE = 'remove';

/**
 * The Share window's contents: the board, its session, and who is on it.
 *
 * The session is the thing being shared, so it leads, in one of two states.
 * Before, it says the board is not being shared and asks what people who join
 * may do. While live, the same place becomes the session: how long it has run,
 * the link and its code, and what the link allows. People are listed under it
 * either way, and arrive in the list as they join.
 */
export function ShareSessionPanel(props: ShareSessionPanelProps) {
  const { boardName, people, session, onClose } = props;
  const members = people.length === 1 ? '1 member' : `${people.length} members`;

  return (
    <>
      <header className="flex shrink-0 items-start gap-[12px] px-[20px] pt-[18px] pr-[16px]">
        <span
          aria-hidden="true"
          className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-accent)] text-[12px] font-semibold text-[var(--surface-on-accent)]"
        >
          {initialsOf(boardName)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <h2 className="truncate text-[16px] font-semibold tracking-[-0.01em]">{boardName}</h2>
          <p className="flex items-center gap-[5px] text-[12px] text-[var(--surface-fg-muted)]">
            <Users className="size-[12px]" aria-hidden="true" />
            {members}
            {session ? ' · sharing is live' : ''}
          </p>
        </div>
        <CloseButton label="Close" onClick={onClose} />
      </header>

      <div className="flex min-h-0 flex-col gap-[16px] px-[20px] pt-[14px]">
        <Measured>
          {session ? <LiveHero {...props} session={session} /> : <IdleHero {...props} />}
        </Measured>

        <section aria-label="On this board" className="flex min-h-0 flex-col gap-[2px]">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[12px] font-semibold">On this board</h3>
            <span className="text-[11.5px] text-[var(--surface-fg-muted)]">{members}</span>
          </div>
          <PeopleList {...props} />
        </section>
      </div>

      <footer className="flex shrink-0 items-center gap-[8px] px-[20px] pt-[16px] pb-[18px]">
        <p
          role={props.error ? 'alert' : undefined}
          className={cn(
            'min-w-0 flex-1 text-[11px]',
            props.error ? 'text-[var(--surface-danger)]' : 'text-[var(--surface-fg-faint)]',
          )}
        >
          {props.error ?? (session ? 'The session keeps running when you close this.' : '')}
        </p>
        <SettingsButton
          variant="ghost"
          className="h-[32px] px-[14px] text-[12.5px]"
          onClick={onClose}
        >
          Done
        </SettingsButton>
        {!session && (
          <SettingsButton
            variant="primary"
            className="h-[32px] px-[14px] text-[12.5px]"
            onClick={props.onStart}
            disabled={props.busy}
            data-testid="share-start"
          >
            <Play className="size-[12px]" aria-hidden="true" />
            {props.busy ? 'Starting…' : 'Start session'}
          </SettingsButton>
        )}
      </footer>
    </>
  );
}

/** Grows and shrinks with what it holds, rather than jumping between the two states. */
function Measured({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  useEffect(() => {
    const element = inner.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={{ duration: 0.24, ease: EASE }}
      className="shrink-0 overflow-hidden"
    >
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

const HERO = 'flex flex-col gap-[14px] rounded-[12px] bg-[var(--surface-wash)] p-[16px]';

function HeroTop({
  live,
  title,
  hint,
  action,
}: {
  live: boolean;
  title: ReactNode;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-[12px]">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-panel)]',
          live ? 'text-[#22c55e]' : 'text-[var(--surface-fg-muted)]',
        )}
      >
        <Radio className="size-[16px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <p className="text-[13.5px] font-semibold">{title}</p>
        <p className="text-[11.5px] text-[var(--surface-fg-muted)]">{hint}</p>
      </div>
      {action}
    </div>
  );
}

/** Before a session: what people who join may do, and whether guests may come. */
function IdleHero({
  role,
  allowGuests,
  onRoleChange,
  onAllowGuestsChange,
  busy,
}: ShareSessionPanelProps) {
  return (
    <div className={HERO}>
      <HeroTop
        live={false}
        title="Not sharing yet"
        hint="Start a session to get a link anyone can join by. It stays live until you stop it."
      />
      <div className="flex flex-col gap-[8px]">
        <p id="share-joiners" className="text-[11.5px] text-[var(--surface-fg-muted)]">
          People who join can
        </p>
        <div
          role="radiogroup"
          aria-labelledby="share-joiners"
          className="grid grid-cols-2 gap-[8px]"
        >
          {(['viewer', 'editor'] as const).map((key) => {
            const { label, hint, icon: Icon } = PERMISSIONS[key];
            const selected = role === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => onRoleChange(key)}
                data-testid={`share-role-${key}`}
                className={cn(
                  'grid grid-cols-[16px_1fr] gap-x-[8px] gap-y-[2px] rounded-[10px] bg-[var(--surface-panel)] px-[12px] py-[10px] text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-wash)]',
                  selected
                    ? 'shadow-[0_0_0_2px_var(--surface-accent)]'
                    : 'shadow-[0_0_0_1px_var(--surface-border)]',
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    'row-span-2 mt-[1px] size-[14px]',
                    selected ? 'text-[var(--surface-accent)]' : 'text-[var(--surface-fg-muted)]',
                  )}
                />
                <span className="text-[12.5px] font-medium">{label}</span>
                <span className="text-[11px] text-[var(--surface-fg-muted)]">{hint}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-[12px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
          <p className="text-[12.5px] font-medium">Allow guests</p>
          <p className="text-[11.5px] text-[var(--surface-fg-muted)]">
            People without an account can join
          </p>
        </div>
        <Toggle
          label="Allow people without an account"
          on={allowGuests}
          onChange={onAllowGuestsChange}
          disabled={busy}
        />
      </div>
    </div>
  );
}

/** While live: the session itself — how long, the link, its code, and its terms. */
function LiveHero({
  session,
  url,
  busy,
  copied,
  onStop,
  onCopy,
  qr,
  now,
}: ShareSessionPanelProps & { session: LiveSession }) {
  const clock = useNow(now);
  const until = session.expiresAt
    ? `Anyone with the link can join until ${formatDate(session.expiresAt)}, or until you stop it.`
    : 'Anyone with the link can join until you stop it.';

  return (
    <div className={HERO} aria-live="polite">
      <HeroTop
        live
        title={<>Live for {liveFor(session.startedAt, clock)}</>}
        hint={until}
        action={
          <SettingsButton
            variant="danger"
            onClick={onStop}
            disabled={busy}
            data-testid="share-stop"
          >
            <Square className="size-[11px]" aria-hidden="true" />
            {busy ? 'Stopping…' : 'Stop session'}
          </SettingsButton>
        }
      />
      <div className="flex items-center gap-[14px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
          <div className="flex gap-[6px]">
            <input
              readOnly
              value={url ?? ''}
              placeholder="Link created in another browser"
              aria-label="Session link"
              onFocus={(event) => event.currentTarget.select()}
              className={cn(INPUT, 'min-w-0 flex-1')}
            />
            <SettingsButton
              variant="primary"
              className="h-[32px] px-[14px] text-[12.5px]"
              onClick={onCopy}
              disabled={!url}
              data-testid="share-copy"
            >
              {copied ? (
                <Check className="size-[14px]" aria-hidden="true" />
              ) : (
                <Copy className="size-[14px]" aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </SettingsButton>
          </div>
          <div className="flex flex-wrap items-center gap-[6px]">
            <span className="inline-flex h-[22px] items-center gap-[5px] rounded-full bg-[var(--surface-panel)] px-[8px] text-[11px] text-[var(--surface-fg-muted)]">
              <Lock className="size-[11px]" aria-hidden="true" />
              {PERMISSIONS[session.role].label} ·{' '}
              {session.allowGuests ? 'Guests can join' : 'Accounts only'}
            </span>
            <span className="text-[11.5px] text-[var(--surface-fg-muted)]">
              {url ? 'Set when the session started' : 'Stop and start again to get the link here'}
            </span>
          </div>
        </div>
        {url && qr ? (
          <div title="Scan to open the board on a phone or tablet" className="shrink-0">
            {qr}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Everyone on the board. Three rows show, each the same fixed height so the
 * third ends exactly at the edge; anyone after them is a scroll away inside
 * the list, which keeps the window the same size on a busy board.
 */
function PeopleList({
  people,
  onMemberRole,
  onRemoveMember,
  menuContainer,
  onMenuOpenChange,
}: ShareSessionPanelProps) {
  if (people.length === 0) {
    return (
      <p className="py-[10px] text-[12px] text-[var(--surface-fg-muted)]">Only you, for now.</p>
    );
  }

  return (
    <ul className={cn('max-h-[150px] overflow-y-auto pr-[2px]', SCROLLBAR)}>
      {people.map((person) => (
        <motion.li
          key={person.id}
          data-testid={`share-person-${person.id}`}
          // Someone who joins while the window is open slides into the list.
          initial={person.justJoined ? { opacity: 0, y: -6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="flex h-[50px] shrink-0 items-center gap-[11px] border-t border-[var(--surface-line)] first:border-t-0"
        >
          <PersonAvatar url={person.photo} name={person.name} className="size-[30px] text-[11px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
            <p className="flex min-w-0 items-center gap-[6px] text-[12.5px] font-medium">
              <span className="truncate">
                {person.name}
                {person.you && (
                  <span className="font-normal text-[var(--surface-fg-muted)]"> (you)</span>
                )}
              </span>
              {person.isGuest && <StatusTag tone="neutral">Guest</StatusTag>}
              {person.justJoined && <StatusTag tone="positive">Joined</StatusTag>}
            </p>
            <p className="truncate text-[11.5px] text-[var(--surface-fg-muted)]">
              {person.isGuest ? 'No account' : person.email}
            </p>
          </div>
          {person.isOwner ? (
            <span className="inline-flex h-[26px] shrink-0 items-center gap-[5px] rounded-[7px] border border-[var(--surface-border)] px-[9px] text-[11.5px] text-[var(--surface-fg-muted)]">
              <Crown className="size-[12px]" aria-hidden="true" />
              Owner
            </span>
          ) : (
            <RoleMenu
              person={person}
              onChange={(next) =>
                next === REMOVE ? onRemoveMember(person.id) : onMemberRole(person.id, next)
              }
              container={menuContainer}
              onOpenChange={onMenuOpenChange}
            />
          )}
        </motion.li>
      ))}
    </ul>
  );
}

/**
 * What someone may do on the board, and the way to take them off it — in the
 * menu look the context menu and the sidebar wear, so the one menu in this
 * window is the same menu as everywhere else.
 */
function RoleMenu({
  person,
  onChange,
  container,
  onOpenChange,
}: {
  person: SharePerson;
  onChange: (next: ShareRole | typeof REMOVE) => void;
  container: HTMLElement | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const role = person.role === 'owner' ? 'editor' : person.role;
  const { label, icon: Icon } = PERMISSIONS[role];
  return (
    <InlineDropdownMenu onOpenChange={onOpenChange}>
      <InlineDropdownMenuTrigger asChild>
        <SettingsButton
          aria-label={`Role for ${person.name}`}
          data-testid={`share-role-menu-${person.id}`}
          className="gap-[6px] pr-[7px] pl-[9px] data-[state=open]:bg-[var(--surface-wash-hover)] [&[data-state=open]>svg:last-child]:rotate-180"
        >
          <Icon className="size-[12px]" aria-hidden="true" />
          {label}
          <ChevronDown
            className="size-[12px] text-[var(--surface-fg-muted)] transition-transform duration-200"
            aria-hidden="true"
          />
        </SettingsButton>
      </InlineDropdownMenuTrigger>
      <InlineDropdownMenuContent
        align="end"
        sideOffset={4}
        collisionPadding={8}
        container={container}
        aria-label={`Role for ${person.name}`}
        className="min-w-44"
      >
        <InlineDropdownMenuRadioGroup
          value={role}
          onValueChange={(value) => onChange(value as ShareRole)}
        >
          {(['viewer', 'editor'] as const).map((key) => {
            const OptionIcon = PERMISSIONS[key].icon;
            return (
              <InlineDropdownMenuChoiceItem
                key={key}
                value={key}
                icon={<OptionIcon aria-hidden="true" />}
              >
                {PERMISSIONS[key].label}
              </InlineDropdownMenuChoiceItem>
            );
          })}
        </InlineDropdownMenuRadioGroup>
        <InlineDropdownMenuSeparator />
        <InlineDropdownMenuItem
          icon={<Trash2 aria-hidden="true" />}
          onSelect={() => onChange(REMOVE)}
          className={menuDangerRowClasses}
        >
          Remove from board
        </InlineDropdownMenuItem>
      </InlineDropdownMenuContent>
    </InlineDropdownMenu>
  );
}

/** The clock, once a second, for as long as something is live on screen. */
function useNow(pinned?: number): number {
  const [now, setNow] = useState(() => pinned ?? Date.now());
  useEffect(() => {
    if (pinned !== undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pinned]);
  return pinned ?? now;
}

/**
 * How long a session has run: "0:42" and "12:05" within the hour, then
 * "2 h 14 min", then "3 days". A link lives until it is stopped, so a session
 * can run for weeks, and seconds stop mattering long before that.
 */
export function liveFor(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  if (seconds < 3600) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours} h ${Math.floor((seconds % 3600) / 60)} min`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
