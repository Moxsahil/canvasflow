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
import { formatShortDate, t as translate, useT, type TranslationKey } from '../i18n';
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
  /**
   * Here through the board's workspace, not a grant of their own: their role
   * there. Changed in Settings → Workspace, so no menu here. Null otherwise.
   */
  workspaceRole?: 'owner' | 'admin' | 'member' | null;
  /** The person looking at this dialog. */
  you: boolean;
  /** Arrived while the dialog was open, a moment ago. */
  justJoined: boolean;
}

/** Someone the owner removed. No share link lets them back; Add back does. */
export interface RemovedPerson {
  id: string;
  name: string;
  email: string;
  isGuest: boolean;
  /** What they could do before, and will again if added back. */
  role: ShareRole;
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
  /**
   * The name of somebody without an account just removed while the live link
   * lets guests in: they could join again as a new guest, so the panel says so
   * and offers a new link. Null otherwise.
   */
  guestMayReturn?: string | null;
  /** Start the session again with a new link, as it is now. */
  onResetLink?: () => void;
  /** People removed from the board, listed out of the way so they can be added back. */
  removed?: RemovedPerson[];
  onAddBack?: (userId: string) => void;
  /** Where a role menu portals: the dialog's backdrop, which carries the palette. */
  menuContainer: HTMLElement | null;
  /** A role menu opened or closed, so Escape can close it before the dialog. */
  onMenuOpenChange?: (open: boolean) => void;
  /** The QR code for `url`, drawn by the caller. */
  qr?: ReactNode;
  /** Pinned in tests; otherwise the clock. */
  now?: number;
}

const PERMISSIONS: Record<
  ShareRole,
  { label: TranslationKey; hint: TranslationKey; icon: typeof Eye }
> = {
  viewer: { label: 'access.canView', hint: 'share.canViewHint', icon: Eye },
  editor: { label: 'access.canEdit', hint: 'share.canEditHint', icon: Pencil },
};

/** How somebody here through the workspace is labelled, in place of a role menu. */
const WORKSPACE_ROLE_LABELS: Record<'owner' | 'admin' | 'member', TranslationKey> = {
  owner: 'share.workspaceOwner',
  admin: 'share.workspaceAdmin',
  member: 'share.workspaceMember',
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
  const t = useT();
  const { boardName, people, session, onClose } = props;
  const members = t('share.memberCount', { count: people.length });

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
            {session ? ` · ${t('share.sharingIsLive')}` : ''}
          </p>
        </div>
        <CloseButton label={t('common.close')} onClick={onClose} />
      </header>

      <div className="flex min-h-0 flex-col gap-[16px] px-[20px] pt-[14px]">
        <Measured>
          {session ? <LiveHero {...props} session={session} /> : <IdleHero {...props} />}
        </Measured>

        <section aria-label={t('share.onThisBoard')} className="flex min-h-0 flex-col gap-[2px]">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[12px] font-semibold">{t('share.onThisBoard')}</h3>
            <span className="text-[11.5px] text-[var(--surface-fg-muted)]">{members}</span>
          </div>
          <PeopleList {...props} />
          {props.guestMayReturn && props.onResetLink && (
            <GuestMayReturn
              name={props.guestMayReturn}
              busy={props.busy}
              onReset={props.onResetLink}
            />
          )}
          {props.removed && props.onAddBack && (
            <RemovedList removed={props.removed} onAddBack={props.onAddBack} />
          )}
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
          {props.error ?? (session ? t('share.keepsRunning') : '')}
        </p>
        <SettingsButton
          variant="ghost"
          className="h-[32px] px-[14px] text-[12.5px]"
          onClick={onClose}
        >
          {t('common.done')}
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
            {props.busy ? t('share.starting') : t('share.start')}
          </SettingsButton>
        )}
      </footer>
    </>
  );
}

/** Someone on the board right now, as the collaborator's window lists them. */
export interface HerePerson {
  id: string;
  name: string;
  photo: string | null;
  /** The person looking at this dialog. */
  you: boolean;
  isOwner: boolean;
}

