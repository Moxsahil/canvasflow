import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SignUpPrompt, type SignUpReason } from './SignUpPrompt';

const render = (reason: SignUpReason | null, signedIn = false) =>
  renderToString(
    <SignUpPrompt reason={reason} signedIn={signedIn} theme="light" onClose={() => {}} />,
  );

describe('SignUpPrompt', () => {
  it('renders nothing while closed', () => {
    expect(render(null)).not.toContain('data-testid="sign-up-prompt"');
  });

  it('offers an account for sharing, and says the drawing stays', () => {
    const html = render('share');
    expect(html).toContain('Sharing needs an account');
    expect(html).toContain('saved in this browser only');
    expect(html).toContain('stays here');
    expect(html).toContain('Sign in');
    expect(html).toContain('Create account');
  });

  it('names comments when that is what was asked for', () => {
    expect(render('comment')).toContain('Comments need an account');
  });

  it('offers someone signed in to move the drawing to their account', () => {
    const html = render('share', true);
    expect(html).toContain('Move to my account');
    expect(html).not.toContain('Create account');
  });
});
