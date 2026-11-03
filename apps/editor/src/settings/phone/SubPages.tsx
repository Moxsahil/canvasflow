import { useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_RULES,
  PLAN_NAMES,
  PLAN_PRICES,
  canManageMember,
  meetsPasswordRules,
  type MemberRole,
  type WorkspacePlan,
} from '@canvasflow/types';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { sessionResumeUrl } from '../../auth/token';
import { rich, t as translate, useT, type TranslationKey } from '../../i18n';
import {
  changeMemberRole,
  inviteToWorkspace,
  leaveWorkspace,
  offerOwnership,
  removeMember,
  resendInvite,
  revokeInvite,
  withdrawOwnershipOffer,
  type InvitableRole,
  type WorkspaceInvite,
  type WorkspaceMember,
} from '../../workspace/people-api';
import type { WorkspacePeopleState } from '../../workspace/useWorkspacePeople';
import { formatDay, formatRelative, formatStorageSize, providerNames } from '../account-format';
import {
  AccountDeletionError,
  fetchDeletionPreview,
  signInAgainUrl,
  type DeletionInput,
  type DeletionPreview,
} from '../account-deletion-api';
import { deletionStep, readyToDelete, rememberDeletionResume } from '../account-deletion';
import {
  changePassword,
  fetchAccountSecurity,
  sendPasswordSetupLink,
  signOutEverywhere,
  type AccountSecurity,
  type SessionSummary,
  type SignInProvider,
} from '../account-security-api';
import { GoogleMark } from '../provider-marks';
import { ROLE_LABELS } from '../WorkspaceDialogs';
import { Icon, Tile, type PhoneIconName } from './icons';
import {
  Avatar,
  ConfirmSheet,
  Cta,
  Group,
  Hint,
  Label,
  Row,
  SlotsContext,
  SwitchRow,
  T,
  type Page,
} from './shell';

/** What every sub-page may need of the sheet around it. */
export interface SubPageNav {
  go: (page: Page) => void;
  back: () => void;
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : translate('common.somethingWentWrongRetry');
}

/** Names a page whose title is a person, in the bar and the large heading both. */
function usePageTitle(title: string | null) {
  const { setTitle } = useContext(SlotsContext);
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);
}

// --- google -----------------------------------------------------------------

export function GooglePage({
  security,
  go,
}: {
  security: AccountSecurity | null;
} & Pick<SubPageNav, 'go'>) {
  const t = useT();
  if (!security) return <div className="st-empty">…</div>;
  const connected = security.providers.includes('google');
  return (
    <>
      <div className="st-hero">
        <span className="gmark">
          <GoogleMark />
        </span>
        <b>{providerNames(['google'])}</b>
        <span>{connected ? t('ps.google.connected') : t('connected.notConnected')}</span>
      </div>
      {connected ? (
        <>
          <Group noIcons>
            <Row chevron={false} end={security.email}>
              <T>{t('ps.google.account')}</T>
            </Row>
          </Group>
          <Hint>{t('ps.google.sees')}</Hint>
          <div className="st-g" style={{ marginTop: 20 }}>
            <Row red soon>
              <T>{t('ps.google.disconnect')}</T>
            </Row>
          </div>
          {!security.hasPassword && (
            <Hint>
              {t('ps.google.onlyWay')}{' '}
              <button type="button" className="st-link" onClick={() => go('password')}>
                {t('password.addTitle')}
              </button>
            </Hint>
          )}
        </>
      ) : (
        <>
          <Hint>{t('connected.howTo', { email: security.email })}</Hint>
          <Cta>
            <button
              type="button"
              className="st-btn"
              onClick={() => {
                window.location.href = signInAgainUrl('google');
              }}
              data-testid="ps-google-connect"
            >
              {t('ps.google.connect')}
            </button>
          </Cta>
        </>
      )}
    </>
  );
}

// --- password ---------------------------------------------------------------

const PASSWORD_RULE_KEYS: readonly TranslationKey[] = [
  'password.rule.length',
  'password.rule.capital',
  'password.rule.number',
  'password.rule.special',
];

const STRENGTH_COLOURS = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158'];
const STRENGTH_WORDS: readonly TranslationKey[] = [
  'ps.pw.weak',
  'ps.pw.fair',
  'ps.pw.good',
  'ps.pw.strong',
];

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  testId?: string;
}) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <div className="st-f">
      <span>{label}</span>
      <input
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        maxLength={autoComplete === 'new-password' ? PASSWORD_MAX_LENGTH : 200}
        placeholder="••••••••"
        aria-label={label}
        data-testid={testId}
      />
      <button
        type="button"
        className={cn('eye', shown && 'on')}
        onClick={() => setShown((was) => !was)}
        aria-pressed={shown}
        aria-label={
          shown
            ? t('password.hide', { label: label.toLowerCase() })
            : t('password.show', { label: label.toLowerCase() })
        }
      >
        <Icon name="eye" size={18} />
      </button>
    </div>
  );
}

