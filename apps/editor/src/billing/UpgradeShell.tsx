import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { useAppTheme } from '../theme';
import './upgrade.css';

const FONTS_ID = 'cf-upgrade-fonts';
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap';

/**
 * The frame both upgrade pages share: back to the board, the name, and who is
 * signed in. Its faces are loaded only here, so the board never pays for them.
 */
export function UpgradeShell({
  backTo,
  email,
  children,
}: {
  /** The board to go back to, or the editor's home when there is none. */
  backTo: string;
  email?: string | null;
  children: ReactNode;
}) {
  const t = useT();
  // Sets data-theme on <html>, which the page's colours follow.
  useAppTheme();

  useEffect(() => {
    if (document.getElementById(FONTS_ID)) return;
    const link = document.createElement('link');
    link.id = FONTS_ID;
    link.rel = 'stylesheet';
    link.href = FONTS_HREF;
    document.head.appendChild(link);
  }, []);

  return (
    <div className="cf-upgrade">
      <header className="up-header">
        <Link to={backTo} className="up-back">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {t('upgradePage.backToBoard')}
        </Link>
        <div className="up-brand">
          <span className="up-mark up-mono" aria-hidden="true">
            {'CF'}
          </span>
          CanvasFlow
        </div>
        <span className="up-who">{email ?? ''}</span>
      </header>
      {children}
    </div>
  );
}

/** Where the back link goes: the board the page was opened from, if it named one. */
export function boardAddress(from: string | null): string {
  return from && /^[0-9a-f-]{36}$/i.test(from) ? `/boards/${from}` : '/';
}

/** Dollars with cents, as a receipt reads. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
