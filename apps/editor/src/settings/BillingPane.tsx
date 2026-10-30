import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, TriangleAlert, Zap } from 'lucide-react';
import { PLAN_ALLOWANCES, PLAN_NAMES, PLAN_PRICES } from '@canvasflow/types';
import { cn } from '@/lib/utils';
import { useT, type TranslationKey } from '../i18n';
import { cachedBilling, keepBilling, loadBilling, watchBilling } from '../billing/billing-cache';
import {
  BillingApiError,
  invoiceUrl,
  openBillingPortal,
  resumePlan,
  type BillingHistory,
  type BillingWorkspace,
} from '../billing/billing-api';
import { formatDay, formatMoney } from '../billing/format';
import { settingsAddress } from './settings-link';
import { ErrorLine, SettingsButton, SettingsPage } from './settings-ui';
import type { WorkspaceSettingsSource } from './WorkspacePane';

interface BillingPaneProps {
  /** The workspace the sidebar is showing, whose plan this is. */
  workspace?: WorkspaceSettingsSource;
  /** Opens the upgrade page for that workspace. */
  onUpgrade?: (workspaceId: string) => void;
}

const STATUS_KEYS: Record<string, TranslationKey> = {
  paid: 'billing.status.paid',
  refunded: 'billing.status.refunded',
  partially_refunded: 'billing.status.partlyRefunded',
  pending: 'billing.status.pending',
  void: 'billing.status.void',
};

type Load =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; billing: BillingWorkspace; history: BillingHistory | null };

/**
 * Billing in Settings: the plan and its next charge, the card Polar charges,
 * and every invoice. Changing the card or the plan happens in Polar's portal;
 * taking back a cancellation and downloading an invoice happen here.
 */
