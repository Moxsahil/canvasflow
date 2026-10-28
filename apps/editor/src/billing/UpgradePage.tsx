import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  PLAN_ALLOWANCES,
  PLAN_NAMES,
  PLAN_PRICES,
  SUPPORT_EMAIL,
  isBillingCycle,
  isPurchasablePlan,
  type BillingCycle,
  type PurchasablePlan,
} from '@canvasflow/types';
import { env } from '../lib/env';
import { useT } from '../i18n';
import { fetchCurrentAccount } from '../profile/current-account';
import { listWorkspaces } from '../workspace/workspace-api';
import {
  BillingApiError,
  billingWorkspace,
  startCheckout,
  type BillingWorkspace,
} from './billing-api';
import { UpgradeShell, boardAddress, formatDay, formatMoney } from './UpgradeShell';

type Load =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'no-workspace' }
  | { kind: 'failed' }
  | { kind: 'ready'; email: string | null; workspace: BillingWorkspace };

const PLAN_ORDER: PurchasablePlan[] = ['pro', 'team'];

/** The yearly discount on a plan's monthly price, rounded down so it is never overstated. */
function yearlySaving(plan: PurchasablePlan): number {
  const price = PLAN_PRICES[plan]!;
  return Math.floor((1 - price.yearly / price.monthly) * 100);
}

/** One period on from today: when a plan bought now first renews. */
function renewalFrom(now: Date, cycle: BillingCycle): Date {
  const next = new Date(now);
  if (cycle === 'monthly') next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

/**
 * `/upgrade`: choosing a plan for a workspace, with an order summary beside
 * it, then on to Polar to pay.
 *
 * The address may name the workspace (`?workspace=`), the plan and period the
 * pricing page showed (`?plan=`, `?cycle=`) and the board to go back to
 * (`?from=`). Without a workspace it takes the first one the person owns.
 */
export function UpgradePage() {
  const t = useT();
  const [params] = useSearchParams();
  const from = params.get('from');
  const askedWorkspace = params.get('workspace');
  const askedPlan = params.get('plan');
  const askedCycle = params.get('cycle');

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [plan, setPlan] = useState<PurchasablePlan>(
    isPurchasablePlan(askedPlan) ? askedPlan : 'pro',
  );
  const [cycle, setCycle] = useState<BillingCycle>(
    isBillingCycle(askedCycle) ? askedCycle : 'yearly',
  );
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const account = await fetchCurrentAccount().catch(() => null);
      if (!account || account.isGuest) {
        setLoad({ kind: 'signed-out' });
        return;
      }
      let id = askedWorkspace;
      if (!id) {
        const all = await listWorkspaces();
        id = (all.find((one) => one.role === 'owner') ?? all[0])?.id ?? null;
      }
      if (!id) {
        setLoad({ kind: 'no-workspace' });
        return;
      }
      const workspace = await billingWorkspace(id);
      setSeats(Math.max(1, workspace.members));
      setLoad({ kind: 'ready', email: account.email, workspace });
    } catch (caught) {
      setLoad(
        caught instanceof BillingApiError && caught.status === 401
          ? { kind: 'signed-out' }
          : { kind: 'failed' },
      );
    }
  }, [askedWorkspace]);

  useEffect(() => {
    void read();
  }, [read]);

  useEffect(() => {
    document.title = `${t('upgradePage.title')} — CanvasFlow`;
  }, [t]);

  const backTo = boardAddress(from);
  const email = load.kind === 'ready' ? load.email : null;

  return (
    <UpgradeShell backTo={backTo} email={email}>
      {load.kind === 'loading' && (
        <main className="up-narrow" aria-busy="true">
          <span className="up-spinner" aria-hidden="true" />
          <p className="up-lead">{t('common.loading')}</p>
        </main>
      )}
      {load.kind === 'signed-out' && (
        <Notice
          title={t('upgradePage.signedOutTitle')}
          lead={t('upgradePage.signedOutLead')}
          action={
            <a
              className="up-primary"
              href={new URL('/login?next=/open', env.VITE_WEB_URL).toString()}
            >
              {t('upgradePage.signIn')}
            </a>
          }
        />
      )}
      {load.kind === 'no-workspace' && (
        <Notice
          title={t('upgradePage.noWorkspaceTitle')}
          lead={t('upgradePage.noWorkspaceLead')}
          action={
            <Link className="up-secondary" to={backTo}>
              {t('upgradePage.backToBoard')}
            </Link>
          }
        />
      )}
      {load.kind === 'failed' && (
        <Notice
          title={t('upgradePage.loadFailed')}
          lead=""
          action={
            <button type="button" className="up-secondary" onClick={() => void read()}>
              {t('common.tryAgain')}
            </button>
          }
        />
      )}
      {load.kind === 'ready' && load.workspace.plan !== 'free' && (
        <AlreadyPaying workspace={load.workspace} backTo={backTo} />
      )}
      {load.kind === 'ready' && load.workspace.plan === 'free' && (
        <Choose
          workspace={load.workspace}
          plan={plan}
          cycle={cycle}
          seats={seats}
          busy={busy}
          error={error}
          onPlan={setPlan}
          onCycle={setCycle}
          onSeats={setSeats}
          onPay={async () => {
            setBusy(true);
            setError(null);
            try {
              const back = new URL('/upgrade/complete', window.location.origin);
              if (from) back.searchParams.set('from', from);
              const url = await startCheckout({
                workspaceId: load.workspace.id,
                plan,
                cycle,
                returnTo: back.toString(),
                ...(PLAN_PRICES[plan]?.per === 'member' ? { seats } : {}),
              });
              window.location.assign(url);
            } catch (caught) {
              setBusy(false);
              setError(
                caught instanceof BillingApiError ? caught.message : t('upgradePage.failed'),
              );
            }
          }}
        />
      )}
    </UpgradeShell>
  );
}

