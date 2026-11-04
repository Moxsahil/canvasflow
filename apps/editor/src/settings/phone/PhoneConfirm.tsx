import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { rich, useT } from '../../i18n';
import type { SurfaceTheme } from '../../ui/surface-palette';
import './phone-settings.css';

/**
 * A question on a phone before something that can't be taken back — deleting
 * a board, resetting the canvas: a card that rises from the foot of the
 * screen over a dimmed board, with Cancel under it. The phone's form of the
 * desktop's confirm window, asking the same thing.
 */
export function PhoneConfirm({
  open,
  icon,
  title,
  body,
  label,
  danger = false,
  busy = false,
  error = null,
  confirmText,
  theme,
  onConfirm,
  onClose,
  testId,
}: {
  open: boolean;
  icon: ReactNode;
  title: string;
  body: ReactNode;
  label: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  /** Typed out before the button unlocks, for a delete that takes much with it. */
  confirmText?: string;
  theme: SurfaceTheme;
  onConfirm: () => void;
  onClose: () => void;
  testId?: string;
}) {
  const t = useT();
  const fieldId = useId();
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  const confirmed =
    confirmText === undefined || typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

  return createPortal(
    <section className={cn('cf-ps bare', theme === 'light' && 'light')}>
      <div className="cf-scrim" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div
        className="cf"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
      >
        <div className="cf-card">
          <span className={cn('cf-ic', !danger && 'soft')}>{icon}</span>
          <b>{title}</b>
          <p>{body}</p>
          {confirmText !== undefined && (
            <div className="cf-type">
              <label htmlFor={fieldId}>
                {rich(t('delete.typeToConfirm'), { name: <b>{confirmText}</b> })}
              </label>
              <input
                id={fieldId}
                value={typed}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => setTyped(event.target.value)}
                data-testid={testId && `${testId}-type`}
              />
            </div>
          )}
          {error && <p className="cf-err">{error}</p>}
          <button
            type="button"
            className={cn('st-btn', danger && 'red')}
            style={{ margin: 0 }}
            onClick={onConfirm}
            disabled={busy || !confirmed}
            data-testid={testId && `${testId}-go`}
          >
            {label}
          </button>
        </div>
        <button type="button" className="cf-cancel" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </button>
      </div>
    </section>,
    document.querySelector<HTMLElement>('.cf-editor') ?? document.body,
  );
}