export interface ShareCollaboratorPanelProps {
  boardName: string;
  /** What the person looking may do here; null until their token says. */
  role: ShareRole | null;
  /** Whose board it is, once the gateway has said. */
  ownerName: string | null;
  here: HerePerson[];
  onClose: () => void;
}

/**
 * The Share window for someone on the board who does not run its sharing —
 * a member of its workspace, or someone let on by link.
 *
 * Sharing is for the board's owner and the workspace's admins, so this is the
 * honest smaller version of their window: what you can do here, who decides
 * who else can, and who is on the board now. It offers no link to pass on:
 * letting people in is not theirs to do. It asks the server for nothing only
 * those who run sharing may read — the people listed come from presence,
 * already on this board's socket — so it has no way to end up showing an
 * error about permissions it never needed.
 */
export function ShareCollaboratorPanel({
  boardName,
  role,
  ownerName,
  here,
  onClose,
}: ShareCollaboratorPanelProps) {
  const t = useT();
  const count = t('share.hereNowCount', { count: here.length });
  const Icon = role === 'editor' ? Pencil : Eye;
  const owner = ownerName ?? t('share.theOwner');

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
            {count}
          </p>
        </div>
        <CloseButton label={t('common.close')} onClick={onClose} />
      </header>

      <div className="flex min-h-0 flex-col gap-[16px] px-[20px] pt-[14px]">
        <div className={HERO}>
          <div className="flex items-center gap-[12px]">
            <span
              aria-hidden="true"
              className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-panel)] text-[var(--surface-fg-muted)]"
            >
              <Icon className="size-[16px]" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
              <p className="text-[13.5px] font-semibold" data-testid="share-your-access">
                {role === 'editor'
                  ? t('share.youCanEdit')
                  : role === 'viewer'
                    ? t('share.youCanView')
                    : t('share.youreOnThisBoard')}
              </p>
              <p className="text-[11.5px] text-[var(--surface-fg-muted)]">
                {t('share.onlyOwnerInvites', { owner })}
              </p>
            </div>
          </div>
        </div>

        <section aria-label={t('share.hereNow')} className="flex min-h-0 flex-col gap-[2px]">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[12px] font-semibold">{t('share.hereNow')}</h3>
            <span className="text-[11.5px] text-[var(--surface-fg-muted)]">{count}</span>
          </div>
          {here.length <= 1 ? (
            <p className="py-[10px] text-[12px] text-[var(--surface-fg-muted)]">
              {t('share.onlyYou')}
            </p>
          ) : (
            <ul className={cn('max-h-[150px] overflow-y-auto pr-[2px]', SCROLLBAR)}>
              {here.map((person) => (
                <li
                  key={person.id}
                  data-testid={`share-here-${person.id}`}
                  className="flex h-[46px] shrink-0 items-center gap-[11px] border-t border-[var(--surface-line)] first:border-t-0"
                >
                  <PersonAvatar
                    url={person.photo}
                    name={person.name}
                    className="size-[28px] text-[11px]"
                  />
                  <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                    {person.name}
                    {person.you && (
                      <span className="font-normal text-[var(--surface-fg-muted)]">
                        {' '}
                        {t('share.you')}
                      </span>
                    )}
                  </p>
                  {person.isOwner && (
                    <span className="inline-flex h-[24px] shrink-0 items-center gap-[5px] rounded-[7px] border border-[var(--surface-border)] px-[8px] text-[11px] text-[var(--surface-fg-muted)]">
                      <Crown className="size-[12px]" aria-hidden="true" />
                      {t('role.owner')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-[8px] px-[20px] pt-[16px] pb-[18px]">
        <SettingsButton
          variant="ghost"
          className="h-[32px] px-[14px] text-[12.5px]"
          onClick={onClose}
        >
          {t('common.done')}
        </SettingsButton>
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
  const t = useT();
  return (
    <div className={HERO}>
      <HeroTop live={false} title={t('share.notSharing')} hint={t('share.notSharingHint')} />
      <div className="flex flex-col gap-[8px]">
        <p id="share-joiners" className="text-[11.5px] text-[var(--surface-fg-muted)]">
          {t('share.peopleWhoJoinCan')}
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
                <span className="text-[12.5px] font-medium">{t(label)}</span>
                <span className="text-[11px] text-[var(--surface-fg-muted)]">{t(hint)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-[12px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
          <p className="text-[12.5px] font-medium">{t('share.allowGuests')}</p>
          <p className="text-[11.5px] text-[var(--surface-fg-muted)]">
            {t('share.allowGuestsHint')}
          </p>
        </div>
        <Toggle
          label={t('share.allowGuestsLabel')}
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
  const t = useT();
  const clock = useNow(now);
  const until = session.expiresAt
    ? t('share.joinUntil', { date: formatDate(session.expiresAt) })
    : t('share.joinUntilStopped');

  return (
    <div className={HERO} aria-live="polite">
      <HeroTop
        live
        title={t('share.liveFor', { duration: liveFor(session.startedAt, clock) })}
        hint={until}
        action={
          <SettingsButton
            variant="danger"
            onClick={onStop}
            disabled={busy}
            data-testid="share-stop"
          >
            <Square className="size-[11px]" aria-hidden="true" />
            {busy ? t('share.stopping') : t('share.stop')}
          </SettingsButton>
        }
      />
      <div className="flex items-center gap-[14px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
          <div className="flex gap-[6px]">
            <input
              readOnly
              value={url ?? ''}
              placeholder={t('share.linkElsewhere')}
              aria-label={t('share.sessionLink')}
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
              {copied ? t('links.copied') : t('export.copy')}
            </SettingsButton>
          </div>
          <div className="flex flex-wrap items-center gap-[6px]">
            <span className="inline-flex h-[22px] items-center gap-[5px] rounded-full bg-[var(--surface-panel)] px-[8px] text-[11px] text-[var(--surface-fg-muted)]">
              <Lock className="size-[11px]" aria-hidden="true" />
              {t(PERMISSIONS[session.role].label)} ·{' '}
              {session.allowGuests ? t('share.guestsCanJoin') : t('share.accountsOnly')}
            </span>
            <span className="text-[11.5px] text-[var(--surface-fg-muted)]">
              {url ? t('share.setAtStart') : t('share.restartForLink')}
            </span>
          </div>
        </div>
        {url && qr ? (
          <div title={t('share.scanHint')} className="shrink-0">
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
  const t = useT();
  if (people.length === 0) {
    return (
      <p className="py-[10px] text-[12px] text-[var(--surface-fg-muted)]">{t('share.onlyYou')}</p>
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
                  <span className="font-normal text-[var(--surface-fg-muted)]">
                    {' '}
                    {t('share.you')}
                  </span>
                )}
              </span>
              {person.isGuest && <StatusTag tone="neutral">{t('signOut.guest')}</StatusTag>}
              {person.justJoined && <StatusTag tone="positive">{t('share.joined')}</StatusTag>}
            </p>
            <p className="truncate text-[11.5px] text-[var(--surface-fg-muted)]">
              {person.isGuest ? t('share.noAccount') : person.email}
            </p>
          </div>
          {person.isOwner ? (
            <span className="inline-flex h-[26px] shrink-0 items-center gap-[5px] rounded-[7px] border border-[var(--surface-border)] px-[9px] text-[11.5px] text-[var(--surface-fg-muted)]">
              <Crown className="size-[12px]" aria-hidden="true" />
              {t('role.owner')}
            </span>
          ) : person.workspaceRole ? (
            <span
              title={t('share.throughWorkspace')}
              data-testid={`share-workspace-${person.id}`}
              className="inline-flex h-[26px] shrink-0 items-center gap-[5px] rounded-[7px] border border-[var(--surface-border)] px-[9px] text-[11.5px] text-[var(--surface-fg-muted)]"
            >
              <Users className="size-[12px]" aria-hidden="true" />
              {t(WORKSPACE_ROLE_LABELS[person.workspaceRole])}
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
 * Said right after removing somebody who joined without an account: the board
 * cannot tell them from anyone else who opens the link, so the link is what
 * has to change to keep them out.
 */
function GuestMayReturn({
  name,
  busy,
  onReset,
}: {
  name: string;
  busy: boolean;
  onReset: () => void;
}) {
  const t = useT();
  return (
    <div
      role="status"
      data-testid="share-guest-may-return"
      className="mt-[6px] flex items-center gap-[10px] rounded-[10px] bg-amber-500/10 px-[12px] py-[9px]"
    >
      <p className="min-w-0 flex-1 text-[11.5px] leading-[1.5] text-[var(--surface-fg)]">
        {t('share.guestMayReturn', { name })}
      </p>
      <SettingsButton onClick={onReset} disabled={busy} data-testid="share-reset-link">
        {t('share.resetLink')}
      </SettingsButton>
    </div>
  );
}

/**
 * The people the owner removed, folded away under one line.
 *
 * Kept off the main list, which is who is on the board now, but not hidden:
 * a removed person cannot get back in with any link, so this is the only way
 * back for them, and it should be findable without being in the way.
 */
function RemovedList({
  removed,
  onAddBack,
}: {
  removed: RemovedPerson[];
  onAddBack: (userId: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (removed.length === 0) return null;

  return (
    <div className="mt-[4px] border-t border-[var(--surface-line)] pt-[4px]">
      <button
        type="button"
        aria-expanded={open}
        data-testid="share-removed-toggle"
        onClick={() => setOpen((was) => !was)}
        className="flex w-full items-center justify-between rounded-[6px] py-[5px] text-[11.5px] text-[var(--surface-fg-muted)] transition-colors hover:text-[var(--surface-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
      >
        <span>{t('share.removedCount', { count: removed.length })}</span>
        <ChevronDown
          className={cn('size-[13px] transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul className={cn('max-h-[120px] overflow-y-auto pr-[2px]', SCROLLBAR)}>
          {removed.map((person) => (
            <li
              key={person.id}
              data-testid={`share-removed-${person.id}`}
              className="flex h-[42px] shrink-0 items-center gap-[10px]"
            >
              {/* No photo: it is read through the board, which they are no longer on. */}
              <PersonAvatar url={null} name={person.name} className="size-[26px] text-[10px]" />
              <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
                <p className="truncate text-[12px] font-medium text-[var(--surface-fg-muted)]">
                  {person.name}
                </p>
                <p className="truncate text-[11px] text-[var(--surface-fg-faint)]">
                  {`${person.isGuest ? t('share.noAccount') : person.email} · ${t(PERMISSIONS[person.role].label)}`}
                </p>
              </div>
              <SettingsButton onClick={() => onAddBack(person.id)}>
                {t('share.addBack')}
              </SettingsButton>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const t = useT();
  const role = person.role === 'owner' ? 'editor' : person.role;
  const { label, icon: Icon } = PERMISSIONS[role];
  return (
    <InlineDropdownMenu onOpenChange={onOpenChange}>
      <InlineDropdownMenuTrigger asChild>
        <SettingsButton
          aria-label={t('share.roleFor', { name: person.name })}
          data-testid={`share-role-menu-${person.id}`}
          className="gap-[6px] pr-[7px] pl-[9px] data-[state=open]:bg-[var(--surface-wash-hover)] [&[data-state=open]>svg:last-child]:rotate-180"
        >
          <Icon className="size-[12px]" aria-hidden="true" />
          {t(label)}
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
        aria-label={t('share.roleFor', { name: person.name })}
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
                {t(PERMISSIONS[key].label)}
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
          {t('share.removeFromBoard')}
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
  if (hours < 24) {
    return translate('share.hoursMinutes', { hours, minutes: Math.floor((seconds % 3600) / 60) });
  }
  return translate('share.days', { count: Math.floor(hours / 24) });
}

function formatDate(iso: string): string {
  return formatShortDate(new Date(iso));
}
