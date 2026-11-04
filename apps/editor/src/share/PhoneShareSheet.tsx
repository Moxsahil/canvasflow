import { useState, type ReactNode } from 'react';
import { useT, type TranslationKey } from '../i18n';
import { Icon } from '../settings/phone/icons';
import {
  Avatar,
  ConfirmSheet,
  Group,
  Hint,
  Label,
  Row,
  SwitchRow,
  T,
} from '../settings/phone/shell';
import { ShortSheet } from '../settings/phone/ShortSheet';
import type { SurfaceTheme } from '../ui/surface-palette';
import type { ShareRole } from './share-api';
import type { HerePerson, SharePerson, ShareSessionPanelProps } from './ShareSession';

const ROLE_LABELS: Record<ShareRole, TranslationKey> = {
  editor: 'access.canEdit',
  viewer: 'access.canView',
};
const ROLE_HINTS: Record<ShareRole, TranslationKey> = {
  editor: 'share.canEditHint',
  viewer: 'share.canViewHint',
};
const WORKSPACE_ROLE_LABELS: Record<'owner' | 'admin' | 'member', TranslationKey> = {
  owner: 'share.workspaceOwner',
  admin: 'share.workspaceAdmin',
  member: 'share.workspaceMember',
};
const ROLES: readonly ShareRole[] = ['editor', 'viewer'];

type Page = 'root' | 'qr' | 'embed' | `person:${string}`;

/**
 * Share on a phone: the same session, link and people as the desktop's
 * window, set out as a sheet from the foot of the screen. The link leads,
 * then what people who join may do, then who is on the board; a person's
 * role, the QR code and embedding each open a page of their own.
 */
