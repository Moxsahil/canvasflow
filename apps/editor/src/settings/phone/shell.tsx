import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';
import { useT } from '../../i18n';
import { Icon, type PhoneIconName } from './icons';

/**
 * The phone Settings' pages, by name. A person in the workspace and an
 * invitation each get a page of their own, named by their id.
 */
export type Page =
  | 'root'
  | 'account'
  | 'appearance'
  | 'language'
  | 'workspace'
  | 'notifications'
  | 'billing'
  | 'privacy'
  | 'google'
  | 'password'
  | 'sessions'
  | 'delacct'
  | 'invite'
  | 'delws'
  | `member:${string}`
  | `invitation:${string}`;

/** Where a page puts what sits outside its scroll: the button bar, and a confirmation. */
export interface PhoneSlots {
  cta: HTMLElement | null;
  layer: HTMLElement | null;
  /** Names the page in the bar and its heading, for a page named after someone. */
  setTitle: (title: string | null) => void;
}

export const SlotsContext = createContext<PhoneSlots>({
  cta: null,
  layer: null,
  setTitle: () => {},
});

/** The page's buttons, pinned under it rather than scrolled away. */
export function Cta({ children }: { children: ReactNode }) {
  const { cta } = useContext(SlotsContext);
  return cta ? createPortal(children, cta) : null;
}

// --- rows -----------------------------------------------------------------

export function Row({
  children,
  end,
  chevron = true,
  onClick,
  red = false,
  soon = false,
  testId,
}: {
  children: ReactNode;
  end?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  red?: boolean;
  soon?: boolean;
  testId?: string;
}) {
  const t = useT();
  const showEnd = soon || end !== undefined || (chevron && onClick);
  return (
    <button
      type="button"
      className={cn('st-r', red && 'red', soon && 'dim')}
      onClick={soon ? undefined : onClick}
      disabled={soon || !onClick}
      aria-disabled={soon || undefined}
      data-testid={testId}
    >
      {children}
      {showEnd && (
        <span className="end">
          {soon ? (
            <span className="st-soon">{t('common.soon')}</span>
          ) : (
            <>
              {end !== undefined && end !== '' && <span>{end}</span>}
              {chevron && onClick && <Icon name="chevright" size={16} />}
            </>
          )}
        </span>
      )}
    </button>
  );
}

export function SwitchRow({
  label,
  hint,
  on,
  onToggle,
  soon = false,
  testId,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle?: () => void;
  soon?: boolean;
  testId?: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      className={cn('st-r', soon && 'dim')}
      role="switch"
      aria-checked={on}
      onClick={soon ? undefined : onToggle}
      disabled={soon || !onToggle}
      data-testid={testId}
    >
      <span className="t">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="end">
        {soon ? (
          <span className="st-soon">{t('common.soon')}</span>
        ) : (
          <span className={cn('st-sw', on && 'on')} />
        )}
      </span>
    </button>
  );
}

export const Label = ({ children }: { children: ReactNode }) => (
  <div className="st-sl">{children}</div>
);
export const Group = ({
  children,
  noIcons = false,
}: {
  children: ReactNode;
  noIcons?: boolean;
}) => <div className={cn('st-g', noIcons && 'noi')}>{children}</div>;
export const Hint = ({ children, error = false }: { children: ReactNode; error?: boolean }) => (
  <div className={cn('st-hint', error && 'err')}>{children}</div>
);
export const T = ({ children }: { children: ReactNode }) => <span className="t">{children}</span>;

export function Avatar({
  name,
  url,
  size,
}: {
  name: string;
  url: string | null;
  size?: 's' | 'xl';
}) {
  return (
    <span className={cn('st-av', size)}>{url ? <img src={url} alt="" /> : initialsOf(name)}</span>
  );
}

/**
 * A question asked before something that can't be taken back: a card that
 * rises from the foot of the sheet, with Cancel under it. Stays open with the
 * reason when the change is refused.
 */
export function ConfirmSheet({
  icon,
  title,
  body,
  label,
  danger = false,
  onConfirm,
  onClose,
  testId,
}: {
  icon: PhoneIconName;
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  /** Does the thing. A rejection keeps the card open with its message. */
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  testId?: string;
}) {
  const t = useT();
  const { layer } = useContext(SlotsContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!layer) return null;

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.somethingWentWrongRetry'));
      setBusy(false);
    }
  };

  return createPortal(
    <>
      <div className="cf-scrim" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div
        className="cf"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
      >
        <div className="cf-card">
          <span className={cn('cf-ic', !danger && 'soft')}>
            <Icon name={icon} size={25} />
          </span>
          <b>{title}</b>
          <p>{body}</p>
          {error && <p className="cf-err">{error}</p>}
          <button
            type="button"
            className={cn('st-btn', danger && 'red')}
            style={{ margin: 0 }}
            onClick={() => void go()}
            disabled={busy}
            data-testid={testId && `${testId}-go`}
          >
            {label}
          </button>
        </div>
        <button type="button" className="cf-cancel" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </button>
      </div>
    </>,
    layer,
  );
}
