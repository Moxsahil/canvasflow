import { useEffect, useState } from 'react';
import { t as translate, useT } from '../i18n';
import type { ProfileState } from '../profile';
import {
  AddPasswordDialog,
  ChangePasswordDialog,
  ConnectedAccountsDialog,
  SessionsDialog,
  SignOutEverywhereDialog,
} from './AccountDialogs';
import {
  knownAccountSecurity,
  loadAccountSecurity,
  type AccountSecurity,
} from './account-security-api';
import { passwordHint, sessionsHint, signInMethodsHint } from './account-format';
import { EmailRow } from './EmailRow';
import { Band, ComingSoonTag, SettingRow, SettingsButton, SettingsPage } from './settings-ui';

type Opened = 'password' | 'accounts' | 'sessions' | 'sign-out';

/**
 * Account & Security: how you get in, and what is currently signed in.
 *
 * Read from the gateway each time the page opens: a password changed or a
 * device signed in elsewhere a minute ago has to show here. Until that answer
 * lands, the page shows the last one — read ahead of time, shortly after the
 * editor opens — rather than a row of "Loading…".
 */
export function AccountPane({
  token,
  user,
  account,
}: {
  token: string | null;
  /** The address the sign-in token names, until the profile says otherwise. */
  user: { name: string; email: string | null } | null;
  /** Whether the address is confirmed, and the way to hear that it now is. */
  account: ProfileState;
}) {
  const t = useT();
  const [security, setSecurity] = useState<AccountSecurity | null>(knownAccountSecurity);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  // Bumped to read the account again after something here changed it.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    loadAccountSecurity(token).then(
      (next) => {
        if (!live) return;
        setSecurity(next);
        setError(null);
      },
      (caught: unknown) => {
        if (live)
          setError(caught instanceof Error ? caught.message : translate('settings.loadFailed'));
      },
    );
    return () => {
      live = false;
    };
  }, [token, version]);

  const loading = security === null;
  const hint = (text: (s: AccountSecurity) => string) =>
    security ? text(security) : error ? t('settings.unavailable') : t('common.loading');

  const drawn = (() => {
    if (!security || !opened) return null;
    const close = () => setOpened(null);
    switch (opened) {
      case 'password':
        return security.hasPassword ? (
          <ChangePasswordDialog
            key="password"
            token={token}
            email={security.email}
            onClose={close}
            onChanged={() => setVersion((v) => v + 1)}
          />
        ) : (
          <AddPasswordDialog key="password" token={token} security={security} onClose={close} />
        );
      case 'accounts':
        return <ConnectedAccountsDialog key="accounts" security={security} onClose={close} />;
      case 'sessions':
        return <SessionsDialog key="sessions" security={security} onClose={close} />;
      case 'sign-out':
        return (
          <SignOutEverywhereDialog
            key="sign-out"
            token={token}
            deviceCount={security.sessions.length}
            onClose={close}
          />
        );
    }
  })();

  return (
    <SettingsPage lead={t('settings.section.account.lead')} dialog={drawn}>
      <Band title={t('settings.group.signIn')} error={error}>
        <EmailRow
          email={account.profile?.email ?? user?.email ?? null}
          verified={account.profile?.emailVerified ?? false}
          token={token}
          onVerified={account.reload}
        />
        <SettingRow setting="password" title={t('settings.row.password')} hint={hint(passwordHint)}>
          <SettingsButton onClick={() => setOpened('password')} disabled={loading}>
            {security && !security.hasPassword ? t('common.add') : t('account.change')}
          </SettingsButton>
        </SettingRow>
        <SettingRow
          setting="connected-accounts"
          title={t('settings.row.connected-accounts')}
          hint={hint(signInMethodsHint)}
        >
          <SettingsButton onClick={() => setOpened('accounts')} disabled={loading}>
            {t('account.manage')}
          </SettingsButton>
        </SettingRow>
        <SettingRow
          setting="two-factor"
          title={t('settings.row.two-factor')}
          hint={t('account.twoFactorHint')}
          badge={<ComingSoonTag />}
        >
          <SettingsButton disabled>{t('account.setUp')}</SettingsButton>
        </SettingRow>
      </Band>

      <Band title={t('settings.group.sessions')}>
        <SettingRow
          setting="sessions"
          title={t('settings.row.sessions')}
          hint={hint((s) => sessionsHint(s.sessions.length))}
        >
          <SettingsButton onClick={() => setOpened('sessions')} disabled={loading}>
            {t('account.viewAll')}
          </SettingsButton>
        </SettingRow>
        <SettingRow
          setting="sign-out-everywhere"
          title={t('settings.row.sign-out-everywhere')}
          hint={t('account.signOutEverywhereHint')}
        >
          <SettingsButton onClick={() => setOpened('sign-out')} disabled={loading}>
            {t('account.signOutAll')}
          </SettingsButton>
        </SettingRow>
      </Band>
    </SettingsPage>
  );
}