export function PhoneShareSheet(
  props: ShareSessionPanelProps & { theme: SurfaceTheme; url: string | null },
) {
  const t = useT();
  const { boardName, session, theme, onClose } = props;
  const [page, setPage] = useState<Page>('root');
  const [asking, setAsking] = useState<'stop' | { remove: SharePerson } | null>(null);
  const back = page === 'root' ? undefined : () => setPage('root');

  let title = t('share.button');
  let body: ReactNode;

  if (page === 'qr') {
    title = t('ps.share.scanTitle');
    body = (
      <>
        <div className="qr">{props.qr}</div>
        <Hint>{t('share.scanHint')}</Hint>
      </>
    );
  } else if (page === 'embed' && props.embed) {
    const embed = props.embed;
    title = t('share.embedTitle');
    body = (
      <>
        <Group noIcons>
          <SwitchRow
            label={t('share.embedLabel')}
            hint={t('share.embedHint')}
            on={embed.on === true}
            onToggle={embed.on === null || embed.busy ? undefined : () => embed.onChange(!embed.on)}
          />
        </Group>
        {embed.on && embed.code && (
          <>
            <Label>{t('share.embedCode')}</Label>
            <div className="st-card link-box">
              <code>{embed.code}</code>
            </div>
            <button
              type="button"
              className="st-btn"
              style={{ marginTop: 10 }}
              onClick={embed.onCopy}
            >
              {embed.copied ? t('links.copied') : t('links.copy')}
            </button>
            <Hint>{t('share.embedOffHint')}</Hint>
          </>
        )}
      </>
    );
  } else if (page.startsWith('person:')) {
    const person = props.people.find((candidate) => candidate.id === page.slice(7));
    title = person ? person.name || person.email : t('share.button');
    body = person ? (
      <>
        <div
          className="st-g noi"
          role="radiogroup"
          aria-label={t('share.roleFor', { name: title })}
        >
          {ROLES.map((role) => (
            <button
              key={role}
              type="button"
              className="st-r"
              role="radio"
              aria-checked={person.role === role}
              disabled={props.busy}
              onClick={() => person.role !== role && props.onMemberRole(person.id, role)}
              data-testid={`ps-share-role-${role}`}
            >
              <span className="t">
                {t(ROLE_LABELS[role])}
                <small>{t(ROLE_HINTS[role])}</small>
              </span>
              {person.role === role && (
                <span className="end st-chk">
                  <Icon name="check" size={20} />
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="st-g" style={{ marginTop: 16 }}>
          <Row red chevron={false} onClick={() => setAsking({ remove: person })}>
            {t('share.removeFromBoard')}
          </Row>
        </div>
      </>
    ) : null;
  } else {
    body = <ShareRoot {...props} onPage={setPage} onStop={() => setAsking('stop')} />;
  }

  return (
    <ShortSheet
      title={title}
      sub={page === 'root' ? boardName : undefined}
      theme={theme}
      page={page}
      onBack={back}
      onClose={onClose}
      testId="phone-share"
    >
      {body}
      {props.error && <Hint error>{props.error}</Hint>}
      {asking === 'stop' && session && (
        <ConfirmSheet
          icon="users"
          title={t('ps.share.stopTitle')}
          body={t('ps.share.stopBody')}
          label={t('share.stop')}
          danger
          onClose={() => setAsking(null)}
          onConfirm={() => {
            setAsking(null);
            props.onStop();
          }}
        />
      )}
      {asking && asking !== 'stop' && (
        <ConfirmSheet
          icon="userminus"
          title={t('ps.share.removeTitle', { name: asking.remove.name || asking.remove.email })}
          body={t('ps.share.removeBody')}
          label={t('library.remove')}
          danger
          onClose={() => setAsking(null)}
          onConfirm={() => {
            const { id } = asking.remove;
            setAsking(null);
            setPage('root');
            props.onRemoveMember(id);
          }}
        />
      )}
    </ShortSheet>
  );
}

function ShareRoot(
  props: ShareSessionPanelProps & { onPage: (page: Page) => void; onStop: () => void },
) {
  const t = useT();
  const { session, url, busy, hereCount = 0 } = props;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const role = session?.role ?? props.role;
  const allowGuests = session?.allowGuests ?? props.allowGuests;

  return (
    <>
      <Label>{t('ps.share.link')}</Label>
      {session ? (
        <div className="st-card" style={{ padding: '14px 16px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="live-on">
              {hereCount > 0 ? t('ps.share.liveHere', { count: hereCount }) : t('ps.share.live')}
            </span>
            <button
              type="button"
              className="st-link danger"
              onClick={props.onStop}
              disabled={busy}
              data-testid="ps-share-stop"
            >
              {busy ? t('share.stopping') : t('ps.share.stop')}
            </button>
          </div>
          <div className="st-card link-box">
            <code>{url ?? t('share.linkElsewhere')}</code>
          </div>
          {url ? (
            <div className={canShare ? 'link-acts' : 'link-acts two'}>
              <button
                type="button"
                className="st-btn"
                onClick={props.onCopy}
                data-testid="ps-share-copy"
              >
                <Icon name="link" size={18} />
                {props.copied ? t('links.copied') : t('ps.share.copyLink')}
              </button>
              {canShare && (
                <button
                  type="button"
                  className="st-btn ghost"
                  onClick={() =>
                    void navigator.share({ title: props.boardName, url }).catch(() => {})
                  }
                >
                  <Icon name="share" size={18} />
                  {t('ps.share.shareVia')}
                </button>
              )}
              {props.qr && (
                <button
                  type="button"
                  className="st-btn ghost"
                  aria-label={t('share.qrLabel')}
                  onClick={() => props.onPage('qr')}
                  data-testid="ps-share-qr"
                >
                  <Icon name="qr" size={18} />
                </button>
              )}
            </div>
          ) : (
            <Hint>{t('share.restartForLink')}</Hint>
          )}
          {session.expiresAt && (
            <Hint>
              {t('share.joinUntil', { date: new Date(session.expiresAt).toLocaleDateString() })}
            </Hint>
          )}
        </div>
      ) : (
        <div className="st-card live-card">
          <span className="pulse">
            <Icon name="users" size={26} />
          </span>
          <b>{t('share.notSharing')}</b>
          <p>{t('share.notSharingHint')}</p>
          <button
            type="button"
            className="st-btn"
            onClick={props.onStart}
            disabled={busy}
            data-testid="ps-share-start"
          >
            {busy ? t('share.starting') : t('ps.share.start')}
          </button>
        </div>
      )}

      <Label>{t('share.peopleWhoJoinCan')}</Label>
      <div className="st-seg" role="radiogroup" aria-label={t('share.peopleWhoJoinCan')}>
        {ROLES.map((option) => (
          <button
            key={option}
            type="button"
            className={role === option ? 'on' : undefined}
            role="radio"
            aria-checked={role === option}
            // A live session's terms were fixed when it started.
            disabled={Boolean(session) || busy}
            onClick={() => props.onRoleChange(option)}
            data-testid={`ps-share-join-${option}`}
          >
            {t(ROLE_LABELS[option])}
          </button>
        ))}
      </div>
      {session && <Hint>{t('share.setAtStart')}</Hint>}
      <Group noIcons>
        <SwitchRow
          label={t('share.allowGuests')}
          hint={t('share.allowGuestsHint')}
          on={allowGuests}
          onToggle={session || busy ? undefined : () => props.onAllowGuestsChange(!allowGuests)}
        />
      </Group>

      <Label>{t('ps.share.onBoard', { count: props.people.length })}</Label>
      <div className="st-g" style={{ '--hl': '64px' } as React.CSSProperties}>
        {props.people.map((person) => {
          const manageable = !person.isOwner && !person.workspaceRole && !person.you;
          const end = person.isOwner
            ? t('role.owner')
            : person.workspaceRole
              ? t(WORKSPACE_ROLE_LABELS[person.workspaceRole])
              : t(ROLE_LABELS[person.role as ShareRole]);
          return (
            <Row
              key={person.id}
              chevron={manageable}
              onClick={manageable ? () => props.onPage(`person:${person.id}`) : undefined}
              end={<span className="role-pill">{end}</span>}
              testId={`ps-share-person-${person.id}`}
            >
              <Avatar name={person.name || person.email} url={person.photo} size="s" />
              <T>
                {person.you ? `${person.name} ${t('share.you')}` : person.name || person.email}
                <small>
                  {person.isGuest ? t('share.noAccount') : person.email}
                  {person.justJoined ? ` · ${t('share.joined')}` : ''}
                </small>
              </T>
            </Row>
          );
        })}
      </div>
      {props.guestMayReturn && props.onResetLink && (
        <Hint>
          {t('share.guestMayReturn', { name: props.guestMayReturn })}{' '}
          <button type="button" className="st-link" onClick={props.onResetLink} disabled={busy}>
            {t('share.resetLink')}
          </button>
        </Hint>
      )}
      {props.removed && props.removed.length > 0 && props.onAddBack && (
        <>
          <Label>{t('share.removedCount', { count: props.removed.length })}</Label>
          <Group>
            {props.removed.map((person) => (
              <Row
                key={person.id}
                chevron={false}
                onClick={() => props.onAddBack?.(person.id)}
                end={t('share.addBack')}
              >
                <Avatar name={person.name || person.email} url={null} size="s" />
                <T>
                  {person.name || person.email}
                  <small>{t(ROLE_LABELS[person.role])}</small>
                </T>
              </Row>
            ))}
          </Group>
        </>
      )}
      {props.embed && (
        <div className="st-g" style={{ marginTop: 20 }}>
          <Row onClick={() => props.onPage('embed')} end={props.embed.on ? t('ps.on') : ''}>
            <T>{t('share.embedTitle')}</T>
          </Row>
        </div>
      )}
    </>
  );
}

/**
 * Share on a phone for someone who does not run the board's sharing: what
 * they may do, who may invite people, and who is here now.
 */
export function PhoneShareCollaboratorSheet({
  boardName,
  role,
  ownerName,
  here,
  theme,
  onClose,
}: {
  boardName: string;
  role: ShareRole | null;
  ownerName: string | null;
  here: HerePerson[];
  theme: SurfaceTheme;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <ShortSheet
      title={t('share.button')}
      sub={boardName}
      theme={theme}
      page="root"
      onClose={onClose}
      testId="phone-share"
    >
      <div className="st-card live-card">
        <span className="pulse">
          <Icon name={role === 'editor' ? 'check' : 'eye'} size={26} />
        </span>
        <b data-testid="share-your-access">
          {role === 'editor'
            ? t('share.youCanEdit')
            : role === 'viewer'
              ? t('share.youCanView')
              : t('share.youreOnThisBoard')}
        </b>
        <p>{t('share.onlyOwnerInvites', { owner: ownerName ?? t('share.theOwner') })}</p>
      </div>
      <Label>{t('share.hereNowCount', { count: here.length })}</Label>
      {here.length <= 1 ? (
        <Hint>{t('share.onlyYou')}</Hint>
      ) : (
        <div className="st-g" style={{ '--hl': '64px' } as React.CSSProperties}>
          {here.map((person) => (
            <Row
              key={person.id}
              chevron={false}
              end={
                person.isOwner ? <span className="role-pill">{t('role.owner')}</span> : undefined
              }
            >
              <Avatar name={person.name} url={person.photo} size="s" />
              <T>{person.you ? `${person.name} ${t('share.you')}` : person.name}</T>
            </Row>
          ))}
        </div>
      )}
    </ShortSheet>
  );
}
