import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SurfaceDialog } from './SurfaceDialog';
import type { SurfaceTheme } from './surface-palette';

const noop = () => {};

function render(props: Partial<Parameters<typeof SurfaceDialog>[0]> = {}) {
  return renderToString(
    <SurfaceDialog open title="Manage boards" theme="dark" onClose={noop} {...props}>
      <p>Body content.</p>
    </SurfaceDialog>,
  );
}

describe('SurfaceDialog', () => {
  it('renders nothing while closed', () => {
    expect(render({ open: false })).toBe('');
  });

  it('names the window and shows its body', () => {
    const html = render();
    expect(html).toContain('Manage boards');
    expect(html).toContain('Body content.');
  });

  it('points its accessible name at the heading it draws', () => {
    const html = render();
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy}"`);
  });

  it('is an ordinary dialog unless it is interrupting to ask something', () => {
    expect(render()).toContain('role="dialog"');
    expect(render({ alert: true })).toContain('role="alertdialog"');
  });

  it('shows a subtitle and a footer only when given them', () => {
    expect(render()).not.toContain('<footer');
    const html = render({ subtitle: 'Rename or delete', footer: <button>Done</button> });
    expect(html).toContain('Rename or delete');
    expect(html).toContain('<footer');
  });

  it('offers a way out, except where dismissing would discard work', () => {
    expect(render()).toContain('aria-label="Close"');
    // A dialog holding a confirmation someone has typed into refuses the
    // backdrop, Escape, and the × alike — see DeleteWarningDialog.
    expect(render({ dismissable: false })).not.toContain('aria-label="Close"');
  });

  it('wraps its body in a form only when there is something to submit', () => {
    expect(render()).not.toContain('<form');
    expect(render({ onSubmit: noop })).toContain('<form');
  });

  it('takes the width it is given', () => {
    expect(render({ width: 640 })).toContain('width:640px');
  });

  it.each(['dark', 'light'] as SurfaceTheme[])('declares the %s palette on its root', (theme) => {
    const html = render({ theme });
    expect(html).toContain(`data-theme-variant="${theme}"`);
    expect(html).toContain('--surface-panel');
    expect(html).toContain('--surface-backdrop');
  });

  it('re-points the shared colour tokens at the surface', () => {
    // What lets a Button or a Select dropped inside land on the dialog's
    // colours without being taught about them — see chromeTokensFor.
    const html = render();
    expect(html).toContain('--color-card');
    expect(html).toContain('--color-muted-foreground');
    expect(html).toContain('--color-border');
  });

  it('paints a different surface for each theme', () => {
    expect(render({ theme: 'dark' })).not.toBe(render({ theme: 'light' }));
  });
});