function Notice({ title, lead, action }: { title: string; lead: string; action: React.ReactNode }) {
  return (
    <main className="up-narrow">
      <h1 className="up-title">{title}</h1>
      {lead && <p className="up-lead">{lead}</p>}
      <div className="up-actions">{action}</div>
    </main>
  );
}

function AlreadyPaying({ workspace, backTo }: { workspace: BillingWorkspace; backTo: string }) {
  const t = useT();
  const sub = workspace.subscription;
  const date = sub?.renewsAt ? formatDay(new Date(sub.renewsAt)) : null;
  return (
    <main className="up-narrow">
      <h1 className="up-title">
        {t('upgradePage.alreadyTitle', {
          workspace: workspace.name,
          plan: PLAN_NAMES[workspace.plan],
        })}
      </h1>
      {date && (
        <p className="up-lead">
          {sub?.cancelAtPeriodEnd
            ? t('upgradePage.alreadyEnds', { date })
            : t('upgradePage.alreadyRenews', { date })}
        </p>
      )}
      <p className="up-lead">{t('upgradePage.alreadyChange', { email: SUPPORT_EMAIL })}</p>
      <div className="up-actions">
        <Link className="up-primary" to={backTo}>
          {t('upgradePage.backToBoard')}
        </Link>
      </div>
    </main>
  );
}

