import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExportImageDialog } from '../export/ExportImageDialog';
import { AccessRevokedDialog } from '../share/AccessRevokedDialog';
import { SignOutDialog } from './SignOutDialog';

const noop = () => {};

function signOut(props: Partial<Parameters<typeof SignOutDialog>[0]> = {}) {
  return renderToString(
    <SignOutDialog
      open
      onOpenChange={noop}
      name="Maya Chen"
      email="maya@example.com"
      isGuest={false}
      synced
      busy={false}
      onConfirm={noop}
      theme="dark"
      {...props}
    />,
  );
}

describe('SignOutDialog', () => {
  it('names whose session ends, and asks before ending it', () => {
    const html = signOut();
    expect(html).toContain('Log out?');
    expect(html).toContain('Maya Chen · maya@example.com');
    expect(html).toContain('data-testid="sign-out-confirm"');
    const button = html.split('<button').find((part) => part.includes('sign-out-confirm')) ?? '';
    expect(button).toContain('>Log out<');
    expect(button).toContain('text-red-400');
    expect(button).not.toContain('text-[var(--surface-fg-muted)]');
    expect(html).not.toContain('--surface-warn-wash)');
  });

  it('warns in amber when an account has drawing not yet sent, and in red for a guest', () => {
    expect(signOut({ synced: false })).toContain('bg-[var(--surface-warn-wash)]');
    const guest = signOut({ synced: false, isGuest: true, email: null });
    expect(guest).toContain('Guest');
    expect(guest).toContain('bg-[var(--surface-danger-wash)]');
  });

  it('says so while it works', () => {
    expect(signOut({ busy: true })).toContain('Logging out…');
  });
});

describe('AccessRevokedDialog', () => {
  it('offers only ways away from the board, and no way to close it', () => {
    const html = renderToString(
      <AccessRevokedDialog open boardName="Q4 roadmap" isGuest theme="light" />,
    );
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('Create an account');
    expect(html).not.toMatch(/aria-label="Close"/);
  });
});

describe('ExportImageDialog', () => {
  it('picks the scale from three segments, and waits on an empty board', () => {
    const html = renderToString(
      <ExportImageDialog
        open
        onClose={noop}
        shapes={[]}
        selectedShapes={[]}
        boardName="Untitled board"
        darkTheme
        theme="dark"
      />,
    );
    expect(html).toContain('aria-label="Export scale"');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).toContain('Nothing on the canvas to export');
    expect(html).toContain('Nothing is selected');
  });
});
