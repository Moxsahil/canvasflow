import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TERMS_VERSION } from '@canvasflow/types';
import { TermsNotice, needsTermsNotice } from './TermsNotice';
import type { Profile } from './profile-api';

const account: Profile = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ada',
  email: 'ada@example.com',
  avatarUrl: null,
  isGuest: false,
  cursorColor: null,
  avatarVersion: null,
  avatarUploaded: false,
  emailVerified: true,
  termsVersion: null,
};

const accept = () => Promise.resolve();

function render(profile: Profile | null) {
  return renderToString(<TermsNotice profile={profile} onAccept={accept} theme="dark" />);
}

describe('needsTermsNotice', () => {
  it('asks an account with no agreement on record, or one to terms since replaced', () => {
    expect(needsTermsNotice(account)).toBe(true);
    expect(needsTermsNotice({ ...account, termsVersion: '2020-01-01' })).toBe(true);
  });

  it('leaves alone an account that agreed to the terms in force, a guest, and no account yet', () => {
    expect(needsTermsNotice({ ...account, termsVersion: TERMS_VERSION })).toBe(false);
    expect(needsTermsNotice({ ...account, isGuest: true })).toBe(false);
    expect(needsTermsNotice(null)).toBe(false);
  });

  it('asks nobody while the web app is older than the editor and cannot say or record', () => {
    const { termsVersion: _absent, ...fromAnOlderWebApp } = account;
    expect(needsTermsNotice(fromAnOlderWebApp)).toBe(false);
  });
});

describe('TermsNotice', () => {
  it('renders nothing for an account that has nothing to be asked', () => {
    expect(render({ ...account, termsVersion: TERMS_VERSION })).toBe('');
    expect(render(null)).toBe('');
  });

  it('announces newly published terms to an account that never agreed to any', () => {
    const html = render(account);
    expect(html).toContain('published our Terms of Service');
    expect(html).toContain('Last updated');
    expect(html).toContain('Continue');
    expect(html).toContain('Read the terms');
  });

  it('says the terms changed to an account that agreed to an older version', () => {
    expect(render({ ...account, termsVersion: '2020-01-01' })).toContain(
      'Our Terms of Service have changed',
    );
  });

  it('interrupts, and offers no way to close it but agreeing', () => {
    const html = render(account);
    expect(html).toContain('role="alertdialog"');
    expect(html).not.toMatch(/aria-label="Close"/i);
  });
});
