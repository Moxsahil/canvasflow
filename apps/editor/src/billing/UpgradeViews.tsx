import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import NumberFlow from '@number-flow/react';
import { Check, ChevronLeft, CircleAlert, Copy, Lock, Minus, Plus } from 'lucide-react';
import {
  PLAN_ALLOWANCES,
  PLAN_CURRENCY,
  PLAN_NAMES,
  PLAN_PRICES,
  SUPPORT_EMAIL,
  type BillingCycle,
  type PurchasablePlan,
  type WorkspacePlan,
} from '@canvasflow/types';
import { env } from '../lib/env';
import { rich, useT, type TranslationKey } from '../i18n';
import { cn } from '../lib/utils';
import '@fontsource-variable/inter/wght.css';
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import { formatDay, formatMoney } from './format';
import { AnimatedTicket, type TicketDetail } from '@/components/ui/ticket-confirmation-card';
import { radioKeys } from './radio-keys';
import { UpgradeBackLink, backLabel, type UpgradeBack } from './upgrade-back';

/*
 * The upgrade pages on the website's dark ground: a two-panel checkout (what
 * is being bought beside the choices and the button), and the states around
 * it: loading, already paying, payment failed.
 *
 * Presentational only. The data loading and checkout stay in UpgradePage.
 */

// Inter ships with the app rather than from Google Fonts. Its Latin file is
// asked for as soon as this module runs, before the page first paints, so the
// text doesn't show in a fallback face and then jump.
if (typeof document !== 'undefined' && !document.getElementById('cf-inter-preload')) {
  const link = document.createElement('link');
  link.id = 'cf-inter-preload';
  link.rel = 'preload';
  link.as = 'font';
  link.type = 'font/woff2';
  link.crossOrigin = 'anonymous';
  link.href = interLatin;
  document.head.appendChild(link);
}

/**
 * Where Polar's card page lives. Sandbox in development, the live store in a
 * production build, matching the gateway's POLAR_ENVIRONMENT in each.
 */
const POLAR_ORIGINS = import.meta.env.PROD
  ? ['https://buy.polar.sh', 'https://polar.sh', 'https://api.polar.sh']
  : ['https://sandbox.polar.sh', 'https://sandbox-api.polar.sh'];

/**
 * Opens the connections to Polar before the person clicks Pay, so the jump to
 * the card page skips the DNS, TCP and TLS round trips. Once per page.
 */