export function BillingPane({ workspace, onUpgrade }: BillingPaneProps) {
  const t = useT();
  const listed =
    workspace?.status === 'ready'
      ? workspace.workspace
      : workspace?.status === 'shared'
        ? workspace.own
        : null;
  const workspaceId = listed?.id ?? null;
  const [load, setLoad] = useState<Load>(() => {
    const kept = workspaceId ? cachedBilling(workspaceId) : null;
    return kept ? { kind: 'ready', ...kept } : { kind: 'loading' };
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Shows what was kept straight away, and reads it again behind it.
  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    const kept = cachedBilling(workspaceId);
    setLoad(kept ? { kind: 'ready', ...kept } : { kind: 'loading' });
    loadBilling(workspaceId).then(
      (entry) => live && setLoad({ kind: 'ready', ...entry }),
      (caught: unknown) => {
        // A failed re-read leaves what is on show alone.
        if (!live || kept) return;
        setLoad({
          kind: 'failed',
          message: caught instanceof BillingApiError ? caught.message : t('billing.loadFailed'),
        });
      },
    );
    // A later read, such as on coming back from Polar's portal, shows here too.
    const stop = watchBilling((id, entry) => {
      if (live && id === workspaceId) setLoad({ kind: 'ready', ...entry });
    });
    return () => {
      live = false;
      stop();
    };
  }, [workspaceId, t]);

  const failed = (caught: unknown, fallback: TranslationKey) => {
    setBusy(null);
    setError(caught instanceof BillingApiError ? caught.message : t(fallback));
  };

  const openPortal = async () => {
    if (!workspaceId) return;
    setBusy('portal');
    setError(null);
    try {
      window.location.assign(await openBillingPortal(workspaceId, settingsAddress('billing')));
    } catch (caught) {
      failed(caught, 'billing.portalFailed');
    }
  };

  const resume = async () => {
    if (!workspaceId || load.kind !== 'ready') return;
    setBusy('resume');
    setError(null);
    try {
      const subscription = await resumePlan(workspaceId);
      const entry = { billing: { ...load.billing, subscription }, history: load.history };
      keepBilling(workspaceId, entry);
      setLoad({ kind: 'ready', ...entry });
      setBusy(null);
    } catch (caught) {
      failed(caught, 'billing.resumeFailed');
    }
  };

  const download = async (invoiceId: string) => {
    if (!workspaceId) return;
    // Opened now, while the click still counts, and pointed at the PDF once
    // its link arrives; a window opened after the wait would be blocked.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setBusy(invoiceId);
    setError(null);
    try {
      const url = await invoiceUrl(workspaceId, invoiceId);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setBusy(null);
    } catch (caught) {
      tab?.close();
      failed(caught, 'billing.invoiceFailed');
    }
  };

  const plan = load.kind === 'ready' ? load.billing.plan : (listed?.plan ?? 'free');
  const allowance = PLAN_ALLOWANCES[plan];
  const billing = load.kind === 'ready' ? load.billing : null;
  const history = load.kind === 'ready' ? load.history : null;
  const sub = billing?.subscription ?? null;
  const owner = billing?.role === 'owner';
  const price = PLAN_PRICES[plan];
  const seats = price?.per === 'member' ? (sub?.seats ?? billing?.members ?? 1) : 1;
  const amount =
    sub && price ? (sub.cycle === 'monthly' ? price.monthly : price.yearly * 12) * seats : null;
  const date = sub?.renewsAt ? formatDay(new Date(sub.renewsAt)) : null;

  const planLine = sub
    ? [
        t(sub.cycle === 'monthly' ? 'upgradePage.monthly' : 'upgradePage.yearly'),
        price?.per === 'member' ? t('billing.seats', { n: seats }) : null,
        date && sub.cancelAtPeriodEnd ? t('billing.endsOn', { date }) : null,
        date && !sub.cancelAtPeriodEnd && amount !== null
          ? t('billing.nextCharge', { date, amount: formatMoney(amount) })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : t('billing.planHint', { diagrams: allowance.diagramsPerMonth, storage: allowance.storageGb });
  const card = history?.card ?? null;
  // Only before the first read: a kept one shows at once and is read again behind.
  const loading = workspaceId !== null && load.kind === 'loading';
  const shown = load.kind === 'failed' ? load.message : error;

  return (
    <SettingsPage lead={t('settings.section.billing.lead')}>
      <div className="mx-[10px] mt-[14px] flex flex-col gap-[28px]">
        {shown && <ErrorLine>{shown}</ErrorLine>}

        <section data-setting="plan" className={cn(FLASH, 'flex flex-col gap-[12px]')}>
          <div className="flex items-center gap-[12px]">
            <span
              aria-hidden="true"
              className="flex size-[36px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--surface-border)] text-[var(--surface-fg)]"
            >
              <Zap className="size-[17px]" strokeWidth={1.7} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <h3 className="text-[14.5px] font-semibold text-[var(--surface-fg)]">
                {t('billing.planTitle', { plan: PLAN_NAMES[plan] })}
              </h3>
              {loading ? (
                <Skeleton className="my-[3px] h-[11px] w-[240px]" />
              ) : (
                <p className="text-[12.5px] text-[var(--surface-fg-muted)] tabular-nums">
                  {planLine}
                </p>
              )}
            </div>
            {listed && plan === 'free' && onUpgrade && (
              <SettingsButton variant="primary" onClick={() => onUpgrade(listed.id)}>
                {t('billing.upgrade')}
              </SettingsButton>
            )}
            {sub && owner && (
              <SettingsButton disabled={busy !== null} onClick={() => void openPortal()}>
                {busy === 'portal' ? t('billing.opening') : t('billing.adjustPlan')}
              </SettingsButton>
            )}
          </div>
          {sub?.cancelAtPeriodEnd && date && (
            <Notice icon={<CalendarDays className="size-[15px]" aria-hidden="true" />}>
              <span>{t('billing.cancelsOn', { date })}</span>
              {owner && (
                <SettingsButton disabled={busy !== null} onClick={() => void resume()}>
                  {busy === 'resume' ? t('billing.resuming') : t('billing.resubscribe')}
                </SettingsButton>
              )}
            </Notice>
          )}
          {sub?.status === 'past_due' && (
            <Notice warn icon={<TriangleAlert className="size-[15px]" aria-hidden="true" />}>
              <span>{t('billing.pastDue', { plan: PLAN_NAMES[plan] })}</span>
              {owner && (
                <SettingsButton disabled={busy !== null} onClick={() => void openPortal()}>
                  {t('billing.updateCard')}
                </SettingsButton>
              )}
            </Notice>
          )}
          {billing && !sub && plan !== 'free' && <Lead>{t('billing.arranged')}</Lead>}
        </section>

        <section data-setting="payment-method" className={cn(FLASH, 'flex flex-col gap-[14px]')}>
          <div>
            <Heading>{t('settings.group.payment')}</Heading>
            {loading ? (
              <Skeleton className="mt-[7px] h-[11px] w-[300px]" />
            ) : (
              <Lead>
                {billing && !owner
                  ? t('billing.ownerOnly')
                  : card
                    ? t('billing.cardHint')
                    : t('billing.noCard')}
              </Lead>
            )}
          </div>
          {loading && (
            <div className="flex items-center gap-[10px]" aria-hidden="true">
              <Skeleton className="h-[22px] w-[34px]" />
              <div className="flex flex-col gap-[6px]">
                <Skeleton className="h-[11px] w-[120px]" />
                <Skeleton className="h-[10px] w-[80px]" />
              </div>
            </div>
          )}
          {card && (
            <div className="flex items-center justify-between gap-[16px]">
              <div className="flex min-w-0 items-center gap-[10px]">
                <BrandChip brand={card.brand} />
                <div className="flex min-w-0 flex-col gap-[2px]">
                  <div className="flex items-center gap-[8px]">
                    <span className="text-[13px] text-[var(--surface-fg)] tabular-nums">
                      {t('billing.cardLine', { brand: brandName(card.brand), last4: card.last4 })}
                    </span>
                    <span className="inline-flex h-[18px] items-center rounded-full border border-[var(--surface-border)] px-[7px] text-[10.5px] font-medium text-[var(--surface-fg-muted)]">
                      {t('billing.default')}
                    </span>
                  </div>
                  <span className="text-[12px] text-[var(--surface-fg-muted)] tabular-nums">
                    {t('billing.expiresOn', {
                      date: `${String(card.expMonth).padStart(2, '0')}/${card.expYear}`,
                    })}
                  </span>
                </div>
              </div>
              {sub && (
                <SettingsButton disabled={busy !== null} onClick={() => void openPortal()}>
                  {t('billing.updateCard')}
                </SettingsButton>
              )}
            </div>
          )}
        </section>

        <section data-setting="invoices" className={cn(FLASH, 'flex flex-col gap-[12px]')}>
          <Heading>{t('settings.row.invoices')}</Heading>
          {loading ? (
            <div className="flex flex-col" aria-busy="true" aria-label={t('common.loading')}>
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-[12px] py-[11px]">
                  <Skeleton className="h-[11px] w-[90px]" />
                  <Skeleton className="h-[11px] w-[50px]" />
                  <Skeleton className="h-[11px] w-[40px]" />
                  <Skeleton className="ml-auto h-[11px] w-[80px]" />
                </div>
              ))}
            </div>
          ) : billing && !owner ? (
            <Lead>{t('billing.ownerOnly')}</Lead>
          ) : !history || history.invoices.length === 0 ? (
            <Lead>{t('billing.noInvoices')}</Lead>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="text-[12px] text-[var(--surface-fg-muted)]">
                    <th className="pr-[12px] pb-[8px] font-medium">{t('billing.col.date')}</th>
                    <th className="pr-[12px] pb-[8px] font-medium">{t('billing.col.total')}</th>
                    <th className="pr-[12px] pb-[8px] font-medium">{t('billing.col.status')}</th>
                    <th className="pb-[8px] text-right font-medium">{t('billing.col.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="py-[9px] pr-[12px] text-[var(--surface-fg)] tabular-nums">
                        {formatDay(new Date(invoice.date))}
                      </td>
                      <td className="py-[9px] pr-[12px] text-[var(--surface-fg)] tabular-nums">
                        {formatInvoiceTotal(invoice.total, invoice.currency)}
                      </td>
                      <td
                        className={cn(
                          'py-[9px] pr-[12px]',
                          invoice.status === 'paid'
                            ? 'text-[var(--surface-fg)]'
                            : 'text-[var(--surface-fg-muted)]',
                        )}
                      >
                        {STATUS_KEYS[invoice.status]
                          ? t(STATUS_KEYS[invoice.status]!)
                          : invoice.status}
                      </td>
                      <td className="py-[9px] text-right">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void download(invoice.id)}
                          className="text-[12.5px] text-[var(--surface-link)] underline underline-offset-2 hover:opacity-80 focus-visible:rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-50"
                        >
                          {busy === invoice.id ? t('billing.opening') : t('billing.downloadPdf')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </SettingsPage>
  );
}

/** Lights a section when search lands on it, as the rows elsewhere do. */
const FLASH =
  'rounded-[10px] transition-[background-color] duration-[600ms] data-[flash]:bg-[var(--surface-flash)] data-[flash]:duration-0';

const BRAND_NAMES: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  american_express: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  rupay: 'RuPay',
};

function brandName(brand: string): string {
  return BRAND_NAMES[brand.toLowerCase()] ?? brand;
}

/** The card brand's mark, small, the way card lists show it. */
function BrandChip({ brand }: { brand: string }) {
  const key = brand.toLowerCase();
  if (key === 'mastercard') {
    return (
      <span
        aria-hidden="true"
        className="flex h-[22px] w-[34px] shrink-0 items-center justify-center rounded-[4px] border border-[var(--surface-border)] bg-[var(--surface-panel)]"
      >
        <svg viewBox="0 0 24 15" className="h-[13px] w-[21px]">
          <circle cx="8" cy="7.5" r="7" fill="#eb001b" />
          <circle cx="16" cy="7.5" r="7" fill="#f79e1b" fillOpacity="0.9" />
        </svg>
      </span>
    );
  }
  if (key === 'visa') {
    return (
      <span
        aria-hidden="true"
        className="flex h-[22px] w-[34px] shrink-0 items-center justify-center rounded-[4px] bg-[#1a1f71] text-[10px] font-bold tracking-[0.02em] text-white italic"
      >
        {'VISA'}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-[22px] min-w-[34px] shrink-0 items-center justify-center rounded-[4px] border border-[var(--surface-border)] px-[4px] text-[9px] font-semibold text-[var(--surface-fg-muted)] uppercase"
    >
      {brandName(brand).slice(0, 4)}
    </span>
  );
}

function Skeleton({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block max-w-full animate-pulse rounded-[4px] bg-[var(--surface-wash)] motion-reduce:animate-none',
        className,
      )}
    />
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="text-[13.5px] font-semibold text-[var(--surface-fg)]">{children}</h3>;
}

function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mt-[3px] max-w-[52ch] text-[12.5px] leading-[1.5] text-[var(--surface-fg-muted)]">
      {children}
    </p>
  );
}

function formatInvoiceTotal(cents: number, currency: string): string {
  if (currency.toUpperCase() === 'USD') return formatMoney(cents / 100);
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** A line under the plan that wants attention: when it ends, or that a payment failed. */
function Notice({
  icon,
  warn = false,
  children,
}: {
  icon: ReactNode;
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-[10px] rounded-[10px] border py-[8px] pr-[8px] pl-[12px] text-[12.5px]',
        warn
          ? 'border-[var(--surface-warn)] bg-[var(--surface-warn-wash)] text-[var(--surface-fg)]'
          : 'border-[var(--surface-border)] text-[var(--surface-fg)]',
      )}
    >
      <span className={warn ? 'text-[var(--surface-warn)]' : 'text-[var(--surface-fg-muted)]'}>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-[10px]">{children}</div>
    </div>
  );
}
