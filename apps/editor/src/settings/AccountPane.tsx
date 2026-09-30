import { useEffect, useState } from 'react';
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
        if (live) setError(caught instanceof Error ? caught.message : 'Could not load this.');
      },
    );
    return () => {
      live = false;
    };
  }, [token, version]);

  const loading = security === null;
  const hint = (text: (s: AccountSecurity) => string) =>
    security ? text(security) : error ? 'Unavailable' : 'Loading…';

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
    <SettingsPage lead="Sign-in methods, active sessions, and account deletion." dialog={drawn}>
      <Band title="Sign-in" error={error}>
        <EmailRow
          email={account.profile?.email ?? user?.email ?? null}
          verified={account.profile?.emailVerified ?? false}
          token={token}
          onVerified={account.reload}
        />
        <SettingRow setting="password" title="Password" hint={hint(passwordHint)}>
          <SettingsButton onClick={() => setOpened('password')} disabled={loading}>
            {security && !security.hasPassword ? 'Add' : 'Change'}
          </SettingsButton>
        </SettingRow>
        <SettingRow
          setting="connected-accounts"
          title="Connected accounts"
          hint={hint(signInMethodsHint)}
        >
          <SettingsButton onClick={() => setOpened('accounts')} disabled={loading}>
            Manage
          </SettingsButton>
        </SettingRow>
        <SettingRow
          setting="two-factor"
          title="Two-factor authentication"
          hint="Require a second step at sign-in"
          badge={<ComingSoonTag />}
        >
          <SettingsButton disabled>Set up</SettingsButton>
        </SettingRow>
      </Band>

      <Band title="Sessions">
        <SettingRow
          setting="sessions"
          title="Active sessions"
          hint={hint((s) => sessionsHint(s.sessions.length))}
        >
          <SettingsButton onClick={() => setOpened('sessions')} disabled={loading}>
            View all
          </SettingsButton>
        </SettingRow>
        <SettingRow
          setting="sign-out-everywhere"
          title="Sign out everywhere"
          hint="Signs out every device, including this one"
        >
          <SettingsButton onClick={() => setOpened('sign-out')} disabled={loading}>
            Sign out all
          </SettingsButton>
        </SettingRow>
      </Band>
    </SettingsPage>
  );
}
