import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Ellipsis,
  Link2,
  QrCode,
  ChevronDown,
  Code,
  Copy,
  Crown,
  Eye,
  Pencil,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuDangerRowClasses } from '@/components/ui/menu-look';
import { initialsOf } from '@/lib/initials';
import { PersonAvatar } from '../ui/PersonAvatar';
import { formatShortDate, useT, type TranslationKey } from '../i18n';
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
  /** How many people are on the board right now. */
  hereCount?: number;
  /** Embedding the board on other sites; left out, the section is not shown. */
  embed?: EmbedSettings;
}

/** Share → Embed on a website, as the panel shows it. */
export interface EmbedSettings {
  /** Null while the setting is being read. */
  on: boolean | null;
  /** The code to paste into another site, while embedding is on. */
  code: string | null;
  busy: boolean;
  copied: boolean;
  onChange: (on: boolean) => void;
  onCopy: () => void;
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
  const { boardName, session, onClose } = props;
  const [more, setMore] = useState(false);

  return (
    <>
      <header className="flex shrink-0 items-center gap-[12px] px-[20px] pt-[16px] pr-[16px]">
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-[-0.01em]">
          {t('share.dialogLabel', { name: boardName })}
        </h2>
        {props.embed && (
          <button
            type="button"
            aria-label={t('common.more')}
            aria-expanded={more}
            data-testid="share-more"
            onClick={() => setMore((open) => !open)}
            className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] text-[var(--surface-fg-muted)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:outline-none"
          >
            <Ellipsis className="size-[16px]" aria-hidden="true" />
          </button>
        )}
        <CloseButton label={t('common.close')} onClick={onClose} />
      </header>

      <div
        className={cn(
          'flex min-h-0 flex-col gap-[16px] overflow-y-auto px-[20px] pt-[14px] pb-[20px]',
          SCROLLBAR,
        )}
      >
        <Measured>
          {session ? <LiveHero {...props} session={session} /> : <IdleHero {...props} />}
        </Measured>

        <section aria-label={t('share.onThisBoard')} className="flex min-h-0 flex-col gap-[2px]">
          <div aria-hidden="true" className="mb-[14px] h-px bg-[var(--surface-line)]" />
          <h3 className="mb-[6px] text-[11px] font-medium text-[var(--surface-fg-muted)]">
            {t('share.onThisBoard')}
          </h3>
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
        {more && props.embed && <EmbedSection {...props.embed} />}
      </div>

      {props.error && (
        <p role="alert" className="px-[20px] pb-[16px] text-[11px] text-[var(--surface-danger)]">
          {props.error}
        </p>
      )}
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

      <footer className="flex shrink-0 items-center justify-end gap-[8px] px-[20px] pt-[16px] pb-[18px]"></footer>
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
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-[12px]">
      {live && (
        <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-[#22c55e]" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <p className="text-[12.5px] font-medium first-letter:uppercase">{title}</p>
        {hint && <p className="text-[11.5px] text-[var(--surface-fg-muted)]">{hint}</p>}
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
  onStart,
  onMenuOpenChange,
  menuContainer,
  busy,
}: ShareSessionPanelProps) {
  const t = useT();
  const { label } = PERMISSIONS[role];
  return (
    <div className="flex flex-col gap-[16px]">
      <div className={HERO}>
        <HeroTop live={false} title={t('share.notSharing')} hint={t('share.notSharingHint')} />
        <SettingsButton
          variant="primary"
          className="h-[36px] self-start px-[16px] text-[13px]"
          onClick={onStart}
          disabled={busy}
          data-testid="share-start"
        >
          {busy ? t('share.starting') : t('share.start')}
        </SettingsButton>
      </div>
      <div className="flex items-center justify-between gap-[12px]">
        <p id="share-joiners" className="text-[12.5px] font-medium">
          {t('share.peopleWhoJoinCan')}
        </p>
        <InlineDropdownMenu onOpenChange={onMenuOpenChange}>
          <InlineDropdownMenuTrigger asChild>
            <SettingsButton
              aria-labelledby="share-joiners"
              disabled={busy}
              data-testid="share-role-joiners"
              className="gap-[6px] pr-[7px] pl-[9px] data-[state=open]:bg-[var(--surface-wash-hover)] [&[data-state=open]>svg:last-child]:rotate-180"
            >
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
            container={menuContainer}
            className="min-w-56"
          >
            <InlineDropdownMenuRadioGroup
              value={role}
              onValueChange={(value) => onRoleChange(value as 'viewer' | 'editor')}
            >
              {(['viewer', 'editor'] as const).map((key) => {
                const Option = PERMISSIONS[key];
                return (
                  <InlineDropdownMenuChoiceItem
                    key={key}
                    value={key}
                    title={t(Option.hint)}
                    data-testid={`share-role-${key}`}
                  >
                    {t(Option.label)}
                  </InlineDropdownMenuChoiceItem>
                );
              })}
            </InlineDropdownMenuRadioGroup>
          </InlineDropdownMenuContent>
        </InlineDropdownMenu>
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
  onMenuOpenChange,
  menuContainer,
  qr,
  hereCount = 0,
}: ShareSessionPanelProps & { session: LiveSession }) {
  const t = useT();

  return (
    <div className="flex flex-col gap-[16px]">
      <div
        className="flex flex-col gap-[14px] rounded-[12px] bg-[var(--surface-accent-wash)] p-[16px]"
        aria-live="polite"
      >
        <HeroTop
          live
          title={
            hereCount > 0
              ? `${t('share.sharingIsLive')} · ${t('share.hereNowCount', { count: hereCount })}`
              : t('share.sharingIsLive')
          }
          hint={
            session.expiresAt
              ? t('share.joinUntil', { date: formatDate(session.expiresAt) })
              : undefined
          }
          action={
            <SettingsButton
              className="text-[var(--surface-danger)]"
              onClick={onStop}
              disabled={busy}
              data-testid="share-stop"
            >
              {busy ? t('share.stopping') : t('share.stop')}
            </SettingsButton>
          }
        />
        <div className="flex items-center gap-[14px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
            <div className="flex gap-[6px]">
              <label className="flex h-[36px] min-w-0 flex-1 items-center gap-[8px] rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface-input)] px-[12px]">
                <Link2
                  className="size-[14px] shrink-0 text-[var(--surface-fg-muted)]"
                  aria-hidden="true"
                />
                <input
                  readOnly
                  value={url ?? ''}
                  placeholder={t('share.linkElsewhere')}
                  aria-label={t('share.sessionLink')}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
                />
              </label>
              <SettingsButton
                variant="primary"
                className="h-[36px] px-[16px] text-[13px]"
                onClick={onCopy}
                disabled={!url}
                data-testid="share-copy"
              >
                {copied ? t('links.copied') : t('links.copy')}
              </SettingsButton>
              {url && qr && (
                <InlineDropdownMenu onOpenChange={onMenuOpenChange}>
                  <InlineDropdownMenuTrigger asChild>
                    <SettingsButton
                      aria-label={t('share.qrLabel')}
                      title={t('share.scanHint')}
                      data-testid="share-qr-toggle"
                      className="h-[36px] w-[36px] px-0 data-[state=open]:bg-[var(--surface-wash-hover)]"
                    >
                      <QrCode className="size-[14px]" aria-hidden="true" />
                    </SettingsButton>
                  </InlineDropdownMenuTrigger>
                  <InlineDropdownMenuContent
                    align="end"
                    sideOffset={6}
                    collisionPadding={8}
                    container={menuContainer}
                    aria-label={t('share.qrLabel')}
                    className="w-auto min-w-0 p-2"
                  >
                    {qr}
                  </InlineDropdownMenuContent>
                </InlineDropdownMenu>
              )}
            </div>
            {!url && (
              <p className="text-[11.5px] text-[var(--surface-fg-muted)]">
                {t('share.restartForLink')}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-[12px]">
        <p className="text-[12.5px] font-medium">{t('share.peopleWhoJoinCan')}</p>
        <SettingsButton
          disabled
          title={t('share.setAtStart')}
          className="gap-[6px] pr-[7px] pl-[9px]"
        >
          {t(PERMISSIONS[session.role].label)}
          <ChevronDown className="size-[12px]" aria-hidden="true" />
        </SettingsButton>
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
          on={session.allowGuests}
          onChange={() => {}}
          disabled
        />
      </div>
    </div>
  );
}

/**
 * Showing the board on another site: a switch, and while it is on, the code
 * to paste there. Apart from the session, since it is not a way in — whoever
 * reads the page sees the board's shapes, and nothing they could join.
 */
function EmbedSection({ on, code, busy, copied, onChange, onCopy }: EmbedSettings) {
  const t = useT();
  return (
    <section
      aria-label={t('share.embedTitle')}
      data-testid="share-embed"
      className="flex shrink-0 flex-col gap-[10px] border-t border-[var(--surface-line)] pt-[14px]"
    >
      <div className="flex items-center gap-[12px]">
        <span
          aria-hidden="true"
          className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-wash)] text-[var(--surface-fg-muted)]"
        >
          <Code className="size-[14px]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
          <p className="text-[12.5px] font-medium">{t('share.embedTitle')}</p>
          <p className="text-[11.5px] text-[var(--surface-fg-muted)]">{t('share.embedHint')}</p>
        </div>
        <Toggle
          label={t('share.embedLabel')}
          on={on === true}
          onChange={onChange}
          disabled={busy || on === null}
        />
      </div>
      {on && (
        <div className="flex flex-col gap-[6px]">
          <div className="flex gap-[6px]">
            <input
              readOnly
              value={code ?? ''}
              aria-label={t('share.embedCode')}
              onFocus={(event) => event.currentTarget.select()}
              data-testid="share-embed-code"
              className={cn(INPUT, 'min-w-0 flex-1 font-mono text-[11.5px]')}
            />
            <SettingsButton
              variant="primary"
              className="h-[36px] px-[16px] text-[13px]"
              onClick={onCopy}
              disabled={!code}
              data-testid="share-embed-copy"
            >
              {copied ? (
                <Check className="size-[14px]" aria-hidden="true" />
              ) : (
                <Copy className="size-[14px]" aria-hidden="true" />
              )}
              {copied ? t('links.copied') : t('export.copy')}
            </SettingsButton>
          </div>
          <p className="text-[11px] text-[var(--surface-fg-faint)]">{t('share.embedOffHint')}</p>
        </div>
      )}
    </section>
  );
}

const AVATAR_COLOURS = ['bg-[#135dfc]', 'bg-[#a855f7]', 'bg-[#16a34a]', 'bg-[#f97316]'];

/** Each person's letters on a colour of their own, the same every time. */
function avatarColour(id: string): string {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return AVATAR_COLOURS[sum % AVATAR_COLOURS.length]!;
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
          className="flex shrink-0 items-center gap-[10px] py-[6px]"
        >
          <PersonAvatar
            url={person.photo}
            name={person.name}
            className={cn(
              'size-[26px] text-[10px] font-semibold text-white',
              avatarColour(person.id),
            )}
          />
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
            <span className="shrink-0 text-[11px] text-[var(--surface-fg-muted)]">
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
  const { label } = PERMISSIONS[role];
  return (
    <InlineDropdownMenu onOpenChange={onOpenChange}>
      <InlineDropdownMenuTrigger asChild>
        <SettingsButton
          aria-label={t('share.roleFor', { name: person.name })}
          data-testid={`share-role-menu-${person.id}`}
          className="gap-[6px] pr-[7px] pl-[9px] data-[state=open]:bg-[var(--surface-wash-hover)] [&[data-state=open]>svg:last-child]:rotate-180"
        >
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
            return (
              <InlineDropdownMenuChoiceItem key={key} value={key}>
                {t(PERMISSIONS[key].label)}
              </InlineDropdownMenuChoiceItem>
            );
          })}
        </InlineDropdownMenuRadioGroup>
        <InlineDropdownMenuSeparator />
        <InlineDropdownMenuItem onSelect={() => onChange(REMOVE)} className={menuDangerRowClasses}>
          {t('share.removeFromBoard')}
        </InlineDropdownMenuItem>
      </InlineDropdownMenuContent>
    </InlineDropdownMenu>
  );
}

/** The clock, once a second, for as long as something is live on screen. */

function formatDate(iso: string): string {
  return formatShortDate(new Date(iso));
}