interface ChooseProps {
  workspace: BillingWorkspace;
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

function Choose({
  workspace,
  plan,
  cycle,
  seats,
  busy,
  error,
  onPlan,
  onCycle,
  onSeats,
  onPay,
}: ChooseProps) {
  const t = useT();
  const owner = workspace.role === 'owner';
  const price = PLAN_PRICES[plan]!;
  const perMember = price.per === 'member';
  const quantity = perMember ? seats : 1;
  const unit = cycle === 'monthly' ? price.monthly : price.yearly * 12;
  const total = unit * quantity;
  const renews = useMemo(() => formatDay(renewalFrom(new Date(), cycle)), [cycle]);
  const minSeats = Math.max(1, workspace.members);

  return (
    <main className="up-main">
      <section className="up-choices">
        <div className="up-intro">
          <p className="up-eyebrow">{t('upgradePage.eyebrow', { workspace: workspace.name })}</p>
          <h1 className="up-title">{t('upgradePage.title')}</h1>
          <p className="up-lead">{t('upgradePage.lead')}</p>
        </div>

        <div className="up-group" role="radiogroup" aria-labelledby="up-plan-legend">
          <span id="up-plan-legend" className="up-legend">
            {t('upgradePage.planLegend')}
          </span>
          {PLAN_ORDER.map((id) => {
            const p = PLAN_PRICES[id]!;
            const allowance = PLAN_ALLOWANCES[id];
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={plan === id}
                className="up-option"
                onClick={() => onPlan(id)}
              >
                <span className="up-radio" aria-hidden="true" />
                <span className="up-option-body">
                  <span className="up-option-name">{PLAN_NAMES[id]}</span>
                  <span className="up-option-line">
                    {t(id === 'pro' ? 'upgradePage.proLine' : 'upgradePage.teamLine')}
                  </span>
                  <span className="up-option-limits">
                    {id === 'pro'
                      ? t('upgradePage.proLimits', {
                          diagrams: allowance.diagramsPerMonth,
                          storage: allowance.storageGb,
                          history: allowance.historyDays ?? 0,
                        })
                      : t('upgradePage.teamLimits', {
                          diagrams: allowance.diagramsPerMonth,
                          storage: allowance.storageGb,
                        })}
                  </span>
                </span>
                <span className="up-option-price">
                  <span className="up-option-amount up-mono">
                    {formatMoney(cycle === 'monthly' ? p.monthly : p.yearly).replace('.00', '')}
                  </span>
                  <span className="up-option-unit">
                    {t(p.per === 'member' ? 'upgradePage.perMemberMonth' : 'upgradePage.perMonth')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="up-group" role="radiogroup" aria-labelledby="up-period-legend">
          <span id="up-period-legend" className="up-legend">
            {t('upgradePage.periodLegend')}
          </span>
          <div className="up-cycles">
            {(['monthly', 'yearly'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={cycle === id}
                className="up-cycle"
                onClick={() => onCycle(id)}
              >
                <span>
                  <span className="up-cycle-name">
                    {t(id === 'monthly' ? 'upgradePage.monthly' : 'upgradePage.yearly')}
                  </span>
                  <span className="up-cycle-note">
                    {t(id === 'monthly' ? 'upgradePage.monthlyNote' : 'upgradePage.yearlyNote')}
                  </span>
                </span>
                {id === 'yearly' && (
                  <span className="up-cycle-tag up-mono">
                    {t('upgradePage.yearlyTag', { percent: yearlySaving(plan) })}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {perMember && (
          <div className="up-seats">
            <div>
              <div>{t('upgradePage.seats')}</div>
              <div className="up-seats-hint">{t('upgradePage.seatsHint', { n: minSeats })}</div>
            </div>
            <div className="up-stepper">
              <button
                type="button"
                aria-label={t('upgradePage.fewerSeats')}
                disabled={seats <= minSeats}
                onClick={() => onSeats(Math.max(minSeats, seats - 1))}
              >
                −
              </button>
              <output className="up-mono" aria-live="polite">
                {seats}
              </output>
              <button
                type="button"
                aria-label={t('upgradePage.moreSeats')}
                disabled={seats >= 1000}
                onClick={() => onSeats(Math.min(1000, seats + 1))}
              >
                +
              </button>
            </div>
          </div>
        )}
      </section>

      <aside className="up-summary" aria-labelledby="up-summary-title">
        <h2 id="up-summary-title">{t('upgradePage.summary')}</h2>
        <div className="up-lines">
          <div className="up-line">
            <span>
              {t('upgradePage.lineItem', {
                plan: PLAN_NAMES[plan],
                cycle: t(cycle === 'monthly' ? 'upgradePage.monthly' : 'upgradePage.yearly'),
              })}
            </span>
            <span className="up-mono">{formatMoney(total)}</span>
          </div>
          <div className="up-line up-line-muted">
            <span>
              {perMember
                ? t('upgradePage.seatsLine', { n: seats, price: formatMoney(unit) })
                : t('upgradePage.oneWorkspace')}
            </span>
          </div>
          <div className="up-line up-line-muted">
            <span>{t('upgradePage.tax')}</span>
            <span>{t('upgradePage.taxValue')}</span>
          </div>
        </div>
        <div className="up-rule" />
        <div className="up-due">
          <span style={{ fontWeight: 600 }}>{t('upgradePage.dueToday')}</span>
          <span className="up-due-amount up-mono">{formatMoney(total)}</span>
        </div>
        <p className="up-small">
          {t('upgradePage.renews', { date: renews, amount: formatMoney(total) })}
        </p>
        {owner ? (
          <button type="button" className="up-primary" disabled={busy} onClick={onPay}>
            {busy ? t('upgradePage.opening') : t('upgradePage.pay')}
          </button>
        ) : (
          <p className="up-small">{t('upgradePage.ownerOnly')}</p>
        )}
        {error && (
          <p className="up-error" role="alert">
            {error}
          </p>
        )}
        <p className="up-note">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
          <span>
            {t('upgradePage.secure')}{' '}
            <a href={new URL('/refunds', env.VITE_WEB_URL).toString()}>
              {t('upgradePage.refundPolicy')}
            </a>
          </span>
        </p>
      </aside>
    </main>
  );
}
