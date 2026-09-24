import { useEffect, useState } from 'react';
import {
  AddPasswordOverlay,
  ChangePasswordOverlay,
  ConnectedAccountsOverlay,
  SessionsOverlay,
  SignOutEverywhereOverlay,
} from './AccountOverlays';
import { fetchAccountSecurity, type AccountSecurity } from './account-security-api';
import { passwordHint, sessionsHint, signInMethodsHint } from './account-format';
import {
  Card,
  ComingSoonTag,
  GroupLabel,
  Row,
  RowText,
  SecondaryButton,
  SettingsPane,
} from './settings-ui';

type Overlay = 'password' | 'accounts' | 'sessions' | 'sign-out';

/**
 * Account & Security: how you get in, and what is currently signed in.
 *
 * Read from the gateway each time the pane opens rather than from anything the
 * editor already holds: a password changed or a device signed in elsewhere a
 * minute ago has to show here.
 */
export function AccountPane({ token, onClose }: { token: string | null; onClose: () => void }) {
  const [security, setSecurity] = useState<AccountSecurity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // Bumped to read the account again after something here changed it.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    fetchAccountSecurity(token).then(
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
    if (!security || !overlay) return null;
    const close = () => setOverlay(null);
    switch (overlay) {
      case 'password':
        return security.hasPassword ? (
          <ChangePasswordOverlay
            token={token}
            email={security.email}
            onClose={close}
            onChanged={() => setVersion((v) => v + 1)}
          />
        ) : (
          <AddPasswordOverlay token={token} security={security} onClose={close} />
        );
      case 'accounts':
        return <ConnectedAccountsOverlay security={security} onClose={close} />;
      case 'sessions':
        return <SessionsOverlay security={security} onClose={close} />;
      case 'sign-out':
        return (
          <SignOutEverywhereOverlay
            token={token}
            deviceCount={security.sessions.length}
            onClose={close}
          />
        );
    }
  })();

  return (
    <SettingsPane
      title="Account & Security"
      subtitle="Sign-in methods, active sessions, and account deletion."
      onClose={onClose}
      error={error}
      overlay={drawn}
    >
      <GroupLabel>Sign-in</GroupLabel>
      <Card>
        <Row>
          <RowText title="Password" hint={hint(passwordHint)} />
          <SecondaryButton onClick={() => setOverlay('password')} disabled={loading}>
            {security && !security.hasPassword ? 'Add' : 'Change'}
          </SecondaryButton>
        </Row>
        <Row>
          <RowText title="Connected accounts" hint={hint(signInMethodsHint)} />
          <SecondaryButton onClick={() => setOverlay('accounts')} disabled={loading}>
            Manage
          </SecondaryButton>
        </Row>
        <Row>
          <RowText
            title="Two-factor authentication"
            hint="Require a second step at sign-in"
            badge={<ComingSoonTag />}
          />
          <SecondaryButton disabled>Set up</SecondaryButton>
        </Row>
      </Card>

      <GroupLabel>Sessions</GroupLabel>
      <Card>
        <Row>
          <RowText title="Active sessions" hint={hint((s) => sessionsHint(s.sessions.length))} />
          <SecondaryButton onClick={() => setOverlay('sessions')} disabled={loading}>
            View all
          </SecondaryButton>
        </Row>
        <Row>
          <RowText title="Sign out everywhere" hint="Signs out every device, including this one" />
          <SecondaryButton onClick={() => setOverlay('sign-out')} disabled={loading}>
            Sign out all
          </SecondaryButton>
        </Row>
      </Card>
    </SettingsPane>
  );
}
