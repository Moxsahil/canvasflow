import type { ReactNode } from 'react';
import type { TranslationKey } from '../i18n';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AI_PANEL, PANEL_PARAM } from '../diagrams/panel-link';
import { env } from '../lib/env';
import { SETTINGS_PARAM } from '../settings/settings-link';
import { boardAddress } from './format';

/**
 * Where the upgrade page's back link goes: a page of the editor, an address
 * on the website, or `-1` for the page before this one.
 */
export type UpgradeBack = string | -1;

/** What opened the upgrade page on a board, so going back can open it again. */
export type UpgradeVia = 'ai' | 'settings';

/** The `?from=` the website's pricing links send. */
export const FROM_PRICING = 'pricing';

function pricingPage(): string {
  return new URL('/#pricing', env.VITE_WEB_URL).toString();
}

/**
 * Back to where the person started, as checkouts elsewhere do:
 *
 * - from the website's pricing (`?from=pricing`), the pricing section;
 * - from a board (`?from=<board id>`), that board, with Settings at Billing or
 *   the AI panel open again when one of those sent them (`?via=`);
 * - otherwise the page before, when it was one of the editor's own, and the
 *   pricing section when there was none (a typed address, a link in an email).
 */
export function useUpgradeBack(params: URLSearchParams): UpgradeBack {
  const location = useLocation();
  const from = params.get('from');
  if (from === FROM_PRICING) return pricingPage();
  const board = boardAddress(from);
  if (board !== '/') {
    const via = params.get('via');
    if (via === 'settings') return `${board}?${SETTINGS_PARAM}=billing`;
    if (via === 'ai') return `${board}?${PANEL_PARAM}=${AI_PANEL}`;
    return board;
  }
  // The router marks the first page of a visit 'default'; any other key means
  // the editor itself navigated here, so there is one of its pages to go back to.
  return location.key !== 'default' ? -1 : pricingPage();
}

/** What the back link says: where it goes, as far as that is known. */
export function backLabel(to: UpgradeBack): TranslationKey {
  if (to === -1) return 'upgradePage.back';
  return /^https?:/.test(to) ? 'upgradePage.backToPricing' : 'upgradePage.backToBoard';
}

/** A link to an UpgradeBack, whichever kind it is. */
export function UpgradeBackLink({
  to,
  className,
  children,
}: {
  to: UpgradeBack;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  if (to === -1) {
    return (
      <a
        href="/"
        className={className}
        onClick={(event) => {
          event.preventDefault();
          navigate(-1);
        }}
      >
        {children}
      </a>
    );
  }
  if (/^https?:/.test(to)) {
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}