function RuleLine({ label, met }: { label: string; met: boolean }) {
  return (
    <div className={cn('rule-i', met && 'ok')}>
      <span className="dot">
        <Icon name="check" size={11} />
      </span>
      {label}
    </div>
  );
}

export function PasswordPage({
  token,
  email,
  security,
  onChanged,
  back,
}: {
  token: string | null;
  email: string;
  security: AccountSecurity | null;
  onChanged: () => void;
} & Pick<SubPageNav, 'back'>) {
  const t = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [signInAgain, setSignInAgain] = useState(false);
  usePageTitle(security && !security.hasPassword ? t('password.addTitle') : null);

  if (!security) return <div className="st-empty">…</div>;

  // No password yet: the app asks the inbox to prove itself before one is set.
  if (!security.hasPassword) {
    const via = providerNames(security.providers) || t('password.yourProvider');
    const send = async () => {
      setBusy(true);
      setError(null);
      try {
        await sendPasswordSetupLink(token);
        setDone(t('password.checkEmailBody', { email: security.email, via }));
      } catch (caught) {
        setError(messageOf(caught));
      } finally {
        setBusy(false);
      }
    };
    return (
      <>
        <div className="st-lead">
          {done ?? t('password.addBody', { via, email: security.email })}
        </div>
        {error && <Hint error>{error}</Hint>}
        <Cta>
          {done ? (
            <button type="button" className="st-btn" onClick={back}>
              {t('common.done')}
            </button>
          ) : (
            <button type="button" className="st-btn" onClick={() => void send()} disabled={busy}>
              {busy ? t('common.sending') : t('password.emailLink')}
            </button>
          )}
        </Cta>
      </>
    );
  }

  const met = PASSWORD_RULES.map((rule) => rule.test(next));
  const score = met.filter(Boolean).length;
  const matches = next.length > 0 && next === confirm;
  const ready = current.length > 0 && meetsPasswordRules(next) && matches && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const signedOut = await changePassword(token, {
        currentPassword: current,
        newPassword: next,
        signOutOtherDevices: true,
      });
      setSignInAgain(signedOut === 'everywhere');
      setDone(
        signedOut === 'other-devices'
          ? t('password.changedOthers')
          : signedOut === 'everywhere'
            ? t('password.changedEverywhere')
            : t('password.changedNone'),
      );
      onChanged();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <div className="d-hero">
          <span className="d-ic" style={{ background: 'rgba(48,209,88,.14)', color: '#30d158' }}>
            <Icon name="check" size={30} />
          </span>
          <b>{t('password.changed')}</b>
          <span>{done}</span>
        </div>
        <Cta>
          <button
            type="button"
            className="st-btn"
            onClick={
              signInAgain
                ? () => {
                    window.location.href = sessionResumeUrl();
                  }
                : back
            }
          >
            {signInAgain ? t('revoked.signIn') : t('common.done')}
          </button>
        </Cta>
      </>
    );
  }

  return (
    <>
      <div className="st-lead">{t('ps.pw.lead')}</div>
      {/* Tells a password manager which saved entry this replaces. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <Group noIcons>
        <PasswordInput
          label={t('password.current')}
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          testId="ps-pw-current"
        />
        <PasswordInput
          label={t('password.new')}
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          testId="ps-pw-new"
        />
        <PasswordInput
          label={t('password.confirm')}
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          testId="ps-pw-confirm"
        />
      </Group>
      <button
        type="button"
        className="st-link"
        style={{ margin: '8px 6px 0' }}
        onClick={() => window.location.assign(new URL('/forgot-password', env.VITE_WEB_URL))}
      >
        {t('ps.pw.forgot')}
      </button>
      <div className="strength" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <i
            key={index}
            style={index < score ? { background: STRENGTH_COLOURS[score - 1] } : undefined}
          />
        ))}
      </div>
      <Hint>
        {score === 0 ? t('ps.pw.strengthHint') : t(STRENGTH_WORDS[score - 1] ?? 'ps.pw.weak')}
      </Hint>
      <div className="rules" aria-live="polite">
        {PASSWORD_RULES.map((rule, index) => (
          <RuleLine
            key={rule.label}
            label={t(PASSWORD_RULE_KEYS[index] ?? 'password.rule.length')}
            met={met[index] ?? false}
          />
        ))}
        <RuleLine label={t('password.match')} met={matches} />
      </div>
      {error && <Hint error>{error}</Hint>}
      <Cta>
        <button
          type="button"
          className="st-btn"
          onClick={() => void submit()}
          disabled={!ready}
          data-testid="ps-pw-save"
        >
          {busy ? t('password.changing') : t('password.changeTitle')}
        </button>
      </Cta>
    </>
  );
}

// --- sessions ---------------------------------------------------------------

function deviceIcon(device: string | null): PhoneIconName {
  const name = device ?? '';
  if (/ipad|tablet/i.test(name)) return 'tablet';
  if (/iphone|ios|android|mobile|phone/i.test(name)) return 'phone';
  if (/windows|linux/i.test(name)) return 'monitor';
  return 'laptop';
}

function SessionRow({ session }: { session: SessionSummary }) {
  const t = useT();
  return (
    <div className="st-r">
      <span className="dev-ic">
        <Icon name={deviceIcon(session.device)} size={21} />
      </span>
      <span className="t">
        {session.device ?? t('sessions.unknownBrowser')}
        <small>{session.location ?? t('sessions.unknownLocation')}</small>
        <small className={cn(session.current && 'now')}>
          {session.current ? t('ps.sess.activeNow') : formatRelative(session.lastActiveAt)}
        </small>
      </span>
      {session.current && (
        <span className="end">
          <span className="role-pill">{t('sessions.thisDevice')}</span>
        </span>
      )}
    </div>
  );
}

export function SessionsPage({
  token,
  security,
}: {
  token: string | null;
  security: AccountSecurity | null;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  if (!security) return <div className="st-empty">…</div>;
  const current = security.sessions.filter((session) => session.current);
  const others = security.sessions.filter((session) => !session.current);
  const rows = { '--hl': '70px' } as CSSProperties;

  return (
    <>
      <div className="st-lead">{t('sessions.description')}</div>
      <Label>{t('sessions.thisDevice')}</Label>
      <div className="st-g" style={rows}>
        {current.map((session) => (
          <SessionRow key={session.id} session={session} />
        ))}
      </div>
      {others.length > 0 && (
        <div className="st-g" style={{ marginTop: 12 }}>
          <Row soon>
            <Tile name="userminus" color="#ff3b30" />
            <T>{t('ps.sess.signOutOthers')}</T>
          </Row>
        </div>
      )}
      <Label>
        {others.length > 0
          ? t('ps.sess.others', { count: others.length })
          : t('ps.sess.othersNone')}
      </Label>
      {others.length > 0 ? (
        <div className="st-g" style={rows}>
          {others.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <div className="st-card st-empty" style={{ padding: '26px 16px' }}>
          <Icon name="shield" size={22} />
          <br />
          {t('ps.sess.onlyHere')}
        </div>
      )}
      <Hint>{t('ps.sess.dontRecognise')}</Hint>
      <div className="st-g" style={{ marginTop: 20 }}>
        <Row red chevron={false} onClick={() => setAsking(true)} testId="ps-sign-out-everywhere">
          {t('settings.row.sign-out-everywhere')}
        </Row>
      </div>
      {asking && (
        <ConfirmSheet
          icon="userminus"
          title={t('signOutAll.title')}
          body={t('signOutAll.body', {
            devices:
              security.sessions.length > 1
                ? t('signOutAll.allDevices', { count: security.sessions.length })
                : t('signOutAll.thisDevice'),
          })}
          label={t('account.signOutAll')}
          danger
          onClose={() => setAsking(false)}
          onConfirm={async () => {
            await signOutEverywhere(token);
            window.location.href = sessionResumeUrl();
          }}
        />
      )}
    </>
  );
}

// --- delete account ---------------------------------------------------------

export function DeleteAccountPage({
  token,
  userId,
  fallbackEmail,
  storageBytes,
  deleteAccount,
  go,
  back,
  membersHere,
  workspaceId,
}: {
  token: string | null;
  userId: string | null;
  fallbackEmail: string;
  storageBytes: number | null;
  deleteAccount: (input: DeletionInput) => Promise<void>;
  /** Someone in the open workspace other than oneself, to hand it to. */
  membersHere: WorkspaceMember[];
  workspaceId: string | null;
} & SubPageNav) {
  const t = useT();
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lapsed, setLapsed] = useState(false);
  const [providers, setProviders] = useState<SignInProvider[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetchDeletionPreview(token).then(
      (loaded) => {
        if (!cancelled) setPreview(loaded);
      },
      (caught: unknown) => {
        if (!cancelled) setLoadError(messageOf(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const step = preview ? (lapsed ? 'sign-in-again' : deletionStep(preview)) : null;

  useEffect(() => {
    if (step !== 'sign-in-again' || providers !== null) return;
    let cancelled = false;
    fetchAccountSecurity(token).then(
      (security) => {
        if (!cancelled) setProviders(security.providers);
      },
      () => {
        if (!cancelled) setProviders([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [step, providers, token]);

  const email = preview?.email ?? fallbackEmail;
  const ready =
    preview !== null &&
    step !== null &&
    readyToDelete({ step, typed, email: preview.email, password, busy });
  const days = preview?.graceDays ?? ACCOUNT_DELETION_GRACE_DAYS;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount({
        confirmEmail: typed,
        ...(step === 'password' ? { currentPassword: password } : {}),
      });
    } catch (caught) {
      if (caught instanceof AccountDeletionError && caught.code === 'recent-sign-in-required') {
        setLapsed(true);
      } else {
        setError(messageOf(caught));
      }
      setBusy(false);
    }
  };

  const heir = membersHere.find((member) => member.userId !== userId);
  const blocking = preview?.sharedWorkspaces ?? [];

  return (
    <>
      <div className="d-hero">
        <span className="d-ic">
          <Icon name="trash" size={30} />
        </span>
        <b>{t('deleteAccount.title')}</b>
        <span>{t('ps.del.grace', { count: days })}</span>
      </div>
      <div className="st-card" style={{ padding: 16 }}>
        <div className="card-t">{t('ps.del.what')}</div>
        <ul className="bul">
          {preview && (
            <li>
              <Icon name="x" size={18} />
              {t('ps.del.boards', { count: preview.ownedBoards })}
            </li>
          )}
          {storageBytes !== null && storageBytes > 0 && (
            <li>
              <Icon name="x" size={18} />
              {t('ps.del.files', { size: formatStorageSize(storageBytes) })}
            </li>
          )}
          <li>
            <Icon name="x" size={18} />
            {t('ps.del.profile')}
          </li>
        </ul>
        <div className="card-t" style={{ margin: '12px 0 0' }}>
          {t('ps.del.kept')}
        </div>
      </div>
      {preview?.paidPlans?.map((paid) => (
        <Hint key={paid.workspaceName}>
          {paid.endsAt
            ? t('deleteAccount.planEnds', {
                name: paid.workspaceName,
                plan: (PLAN_NAMES as Record<string, string>)[paid.plan] ?? paid.plan,
                date: formatDay(paid.endsAt),
              })
            : t('deleteAccount.planEndsNoDate', {
                name: paid.workspaceName,
                plan: (PLAN_NAMES as Record<string, string>)[paid.plan] ?? paid.plan,
              })}
        </Hint>
      ))}
      {blocking.map((workspace) => (
        <div className="warn-card" key={workspace.id}>
          <b>{t('ps.del.needsOwner', { name: workspace.name })}</b>
          {t('ps.del.needsOwnerBody')}
          {workspace.id === workspaceId && heir && (
            <>
              <br />
              <button type="button" className="st-link" onClick={() => go(`member:${heir.userId}`)}>
                {t('ps.del.chooseOwner')} <Icon name="chevright" size={14} />
              </button>
            </>
          )}
        </div>
      ))}

      {step === 'sign-in-again' ? (
        <>
          <Hint>{t('deleteAccount.signInAgain')}</Hint>
          {providers === null ? (
            <Hint>{t('deleteAccount.checking')}</Hint>
          ) : providers.length === 0 ? (
            <Hint error>{t('deleteAccount.checkFailed')}</Hint>
          ) : (
            <Cta>
              {providers.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  className="st-btn"
                  onClick={() => {
                    if (userId) rememberDeletionResume(userId);
                    window.location.href = signInAgainUrl(provider);
                  }}
                >
                  {t('deleteAccount.continueWith', { provider: providerNames([provider]) })}
                </button>
              ))}
              <button type="button" className="st-btn ghost" onClick={back}>
                {t('ps.del.keep')}
              </button>
            </Cta>
          )}
        </>
      ) : step !== 'blocked' ? (
        <>
          <Label>
            {email
              ? rich(t('delete.typeToConfirm'), {
                  name: <b style={{ color: 'var(--s-fg)' }}>{email}</b>,
                })
              : t('deleteAccount.typeEmail')}
          </Label>
          <Group noIcons>
            <div className="st-f" style={{ paddingRight: 16 }}>
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={email}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                aria-label={t('deleteAccount.typeEmailLabel')}
                data-testid="ps-del-confirm"
              />
            </div>
            {step === 'password' && (
              <PasswordInput
                label={t('settings.row.password')}
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
            )}
          </Group>
          {step === 'recent' && <Hint>{t('deleteAccount.recent')}</Hint>}
        </>
      ) : null}
      {loadError && !preview && (
        <Hint error>
          {loadError}{' '}
          <button type="button" className="st-link" onClick={() => setAttempt((n) => n + 1)}>
            {t('common.tryAgain')}
          </button>
        </Hint>
      )}
      {error && <Hint error>{error}</Hint>}
      {step !== 'sign-in-again' && (
        <Cta>
          <button
            type="button"
            className="st-btn red"
            onClick={() => void submit()}
            disabled={!ready}
            data-testid="ps-del-go"
          >
            {busy ? t('common.deleting') : t('ps.del.go')}
          </button>
          <button type="button" className="st-btn ghost" onClick={back}>
            {t('ps.del.keep')}
          </button>
        </Cta>
      )}
    </>
  );
}

// --- workspace: people ------------------------------------------------------

const ROLE_HINTS: Record<InvitableRole, TranslationKey> = {
  admin: 'ps.role.adminHint',
  member: 'ps.role.memberHint',
};

const INVITABLE: readonly InvitableRole[] = ['admin', 'member'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface WorkspaceRef {
  id: string;
  name: string;
  plan: WorkspacePlan;
}

export function InvitePage({
  workspace,
  people,
  go,
}: {
  workspace: WorkspaceRef;
  people: WorkspacePeopleState;
} & Pick<SubPageNav, 'go'>) {
  const t = useT();
  const [chips, setChips] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [role, setRole] = useState<InvitableRole>('member');
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const members = people.status === 'ready' ? people.members : [];
  const invites = people.status === 'ready' ? people.invites : [];

  const add = (raw: string) => {
    const parts = raw
      .split(/[,\s]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    let bad: string | null = null;
    let left = '';
    const next = [...chips];
    for (const address of parts) {
      if (!EMAIL_RE.test(address)) {
        bad = t('ps.inv.notEmail', { email: address });
        left = address;
      } else if (members.some((member) => member.email?.toLowerCase() === address)) {
        bad = t('ps.inv.already', { email: address });
      } else if (invites.some((invite) => invite.email.toLowerCase() === address)) {
        bad = t('ps.inv.alreadyInvited', { email: address });
      } else if (!next.includes(address)) {
        next.push(address);
      }
    }
    setChips(next);
    setDraft(left);
    setProblem(bad);
    if (bad) setShake((n) => n + 1);
    input.current?.focus();
  };

  const send = async () => {
    const all = draft.trim() ? [...chips] : chips;
    if (draft.trim()) {
      add(draft);
      return;
    }
    if (all.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    const failed: string[] = [];
    let sent = 0;
    let lastError = '';
    for (const address of all) {
      try {
        const result = await inviteToWorkspace(workspace.id, address, role);
        if (result.emailSent) sent += 1;
        else {
          failed.push(address);
          lastError = t('members.emailFailed', { email: address });
        }
      } catch (caught) {
        failed.push(address);
        lastError = messageOf(caught);
      }
    }
    setBusy(false);
    setChips(failed);
    setNotice(
      failed.length > 0
        ? { text: lastError, error: true }
        : { text: t('ps.inv.sent', { count: sent }), error: false },
    );
  };

  const roleWord = t(ROLE_LABELS[role]).toLowerCase();

  return (
    <>
      <div className="st-lead">{t('ps.inv.lead', { name: workspace.name })}</div>
      <div
        // Two names for one shake, so each refusal starts it over.
        className={cn('st-card inv-box', shake > 0 && (shake % 2 ? 'shake' : 'shake-again'))}
        onClick={() => input.current?.focus()}
      >
        {chips.map((chip) => (
          <span className="chip-i" key={chip}>
            <span>{chip}</span>
            <button
              type="button"
              onClick={() => setChips((was) => was.filter((c) => c !== chip))}
              aria-label={t('ps.inv.remove', { email: chip })}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        <input
          ref={input}
          // Text, not email: an email field drops a typed space before it can
          // be read as the end of an address.
          type="text"
          inputMode="email"
          value={draft}
          placeholder={chips.length ? t('ps.inv.another') : 'name@company.com'}
          autoCapitalize="none"
          autoComplete="off"
          aria-label={t('ps.inv.addresses')}
          onChange={(event) => {
            const value = event.target.value;
            setProblem(null);
            if (/[,\s]/.test(value)) add(value);
            else setDraft(value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (draft.trim()) add(draft);
            } else if (event.key === 'Backspace' && !draft && chips.length) {
              setChips((was) => was.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) add(draft);
          }}
          data-testid="ps-inv-input"
        />
      </div>
      <Hint error={problem !== null || notice?.error === true}>
        {problem ?? notice?.text ?? t('ps.inv.separate')}
      </Hint>
      {PLAN_PRICES[workspace.plan]?.per === 'member' && <Hint>{t('members.seatNote')}</Hint>}
      <Label>{t('members.inviteAs')}</Label>
      <div className="st-g noi" role="radiogroup" aria-label={t('members.inviteAs')}>
        {INVITABLE.map((option) => (
          <button
            key={option}
            type="button"
            className="st-r"
            role="radio"
            aria-checked={role === option}
            onClick={() => setRole(option)}
            data-testid={`ps-inv-role-${option}`}
          >
            <span className="t">
              {t(ROLE_LABELS[option])}
              <small>{t(ROLE_HINTS[option])}</small>
            </span>
            {role === option && (
              <span className="end st-chk">
                <Icon name="check" size={20} />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="st-g" style={{ marginTop: 16 }}>
        <Row soon>
          <Tile name="link" color="#0a84ff" />
          <T>
            {t('ps.inv.link')}
            <small>{t('ps.inv.linkHint')}</small>
          </T>
        </Row>
      </div>
      {invites.length > 0 && (
        <>
          <Label>{t('ps.inv.waiting', { count: invites.length })}</Label>
          <InvitationRows invites={invites} go={go} />
        </>
      )}
      <Cta>
        <button
          type="button"
          className="st-btn"
          onClick={() => void send()}
          disabled={busy || (chips.length === 0 && !draft.trim())}
          data-testid="ps-inv-send"
        >
          {busy
            ? t('common.sending')
            : chips.length
              ? t('ps.inv.sendAs', { count: chips.length, role: roleWord })
              : t('ps.inv.send')}
        </button>
      </Cta>
    </>
  );
}

export function InvitationRows({
  invites,
  go,
}: {
  invites: WorkspaceInvite[];
} & Pick<SubPageNav, 'go'>) {
  const t = useT();
  return (
    <div className="st-g" style={{ '--hl': '64px' } as CSSProperties}>
      {invites.map((invite) => (
        <Row
          key={invite.id}
          onClick={() => go(`invitation:${invite.id}`)}
          end={
            <span className="role-pill pend">
              {invite.expired ? t('members.expired') : t('ps.invited')}
            </span>
          }
          testId={`ps-invitation-${invite.id}`}
        >
          <span className="st-av s">
            <Icon name="mail" size={16} />
          </span>
          <T>
            {invite.email}
            <small>
              {t('ps.inv.invitedAs', { role: t(ROLE_LABELS[invite.role]).toLowerCase() })}
            </small>
          </T>
        </Row>
      ))}
    </div>
  );
}

type Asking = 'remove' | 'owner' | null;

export function MemberPage({
  workspace,
  people,
  memberId,
  userId,
  viewerRole,
  back,
}: {
  workspace: WorkspaceRef;
  people: WorkspacePeopleState;
  memberId: string;
  userId: string | null;
  viewerRole: MemberRole | null;
} & Pick<SubPageNav, 'back'>) {
  const t = useT();
  const [asking, setAsking] = useState<Asking>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const member =
    people.status === 'ready'
      ? people.members.find((candidate) => candidate.userId === memberId)
      : undefined;
  usePageTitle(member ? member.name : null);

  if (people.status !== 'ready') return <div className="st-empty">…</div>;
  if (!member) return <div className="st-empty">{t('ps.member.gone')}</div>;

  const me = member.userId === userId;
  const offered = people.ownershipOffer?.toUserId === member.userId;
  const manageable = !me && viewerRole !== null && canManageMember(viewerRole, member.role);
  const owner = people.members.find((candidate) => candidate.role === 'owner');
  const ownerWord =
    owner?.userId === userId ? t('workspacePane.you') : (owner?.name ?? t('share.theOwner'));

  const run = async (work: () => Promise<void>, said: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await work();
      setNotice({ text: said, error: false });
    } catch (caught) {
      setNotice({ text: messageOf(caught), error: true });
    } finally {
      setBusy(false);
    }
  };

  const hero = (
    <div className="st-hero" style={{ paddingTop: 0 }}>
      <Avatar name={member.name} url={member.photo} size="xl" />
      <b>{member.name}</b>
      <span>{member.email ?? (member.username ? `@${member.username}` : '')}</span>
      {offered && (
        <>
          <br />
          <span className="role-pill pend" style={{ display: 'inline-block', marginTop: 8 }}>
            {t('members.ownershipOffered')}
          </span>
        </>
      )}
    </div>
  );

  if (!manageable) {
    return (
      <>
        {hero}
        <Group noIcons>
          <Row chevron={false} end={t(ROLE_LABELS[member.role])}>
            <T>{t('settings.row.role')}</T>
          </Row>
        </Group>
        {me && (
          <Hint>{member.role === 'owner' ? t('ps.member.youOwner') : t('ps.member.youOther')}</Hint>
        )}
      </>
    );
  }

  return (
    <>
      {hero}
      <Label>{t('settings.row.role')}</Label>
      <div className="st-g noi" role="radiogroup" aria-label={t('settings.row.role')}>
        {INVITABLE.map((option) => (
          <button
            key={option}
            type="button"
            className="st-r"
            role="radio"
            aria-checked={member.role === option}
            disabled={busy}
            onClick={() => {
              if (member.role === option) return;
              void run(
                () => changeMemberRole(workspace.id, member.userId, option),
                option === 'admin'
                  ? t('members.nowAdmin', { name: member.name })
                  : t('members.nowMember', { name: member.name }),
              );
            }}
            data-testid={`ps-member-role-${option}`}
          >
            <span className="t">
              {t(ROLE_LABELS[option])}
              <small>{t(ROLE_HINTS[option])}</small>
            </span>
            {member.role === option && (
              <span className="end st-chk">
                <Icon name="check" size={20} />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="st-g noi" style={{ marginTop: 12 }}>
        <SwitchRow
          label={t('ps.member.canInvite')}
          hint={t('ps.member.canInviteHint')}
          on={false}
          soon
        />
      </div>
      {viewerRole === 'owner' && (
        <div className="st-g" style={{ marginTop: 12 }}>
          {offered ? (
            <Row
              onClick={() =>
                void run(
                  () => withdrawOwnershipOffer(workspace.id),
                  t('members.offerTakenBack', { name: member.name }),
                )
              }
              chevron={false}
            >
              <Tile name="crown" color="#ff9f0a" />
              <T>{t('members.takeBackOwnership')}</T>
            </Row>
          ) : (
            <Row onClick={() => setAsking('owner')} testId="ps-member-owner">
              <Tile name="crown" color="#ff9f0a" />
              <T>{t('ps.member.makeOwner')}</T>
            </Row>
          )}
        </div>
      )}
      {notice && <Hint error={notice.error}>{notice.text}</Hint>}
      <div className="st-g" style={{ marginTop: 20 }}>
        <Row red chevron={false} onClick={() => setAsking('remove')} testId="ps-member-remove">
          {t('members.removeFromWorkspace')}
        </Row>
      </div>
      {asking === 'owner' && (
        <ConfirmSheet
          icon="crown"
          title={t('members.makeOwnerTitle', { name: member.name })}
          body={t('members.makeOwnerBody', { workspace: workspace.name })}
          label={t('members.offerOwnership')}
          onClose={() => setAsking(null)}
          onConfirm={async () => {
            await offerOwnership(workspace.id, member.userId);
            setAsking(null);
            setNotice({
              text: t('members.ownershipOfferedTo', { name: member.name }),
              error: false,
            });
          }}
        />
      )}
      {asking === 'remove' && (
        <ConfirmSheet
          icon="userminus"
          title={t('members.removeTitle', { name: member.name })}
          body={t('members.removeBody', { workspace: workspace.name, owner: ownerWord })}
          label={t('library.remove')}
          danger
          testId="ps-confirm-remove"
          onClose={() => setAsking(null)}
          onConfirm={async () => {
            await removeMember(workspace.id, member.userId);
            setAsking(null);
            back();
          }}
        />
      )}
    </>
  );
}

export function InvitationPage({
  workspace,
  people,
  inviteId,
  back,
}: {
  workspace: WorkspaceRef;
  people: WorkspacePeopleState;
  inviteId: string;
} & Pick<SubPageNav, 'back'>) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const invite =
    people.status === 'ready'
      ? people.invites.find((candidate) => candidate.id === inviteId)
      : undefined;
  usePageTitle(invite ? invite.email : null);

  if (people.status !== 'ready') return <div className="st-empty">…</div>;
  if (!invite) return <div className="st-empty">{t('ps.member.gone')}</div>;

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const sent = await resendInvite(workspace.id, invite.id);
      setNotice(
        sent.emailSent
          ? { text: t('members.sentAgainTo', { email: invite.email }), error: false }
          : { text: t('members.emailFailed', { email: invite.email }), error: true },
      );
    } catch (caught) {
      setNotice({ text: messageOf(caught), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="st-hero" style={{ paddingTop: 0 }}>
        <span className="st-av xl">
          <Icon name="mail" size={30} />
        </span>
        <b>{t('ps.inv.sentTitle')}</b>
        <span>{invite.email}</span>
        <br />
        <span className="role-pill pend" style={{ display: 'inline-block', marginTop: 8 }}>
          {invite.expired ? t('members.expired') : t('ps.inv.notAccepted')}
        </span>
      </div>
      <Group noIcons>
        <Row chevron={false} end={t(ROLE_LABELS[invite.role])}>
          <T>{t('ps.inv.invitedAsRow')}</T>
        </Row>
        <Row chevron={false} end={formatRelative(invite.lastSentAt)}>
          <T>{t('ps.inv.sentRow')}</T>
        </Row>
        <Row chevron={false} end={invite.invitedByName}>
          <T>{t('ps.inv.byRow')}</T>
        </Row>
      </Group>
      <div className="st-g" style={{ marginTop: 20 }}>
        <Row onClick={() => void resend()} chevron={false} testId="ps-inv-resend">
          <Tile name="mail" color="#0a84ff" />
          <T>{busy ? t('common.sending') : t('ps.inv.resend')}</T>
        </Row>
      </div>
      {notice && <Hint error={notice.error}>{notice.text}</Hint>}
      <div className="st-g" style={{ marginTop: 20 }}>
        <Row red chevron={false} onClick={() => setAsking(true)} testId="ps-inv-cancel">
          {t('ps.inv.cancel')}
        </Row>
      </div>
      {asking && (
        <ConfirmSheet
          icon="mail"
          title={t('ps.inv.cancelTitle')}
          body={t('ps.inv.cancelBody', { email: invite.email })}
          label={t('ps.inv.cancel')}
          danger
          onClose={() => setAsking(false)}
          onConfirm={async () => {
            await revokeInvite(workspace.id, invite.id);
            setAsking(false);
            back();
          }}
        />
      )}
    </>
  );
}

// --- workspace: leaving and deleting ----------------------------------------

/**
 * Leave, for whoever may: a member or admin is asked to confirm; the owner is
 * told to choose a new owner first and taken to someone who could be one.
 */
export function LeaveSheet({
  workspace,
  people,
  userId,
  isOwner,
  onClose,
  go,
}: {
  workspace: WorkspaceRef;
  people: WorkspacePeopleState;
  userId: string | null;
  isOwner: boolean;
  onClose: () => void;
} & Pick<SubPageNav, 'go'>) {
  const t = useT();
  if (isOwner) {
    const heir =
      people.status === 'ready'
        ? people.members.find((member) => member.userId !== userId)
        : undefined;
    return (
      <ConfirmSheet
        icon="crown"
        title={heir ? t('ps.leave.ownerTitle') : t('ps.leave.aloneTitle')}
        body={
          heir
            ? t('ps.leave.ownerBody', { name: workspace.name })
            : t('ps.leave.ownerAlone', { name: workspace.name })
        }
        label={heir ? t('ps.del.chooseOwner') : t('manage.deleteWorkspace')}
        danger={!heir}
        onClose={onClose}
        onConfirm={() => {
          onClose();
          go(heir ? `member:${heir.userId}` : 'delws');
        }}
      />
    );
  }
  return (
    <ConfirmSheet
      icon="alert"
      title={t('workspacePane.leaveTitle', { name: workspace.name })}
      body={t('ps.leaveBody')}
      label={t('ps.leave.go')}
      danger
      testId="ps-confirm-leave"
      onClose={onClose}
      onConfirm={async () => {
        await leaveWorkspace(workspace.id);
        // Off this workspace's boards, onto the most recent one left — or a
        // fresh workspace of their own if this was the only one.
        window.location.assign(new URL('/open', env.VITE_WEB_URL).toString());
      }}
    />
  );
}

export function DeleteWorkspacePage({
  workspace,
  memberCount,
  deleteWorkspace,
  onDeleted,
  go,
  back,
}: {
  workspace: WorkspaceRef;
  memberCount: number | null;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  onDeleted: () => void;
} & SubPageNav) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim() === workspace.name.trim() && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWorkspace(workspace.id);
      onDeleted();
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="d-hero">
        <span className="d-ic">
          <Icon name="alert" size={30} />
        </span>
        <b>{t('ps.delws.title', { name: workspace.name })}</b>
        <span>{t('ps.delws.body', { count: memberCount ?? 1 })}</span>
      </div>
      <div className="st-card" style={{ padding: 16 }}>
        <div className="card-t">{t('ps.delws.before')}</div>
        <ul className="bul">
          <li style={{ cursor: 'pointer' }} onClick={() => go('privacy')}>
            <Icon name="download" size={18} />
            {t('ps.delws.export')}
          </li>
          <li>
            <Icon name="crown" size={18} />
            {t('ps.delws.handOver')}
          </li>
        </ul>
      </div>
      <Label>
        {rich(t('delete.typeToConfirm'), {
          name: <b style={{ color: 'var(--s-fg)' }}>{workspace.name}</b>,
        })}
      </Label>
      <Group noIcons>
        <div className="st-f" style={{ paddingRight: 16 }}>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={workspace.name}
            autoComplete="off"
            spellCheck={false}
            aria-label={t('ps.delws.typeLabel')}
            data-testid="ps-delws-confirm"
          />
        </div>
      </Group>
      {error && <Hint error>{error}</Hint>}
      <Cta>
        <button
          type="button"
          className="st-btn red"
          onClick={() => void submit()}
          disabled={!ready}
          data-testid="ps-delws-go"
        >
          {busy ? t('common.deleting') : t('manage.deleteWorkspace')}
        </button>
        <button type="button" className="st-btn ghost" onClick={back}>
          {t('ps.delws.keep')}
        </button>
      </Cta>
    </>
  );
}