function warmPolar(): void {
  if (document.getElementById('cf-polar-warm')) return;
  POLAR_ORIGINS.forEach((origin, index) => {
    const link = document.createElement('link');
    if (index === 0) link.id = 'cf-polar-warm';
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}

const TYPE = {
  fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
  fontFeatureSettings: "'cv05','cv10','cv11','ss01'",
} as const;

const PLAN_ORDER: PurchasablePlan[] = ['pro', 'team'];
const CYCLE_ORDER: BillingCycle[] = ['yearly', 'monthly'];

/** How long a load may take before the skeleton appears. */
const SKELETON_DELAY_MS = 150;

const muted = 'text-[#9f9fa9]';
export const upgradeButtons = {
  primary:
    'relative inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-[#135dfc] px-4 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#2a6dfc] disabled:cursor-not-allowed disabled:opacity-60 aria-busy:disabled:opacity-100',
  quiet:
    'inline-flex h-9 cursor-pointer items-center justify-center rounded-md px-4 text-sm font-medium whitespace-nowrap ring-1 ring-white/15 transition-colors ring-inset hover:bg-white/5',
} as const;

/** The yearly discount on a plan's monthly price, rounded down so it is never overstated. */
export function yearlySaving(plan: PurchasablePlan): number {
  const price = PLAN_PRICES[plan]!;
  return Math.floor((1 - price.yearly / price.monthly) * 100);
}

/** What a plan gives the workspace, in the order the landing page's cards list it. */
function planDetails(plan: PurchasablePlan, t: ReturnType<typeof useT>): string[] {
  const a = PLAN_ALLOWANCES[plan];
  return plan === 'pro'
    ? [
        t('upgradeCheckout.proDiagrams', { n: a.diagramsPerMonth }),
        t('upgradeCheckout.proStorage', { n: a.storageGb }),
        t('upgradeCheckout.proHistory', { n: a.historyDays ?? 0 }),
        t('upgradeCheckout.proExpiringLinks'),
        t('upgradeCheckout.proNoBadge'),
      ]
    : [
        t('upgradeCheckout.teamDiagrams', { n: a.diagramsPerMonth }),
        t('upgradeCheckout.teamStorage', { n: a.storageGb }),
        t('upgradeCheckout.teamHistory'),
        t('upgradeCheckout.teamInvites'),
        t('upgradeCheckout.teamGuests'),
      ];
}

/** One period on from today: when a plan bought now first renews. */
function renewalFrom(now: Date, cycle: BillingCycle): Date {
  const next = new Date(now);
  if (cycle === 'monthly') next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

/**
 * A dollar amount that rolls digit by digit to its new value, as the landing
 * page's prices do. `whole` drops the cents: "$5", not "$5.00".
 */
function Money({ value, whole }: { value: number; whole?: boolean }) {
  return (
    <NumberFlow
      value={value}
      format={{
        style: 'currency',
        currency: PLAN_CURRENCY,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: whole ? 0 : 2,
      }}
      locales="en-US"
    />
  );
}

/** Header and ground shared by every state of the page. */
export function UpgradeFrame({
  backTo,
  bare,
  children,
}: {
  backTo: UpgradeBack;
  /** Leave the header out: the checkout carries its own back link. */
  bare?: boolean;
  children: ReactNode;
}) {
  const t = useT();

  return (
    <div
      style={TYPE}
      className="fixed inset-0 overflow-y-auto bg-[#101012] text-sm text-[#ededef] antialiased scheme-dark"
    >
      {!bare && (
        <header className="mx-auto grid h-14 max-w-5xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
          <UpgradeBackLink
            to={backTo}
            className={cn(
              '-ml-1 inline-flex items-center gap-0.5 justify-self-start rounded px-1 py-0.5 transition-colors hover:text-[#ededef]',
              muted,
            )}
          >
            <ChevronLeft className="size-4" />
            <span className="max-sm:sr-only">{t(backLabel(backTo))}</span>
          </UpgradeBackLink>
          <span className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.02em]">
            <svg className="size-4" viewBox="20 20 80 80" fill="currentColor" aria-hidden="true">
              <path d="M34.5 34.5H67.5L58.5 44.5H32V73.5H58.5L50 83H34.5A12 12 0 0 1 22.5 71V46.5A12 12 0 0 1 34.5 34.5ZM73.5 34.5H98.5V44.5H72.5V54.5H98.5L92.5 64.5H72.5V83H63V46.2Z" />
            </svg>
            CanvasFlow
          </span>
        </header>
      )}
      {children}
    </div>
  );
}

/** One labelled row of the form: the label in a fixed column, then its content. */
function Row({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  return (
    <div className="grid gap-x-6 gap-y-2 border-t border-white/7 px-5 py-4 first:border-t-0 sm:grid-cols-[132px_minmax(0,1fr)]">
      <div id={id} className={cn('pt-px', muted)}>
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The CanvasFlow mark, sized by its container. */
function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="20 20 80 80" fill="currentColor" aria-hidden="true">
      <path d="M34.5 34.5H67.5L58.5 44.5H32V73.5H58.5L50 83H34.5A12 12 0 0 1 22.5 71V46.5A12 12 0 0 1 34.5 34.5ZM73.5 34.5H98.5V44.5H72.5V54.5H98.5L92.5 64.5H72.5V83H63V46.2Z" />
    </svg>
  );
}

/**
 * The checkout's two halves: what is being bought on the left, the choices
 * and the button on a lighter panel to the right. Stacked on narrow screens.
 */
function Split({ summary, form }: { summary: ReactNode; form: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex justify-center px-5 pt-6 pb-10 sm:px-8 lg:justify-end lg:px-16 lg:pt-10 xl:px-24">
        <div className="flex w-full max-w-[400px] flex-col">{summary}</div>
      </section>
      <section className="flex justify-center border-t border-white/6 bg-[#16161a] px-5 py-10 sm:px-8 lg:justify-start lg:border-t-0 lg:border-l lg:px-16 lg:pt-24 xl:px-24">
        <div className="w-full max-w-[400px]">{form}</div>
      </section>
    </div>
  );
}

export interface UpgradeChooseProps {
  workspaceName: string;
  email: string | null;
  owner: boolean;
  /** Members in the workspace today: the fewest Team seats it can buy. */
  members: number;
  backTo: UpgradeBack;
  plan: PurchasablePlan;
  cycle: BillingCycle;
  seats: number;
  busy: boolean;
  error: string | null;
  onPlan: (plan: PurchasablePlan) => void;
  onCycle: (cycle: BillingCycle) => void;
  onSeats: (seats: number) => void;
  onPay: () => void;
}

export function UpgradeChoose({
  workspaceName,
  email,
  owner,
  members,
  backTo,
  plan,
  cycle,
  seats,
  busy,
  error,
  onPlan,
  onCycle,
  onSeats,
  onPay,
}: UpgradeChooseProps) {
  const t = useT();
  const price = PLAN_PRICES[plan]!;
  const perMember = price.per === 'member';
  const quantity = perMember ? seats : 1;
  const unit = cycle === 'monthly' ? price.monthly : price.yearly * 12;
  const total = unit * quantity;
  const renews = useMemo(() => formatDay(renewalFrom(new Date(), cycle)), [cycle]);
  const minSeats = Math.max(1, members);

  const summary = (
    <>
      <UpgradeBackLink
        to={backTo}
        className="group inline-flex w-fit items-center gap-2 text-[15px] font-semibold tracking-[-0.02em]"
      >
        <ChevronLeft
          className={cn('size-4 transition-transform group-hover:-translate-x-0.5', muted)}
        />
        <Mark className="size-4" />
        CanvasFlow
      </UpgradeBackLink>

      <div className="mt-12 lg:mt-20">
        <p className={muted}>{t('upgradeCheckout.heading', { workspace: workspaceName })}</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-[-0.03em] tabular-nums">
            <Money value={total} />
          </span>
          <span className={muted}>
            {t(cycle === 'monthly' ? 'upgradeCheckout.perMonth' : 'upgradeCheckout.perYear')}
          </span>
        </p>
      </div>

      <div className="mt-10 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#135dfc] text-white">
          <Mark className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-4">
            <span className="font-medium">
              {t('upgradeCheckout.product', { plan: PLAN_NAMES[plan] })}
            </span>
            <span className="tabular-nums">
              <Money value={total} />
            </span>
          </div>
          <div className={cn('mt-0.5 text-[13px]', muted)}>
            {perMember
              ? t('upgradePage.seatsLine', { n: seats, price: formatMoney(unit) })
              : t(
                  cycle === 'monthly'
                    ? 'upgradeCheckout.billedMonthly'
                    : 'upgradeCheckout.billedYearly',
                )}
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-white/8 pt-6 pl-[52px]">
        <h2 className={cn('text-[13px]', muted)}>{t('upgradeCheckout.included')}</h2>
        <ul role="list" className="mt-3.5 space-y-2.5">
          {planDetails(plan, t).map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <Check className="mt-[3px] size-3.5 shrink-0 text-[#6f9cfd]" strokeWidth={2.5} />
              {line}
            </li>
          ))}
        </ul>
      </div>

      <p className={cn('mt-auto hidden pt-16 text-xs lg:block', muted)}>
        {t('upgradeCheckout.paymentsBy')} ·{' '}
        <a href={new URL('/refunds', env.VITE_WEB_URL).toString()} className="hover:text-[#ededef]">
          {t('upgradePage.refundPolicy')}
        </a>{' '}
        ·{' '}
        <a href={new URL('/terms', env.VITE_WEB_URL).toString()} className="hover:text-[#ededef]">
          {t('upgradeCheckout.terms')}
        </a>
      </p>
    </>
  );

  const form = (
    <>
      <h1 className="text-base font-semibold tracking-[-0.01em]">{t('upgradePage.title')}</h1>
      <p className={cn('mt-1 text-[13px]', muted)}>{t('upgradePage.lead')}</p>

      <div
        role="radiogroup"
        aria-label={t('upgradePage.planLegend')}
        onKeyDown={radioKeys(PLAN_ORDER, plan, onPlan)}
        className="mt-6 space-y-2.5"
      >
        {PLAN_ORDER.map((id) => {
          const p = PLAN_PRICES[id]!;
          const a = PLAN_ALLOWANCES[id];
          const chosen = plan === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={chosen ? 0 : -1}
              onClick={() => onPlan(id)}
              className={cn(
                'block w-full cursor-pointer rounded-lg border px-4 py-3.5 text-left transition-colors',
                chosen
                  ? 'border-[#135dfc] bg-[#135dfc]/6 ring-1 ring-[#135dfc]'
                  : 'border-white/10 hover:border-white/20',
              )}
            >
              <span className="flex items-baseline justify-between gap-4">
                <span className="font-medium">{PLAN_NAMES[id]}</span>
                <span className="tabular-nums">
                  <Money value={cycle === 'monthly' ? p.monthly : p.yearly} whole />
                  <span className={cn('text-[13px]', muted)}>
                    {' '}
                    {t(
                      p.per === 'member'
                        ? 'upgradeCheckout.unitMemberMonth'
                        : 'upgradeCheckout.unitMonth',
                    )}
                  </span>
                </span>
              </span>
              <span className={cn('mt-1 block text-[13px]', muted)}>
                {id === 'pro'
                  ? t('upgradePage.proLimits', {
                      diagrams: a.diagramsPerMonth,
                      storage: a.storageGb,
                    })
                  : t('upgradePage.teamLimits', {
                      diagrams: a.diagramsPerMonth,
                      storage: a.storageGb,
                    })}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="radiogroup"
        aria-label={t('upgradePage.periodLegend')}
        onKeyDown={radioKeys(CYCLE_ORDER, cycle, onCycle)}
        className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1 ring-1 ring-white/6"
      >
        {CYCLE_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={cycle === id}
            tabIndex={cycle === id ? 0 : -1}
            onClick={() => onCycle(id)}
            className={cn(
              'flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md text-[13px] transition-colors',
              cycle === id
                ? 'bg-[#26262b] font-medium text-[#ededef] shadow-sm'
                : 'text-[#9f9fa9] hover:text-[#ededef]',
            )}
          >
            {t(id === 'monthly' ? 'upgradePage.monthly' : 'upgradePage.yearly')}
            {id === 'yearly' && (
              <span className="text-[11px] font-medium text-[#6f9cfd]">−{yearlySaving(plan)}%</span>
            )}
          </button>
        ))}
      </div>

      {perMember && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium">{t('upgradePage.seats')}</div>
            <div className={cn('mt-0.5 text-[13px]', muted)}>
              {t('upgradePage.seatsHint', { n: minSeats })}
            </div>
          </div>
          <span className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-lg border border-white/10">
            <button
              type="button"
              aria-label={t('upgradePage.fewerSeats')}
              disabled={seats <= minSeats}
              onClick={() => onSeats(Math.max(minSeats, seats - 1))}
              className="grid w-9 cursor-pointer place-items-center hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <Minus className="size-3.5" />
            </button>
            <output aria-live="polite" className="grid w-10 place-items-center tabular-nums">
              <NumberFlow value={seats} locales="en-US" />
            </output>
            <button
              type="button"
              aria-label={t('upgradePage.moreSeats')}
              disabled={seats >= 1000}
              onClick={() => onSeats(Math.min(1000, seats + 1))}
              className="grid w-9 cursor-pointer place-items-center hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <Plus className="size-3.5" />
            </button>
          </span>
        </div>
      )}

      <dl className="mt-6 space-y-3 rounded-lg border border-white/10 px-4 py-3.5">
        <div className="flex justify-between gap-4">
          <dt className={muted}>{t('upgradeCheckout.subtotal')}</dt>
          <dd className="tabular-nums">
            <Money value={total} />
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className={muted}>{t('upgradePage.tax')}</dt>
          <dd className={muted}>{t('upgradeCheckout.taxAtPayment')}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-white/8 pt-3 font-medium">
          <dt>{t('upgradePage.dueToday')}</dt>
          <dd className="tabular-nums">
            <Money value={total} />
          </dd>
        </div>
      </dl>

      {email && (
        <p className={cn('mt-6 text-[13px]', muted)}>
          {rich(t('upgradeCheckout.receiptsTo'), {
            email: <span className="break-all text-[#ededef]">{email}</span>,
          })}
        </p>
      )}

      <div className="mt-6 lg:mt-8">
        {owner ? (
          <PayButton
            total={total}
            busy={busy}
            onPay={onPay}
            className="h-11 w-full text-[15px] max-lg:hidden"
          />
        ) : (
          <p className={cn('rounded-lg border border-white/10 px-4 py-3 text-[13px]', muted)}>
            {t('upgradePage.ownerOnly')}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-[#f97066] max-lg:hidden">
            {error}
          </p>
        )}
      </div>

      <p
        className={cn(
          'mt-5 flex justify-center gap-1.5 text-center text-xs leading-relaxed',
          muted,
        )}
      >
        <Lock className="mt-0.5 size-3 shrink-0" />
        <span>{t('upgradeCheckout.secureNote', { date: renews })}</span>
      </p>

      {/* Room at the foot on phones so the pay bar never covers the last line. */}
      {owner && <div className="h-16 lg:hidden" aria-hidden="true" />}
    </>
  );

  return (
    <>
      <Split summary={summary} form={form} />
      {owner && (
        <>
          {/* On phones the total and the button stay in reach at the bottom. */}
          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/8 bg-[#16161a]/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
            {error && (
              <p role="alert" className="mb-2 text-[13px] text-[#f97066]">
                {error}
              </p>
            )}
            <div className="mx-auto flex max-w-[400px] items-center justify-between gap-4">
              <div>
                <div className={cn('text-xs', muted)}>{t('upgradePage.dueToday')}</div>
                <div className="text-lg font-semibold tabular-nums">
                  <Money value={total} />
                </div>
              </div>
              <PayButton total={total} busy={busy} onPay={onPay} className="h-11 px-6" />
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** The blue Pay button: warms the way to Polar on approach, spins while the checkout opens. */
function PayButton({
  total,
  busy,
  onPay,
  className,
}: {
  total: number;
  busy: boolean;
  onPay: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      className={cn(upgradeButtons.primary, className)}
      disabled={busy}
      aria-busy={busy || undefined}
      // Read as one amount, not the rolling digits' separate parts.
      aria-label={busy ? undefined : t('upgradeCheckout.pay', { amount: formatMoney(total) })}
      onPointerEnter={warmPolar}
      onFocus={warmPolar}
      onClick={onPay}
    >
      {/* The label stays, hidden, so the button keeps its width while it spins. */}
      <span className={cn(busy && 'invisible')}>
        {rich(t('upgradeCheckout.pay'), { amount: <Money value={total} /> })}
      </span>
      {busy && (
        <span className="absolute inset-0 grid place-items-center">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
          />
          <span className="sr-only">{t('upgradePage.opening')}</span>
        </span>
      )}
    </button>
  );
}

/** A grey bar standing in for a line of text while the page loads. */
function Bone({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block rounded bg-white/6', className)} />;
}

/** The checkout's shape in grey while the workspace loads, so nothing jumps when it arrives. */
export function UpgradeSkeleton() {
  const t = useT();
  // Held back a moment: on a quick load the form arrives first and the grey
  // shapes never flash. Only a slow one shows them.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), SKELETON_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>
      <div className={cn('animate-pulse', !shown && 'invisible')}>
        <Split
          summary={
            <>
              <Bone className="h-4 w-32" />
              <div className="mt-12 lg:mt-20">
                <Bone className="h-3 w-48" />
                <Bone className="mt-3 h-8 w-40" />
              </div>
              <div className="mt-10 flex gap-3">
                <Bone className="size-10 rounded-lg" />
                <div className="flex-1 space-y-2 pt-1">
                  <Bone className="h-3 w-32" />
                  <Bone className="h-2.5 w-20" />
                </div>
              </div>
              <div className="mt-8 space-y-3.5 border-t border-white/8 pt-6 pl-[52px]">
                <Bone className="h-2.5 w-24" />
                {['w-44', 'w-28', 'w-48', 'w-36', 'w-40'].map((width) => (
                  <Bone key={width} className={cn('h-3', width)} />
                ))}
              </div>
            </>
          }
          form={
            <>
              <Bone className="h-4 w-52" />
              <Bone className="mt-2.5 h-3 w-full" />
              <div className="mt-6 space-y-2.5">
                <Bone className="h-[70px] w-full rounded-lg" />
                <Bone className="h-[70px] w-full rounded-lg" />
              </div>
              <Bone className="mt-6 h-11 w-full rounded-lg" />
              <Bone className="mt-6 h-[104px] w-full rounded-lg" />
              <Bone className="mt-6 h-3 w-56" />
              <Bone className="mt-8 h-11 w-full rounded-md" />
            </>
          }
        />
      </div>
    </main>
  );
}

/** A short message in the column the form uses: signed out, no workspace, failed. */
export function UpgradeNotice({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: string;
  action?: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 md:pt-14">
      <h1 className="text-xl font-semibold tracking-[-0.015em]">{title}</h1>
      {lead && <p className={cn('mt-1.5 max-w-lg', muted)}>{lead}</p>}
      {action && <div className="mt-6">{action}</div>}
    </main>
  );
}

/** The workspace already pays: which plan, when it renews, how to change it. */
export function UpgradeAlreadyPaying({
  workspaceName,
  plan,
  renewsAt,
  cancelAtPeriodEnd,
  backTo,
}: {
  workspaceName: string;
  plan: WorkspacePlan;
  renewsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  backTo: UpgradeBack;
}) {
  const t = useT();
  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-6 md:pt-14">
      <p className={cn('text-[13px]', muted)}>{t('upgradeCheckout.breadcrumb')}</p>
      <h1 className="mt-2 text-xl font-semibold tracking-[-0.015em]">
        {t('upgradePage.alreadyTitle', { workspace: workspaceName, plan: PLAN_NAMES[plan] })}
      </h1>
      <div className="mt-8 overflow-hidden rounded-lg border border-white/10 bg-[#141416]">
        <Row label={t('upgradePage.planLegend')}>{PLAN_NAMES[plan]}</Row>
        {renewsAt && (
          <Row label={t(cancelAtPeriodEnd ? 'upgradeCheckout.ends' : 'upgradeCheckout.nextCharge')}>
            {formatDay(renewsAt)}
          </Row>
        )}
        <Row label={t('upgradeCheckout.changes')}>
          {t('upgradePage.alreadyChange', { email: SUPPORT_EMAIL })}
        </Row>
      </div>
      <div className="mt-6">
        <UpgradeBackLink to={backTo} className={upgradeButtons.quiet}>
          {t(backLabel(backTo))}
        </UpgradeBackLink>
      </div>
    </main>
  );
}

/** Why a payment didn't go through, as far as Polar tells us. */
export type PaymentFailure =
  | 'declined'
  | 'insufficient-funds'
  | 'authentication'
  | 'expired-card'
  | 'processing'
  | 'not-opened';

/**
 * What each failure means to the person paying and what to do about it.
 * Kept to what is true for every bank: we say what was reported, never guess
 * at the bank's own reason.
 */
const FAILURES: Record<
  PaymentFailure,
  { title: TranslationKey; detail: TranslationKey; steps: TranslationKey[] }
> = {
  declined: {
    title: 'upgradeFailed.declined.title',
    detail: 'upgradeFailed.declined.detail',
    steps: [
      'upgradeFailed.declined.step1',
      'upgradeFailed.declined.step2',
      'upgradeFailed.declined.step3',
    ],
  },
  'insufficient-funds': {
    title: 'upgradeFailed.insufficientFunds.title',
    detail: 'upgradeFailed.insufficientFunds.detail',
    steps: [
      'upgradeFailed.insufficientFunds.step1',
      'upgradeFailed.insufficientFunds.step2',
      'upgradeFailed.insufficientFunds.step3',
    ],
  },
  authentication: {
    title: 'upgradeFailed.authentication.title',
    detail: 'upgradeFailed.authentication.detail',
    steps: [
      'upgradeFailed.authentication.step1',
      'upgradeFailed.authentication.step2',
      'upgradeFailed.authentication.step3',
    ],
  },
  'expired-card': {
    title: 'upgradeFailed.expiredCard.title',
    detail: 'upgradeFailed.expiredCard.detail',
    steps: ['upgradeFailed.expiredCard.step1', 'upgradeFailed.expiredCard.step2'],
  },
  processing: {
    title: 'upgradeFailed.processing.title',
    detail: 'upgradeFailed.processing.detail',
    steps: ['upgradeFailed.processing.step1', 'upgradeFailed.processing.step2'],
  },
  'not-opened': {
    title: 'upgradeFailed.notOpened.title',
    detail: 'upgradeFailed.notOpened.detail',
    steps: [
      'upgradeFailed.notOpened.step1',
      'upgradeFailed.notOpened.step2',
      'upgradeFailed.notOpened.step3',
    ],
  },
};

export interface UpgradePaymentFailedProps {
  workspaceName: string;
  reason: PaymentFailure;
  plan: PurchasablePlan;
  cycle: BillingCycle;
  amount: number;
  attemptedAt: Date;
  /** Polar's checkout id, or ours when no checkout was opened. */
  reference: string;
  busy: boolean;
  onRetry: () => void;
  onChangePlan: () => void;
}

/**
 * A payment that didn't go through: what happened, that nothing was taken,
 * the attempt's details for the bank or support, and what to do next.
 */
export function UpgradePaymentFailed({
  workspaceName,
  reason,
  plan,
  cycle,
  amount,
  attemptedAt,
  reference,
  busy,
  onRetry,
  onChangePlan,
}: UpgradePaymentFailedProps) {
  const t = useT();
  const failure = FAILURES[reason];
  const [copied, setCopied] = useState(false);
  const when = `${formatDay(attemptedAt)}, ${attemptedAt.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
  const support = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    t('upgradeFailed.mailSubject', { reference }),
  )}`;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-6 md:pt-14">
      <p className={cn('text-[13px]', muted)}>{t('upgradeCheckout.breadcrumb')}</p>
      <h1 className="mt-2 text-xl font-semibold tracking-[-0.015em]">{t('upgradeFailed.title')}</h1>
      <p className={cn('mt-1.5 max-w-lg', muted)}>
        {t('upgradeFailed.lead', { workspace: workspaceName })}
      </p>

      <div
        role="alert"
        className="mt-8 flex gap-3 rounded-lg border border-[#f97066]/30 bg-[#f97066]/7 px-4 py-3.5"
      >
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#f97066]" />
        <div>
          <p className="font-medium text-[#fda29b]">{t(failure.title)}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#ededef]/75">{t(failure.detail)}</p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-[#141416]">
        <Row label={t('upgradeFailed.status')}>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[#f97066]" />
            {t('upgradeFailed.statusValue')}
          </span>
        </Row>
        <Row label={t('upgradePage.planLegend')}>
          {t('upgradePage.lineItem', {
            plan: PLAN_NAMES[plan],
            cycle: t(cycle === 'monthly' ? 'upgradePage.monthly' : 'upgradePage.yearly'),
          })}
        </Row>
        <Row label={t('upgradeFailed.amount')}>
          <span className="tabular-nums">{formatMoney(amount)}</span>
          <span className={cn('ml-2 text-[13px]', muted)}>{t('upgradeFailed.amountNote')}</span>
        </Row>
        <Row label={t('upgradeFailed.attempted')}>{when}</Row>
        <Row label={t('upgradeFailed.reference')}>
          <span className="flex items-center gap-2">
            <code className="min-w-0 truncate font-mono text-[13px]">{reference}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(reference).then(() => setCopied(true));
              }}
              className={cn(
                'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[12px] transition-colors hover:bg-white/5 hover:text-[#ededef]',
                muted,
              )}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {t(copied ? 'upgradeFailed.copied' : 'upgradeFailed.copy')}
            </button>
          </span>
        </Row>
      </div>

      <h2 className="mt-10 font-medium">{t('upgradeFailed.nextSteps')}</h2>
      <ol className="mt-3 space-y-2.5">
        {failure.steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full border border-white/10 text-[11px] tabular-nums',
                muted,
              )}
            >
              {index + 1}
            </span>
            <span className="pt-px text-[#c4c4cc]">{t(step)}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={upgradeButtons.primary}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={onRetry}
        >
          <span className={cn(busy && 'invisible')}>{t('common.tryAgain')}</span>
          {busy && (
            <span className="absolute inset-0 grid place-items-center">
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
              />
              <span className="sr-only">{t('upgradePage.opening')}</span>
            </span>
          )}
        </button>
        <button type="button" className={upgradeButtons.quiet} onClick={onChangePlan}>
          {t('upgradeFailed.changePlan')}
        </button>
      </div>

      <p className={cn('mt-8 border-t border-white/7 pt-5 text-[13px] leading-relaxed', muted)}>
        {rich(t('upgradeFailed.pending'), {
          link: (
            <a
              href={support}
              className="text-[#ededef] underline decoration-white/25 underline-offset-2 hover:decoration-white/60"
            >
              {t('upgradeFailed.emailUs', { email: SUPPORT_EMAIL })}
            </a>
          ),
        })}
      </p>
    </main>
  );
}

/** The ticket's theme words, set to this page's dark colours whatever the editor's theme. */
const TICKET_COLOURS = {
  '--color-card': '#16161a',
  '--color-card-foreground': '#ededef',
  '--color-background': '#101012',
  '--color-foreground': '#ededef',
  '--color-muted-foreground': '#9f9fa9',
  '--color-primary': '#4d84fd',
  '--color-border': 'rgb(255 255 255 / 0.1)',
} as CSSProperties;

/**
 * Back from Polar, before its confirmation has reached us: what has happened
 * so far, in three steps, the middle one under way.
 */
export function UpgradeConfirming() {
  const t = useT();
  const steps: { key: TranslationKey; state: 'done' | 'now' | 'next' }[] = [
    { key: 'upgradeDone.stepPaid', state: 'done' },
    { key: 'upgradeDone.stepConfirm', state: 'now' },
    { key: 'upgradeDone.stepOn', state: 'next' },
  ];
  return (
    <main aria-live="polite" className="mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-6 md:pt-14">
      <p className={cn('text-[13px]', muted)}>{t('upgradeCheckout.breadcrumb')}</p>
      <h1 className="mt-2 text-xl font-semibold tracking-[-0.015em]">
        {t('upgradeDone.waitingTitle')}
      </h1>
      <p className={cn('mt-1.5 max-w-lg', muted)}>{t('upgradeDone.waitingLead')}</p>
      <ol className="mt-8 overflow-hidden rounded-lg border border-white/10 bg-[#141416]">
        {steps.map((step) => (
          <li
            key={step.key}
            className={cn(
              'flex items-center gap-3 border-t border-white/7 px-5 py-4 first:border-t-0',
              step.state === 'next' && muted,
            )}
          >
            {step.state === 'done' && (
              <span className="grid size-5 place-items-center rounded-full bg-[#135dfc] text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
            {step.state === 'now' && (
              <span
                aria-hidden="true"
                className="size-5 animate-spin rounded-full border-2 border-white/15 border-t-[#4d84fd]"
              />
            )}
            {step.state === 'next' && (
              <span aria-hidden="true" className="size-5 rounded-full border border-white/15" />
            )}
            {t(step.key)}
          </li>
        ))}
      </ol>
    </main>
  );
}

/** The plan is on: the ticket, and the way back to the board. */
export function UpgradeConfirmed({
  title,
  subtitle,
  details,
  orderNumber,
  backTo,
}: {
  title: string;
  subtitle: string;
  details: TicketDetail[];
  orderNumber: string;
  backTo: UpgradeBack;
}) {
  const t = useT();
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-8 px-4 pt-8 pb-16 sm:px-6 md:pt-14">
      <div style={TICKET_COLOURS} className="w-full [&>div]:mx-auto">
        <AnimatedTicket
          title={title}
          subtitle={subtitle}
          details={details}
          barcodeValue={orderNumber}
          barcodeLabel={t('upgradeDone.barcode')}
          className="ring-1 ring-white/10"
          // The page's Inter, not the editor's own face the ticket sets.
          style={{ fontFamily: 'inherit' }}
        />
      </div>
      <UpgradeBackLink to={backTo} className={cn(upgradeButtons.primary, 'w-full max-w-sm')}>
        {t(backLabel(backTo))}
      </UpgradeBackLink>
    </main>
  );
}
