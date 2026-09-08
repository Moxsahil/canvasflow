import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import type { SurfaceTheme } from './surface-palette';

const noop = () => {};

function render(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  return renderToString(
    <ConfirmDialog
      open
      title="Reset the canvas?"
      theme="dark"
      onConfirm={noop}
      onClose={noop}
      {...props}
    >
      This clears the board.
    </ConfirmDialog>,
  );
}

/**
 * The confirming button on its own. The palette declares every colour it has
 * on the root element, so asking the whole document whether it mentions danger
 * would answer yes however the button is painted.
 */
function confirmButton(html: string): string {
  const tag = html
    .split('<button')
    .find((part) => part.includes('data-testid="confirm-dialog-confirm"'));
  return tag?.slice(0, tag.indexOf('>')) ?? '';
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    expect(render({ open: false })).toBe('');
  });

  it('shows the question and what answering it does', () => {
    const html = render();
    expect(html).toContain('Reset the canvas?');
    expect(html).toContain('This clears the board.');
  });

  it('announces itself as a prompt that wants an answer', () => {
    // alertdialog rather than dialog: it interrupts to ask something, and
    // screen readers should treat it that way.
    expect(render()).toContain('role="alertdialog"');
  });

  it('labels both answers', () => {
    const html = render({ confirmLabel: 'Reset', cancelLabel: 'Keep it' });
    expect(html).toContain('Reset');
    expect(html).toContain('Keep it');
  });

  it('offers Confirm and Cancel when not told otherwise', () => {
    const html = render();
    expect(html).toContain('Confirm');
    expect(html).toContain('Cancel');
  });

  it('paints a destructive answer in the danger colour, not the accent', () => {
    const button = confirmButton(render({ destructive: true }));
    expect(button).toContain('--surface-danger');
    expect(button).not.toContain('--surface-accent');
  });

  it('paints an ordinary answer in the accent colour', () => {
    const button = confirmButton(render());
    expect(button).toContain('bg-[var(--surface-accent)]');
    expect(button).not.toContain('--surface-danger');
  });

  it.each(['dark', 'light'] as SurfaceTheme[])('carries its own %s palette', (theme) => {
    const html = render({ theme });
    // The palette is declared on the root as custom properties, so everything
    // inside reads var(--surface-*) rather than the editor's chrome tokens.
    expect(html).toContain(`data-theme-variant="${theme}"`);
    expect(html).toContain('--surface-panel');
    expect(html).toContain('--surface-backdrop');
  });

  it('paints a different surface for each theme', () => {
    expect(render({ theme: 'dark' })).not.toBe(render({ theme: 'light' }));
  });
});
