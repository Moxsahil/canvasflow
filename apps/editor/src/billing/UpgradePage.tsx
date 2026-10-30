import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PLAN_PRICES } from '@canvasflow/types';
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
import { useCheckoutChoices } from './checkout-choices';
import { UpgradeBackLink, backLabel, useUpgradeBack } from './upgrade-back';
import {
  UpgradeAlreadyPaying,
  UpgradeChoose,
  UpgradeFrame,
  UpgradeNotice,
  UpgradePaymentFailed,
  UpgradeSkeleton,
  upgradeButtons,
} from './UpgradeViews';

type Load =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'no-workspace' }
  | { kind: 'failed' }
  | { kind: 'ready'; email: string | null; workspace: BillingWorkspace };

/**
 * `/upgrade`: choosing a plan for a workspace beside what it costs, then on
 * to Polar to pay.
 *
 * The address may name the workspace (`?workspace=`), the plan, period and
 * seats (`?plan=`, `?cycle=`, `?seats=`, kept there as they change) and where
 * the person came from (`?from=`, `?via=`, read by the back link). Without a
 * workspace it takes the first one the person owns.
 */
export function UpgradePage() {
  const t = useT();
  const [params] = useSearchParams();
  const from = params.get('from');
  const askedWorkspace = params.get('workspace');
  const { plan, cycle, seats: askedSeats, setPlan, setCycle, setSeats } = useCheckoutChoices();

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When the payment page wouldn't open: shown in place of the choices.
  const [failedAt, setFailedAt] = useState<Date | null>(null);

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

  const backTo = useUpgradeBack(params);
  // Never fewer seats than members, whatever the address says.
  const seats = load.kind === 'ready' ? Math.max(1, load.workspace.members, askedSeats ?? 0) : 1;
  const price = PLAN_PRICES[plan]!;
  const total =
    (cycle === 'monthly' ? price.monthly : price.yearly * 12) *
    (price.per === 'member' ? seats : 1);

  const pay = async (workspace: BillingWorkspace) => {
    setBusy(true);
    setError(null);
    try {
      const done = new URL('/upgrade/complete', window.location.origin);
      if (from) done.searchParams.set('from', from);
      const url = await startCheckout({
        workspaceId: workspace.id,
        plan,
        cycle,
        returnTo: done.toString(),
        // Leaving Polar without paying comes back here, as it was left.
        backTo: window.location.href,
        ...(price.per === 'member' ? { seats } : {}),
      });
      window.location.assign(url);
    } catch (caught) {
      setBusy(false);
      // A refusal the gateway explains stays beside the button; anything else
      // (no answer, Polar down) means the payment page never opened.
      if (caught instanceof BillingApiError && caught.status < 500) setError(caught.message);
      else setFailedAt(new Date());
    }
  };

  const choosing = load.kind === 'ready' && load.workspace.plan === 'free' && !failedAt;

  return (
    <UpgradeFrame backTo={backTo} bare={load.kind === 'loading' || choosing}>
      {load.kind === 'loading' && <UpgradeSkeleton />}
      {load.kind === 'signed-out' && (
        <UpgradeNotice
          title={t('upgradePage.signedOutTitle')}
          lead={t('upgradePage.signedOutLead')}
          action={
            <a
              className={upgradeButtons.primary}
              href={new URL('/login?next=/open', env.VITE_WEB_URL).toString()}
            >
              {t('upgradePage.signIn')}
            </a>
          }
        />
      )}
      {load.kind === 'no-workspace' && (
        <UpgradeNotice
          title={t('upgradePage.noWorkspaceTitle')}
          lead={t('upgradePage.noWorkspaceLead')}
          action={
            <UpgradeBackLink className={upgradeButtons.quiet} to={backTo}>
              {t(backLabel(backTo))}
            </UpgradeBackLink>
          }
        />
      )}
      {load.kind === 'failed' && (
        <UpgradeNotice
          title={t('upgradePage.loadFailed')}
          action={
            <button type="button" className={upgradeButtons.quiet} onClick={() => void read()}>
              {t('common.tryAgain')}
            </button>
          }
        />
      )}
      {load.kind === 'ready' && load.workspace.plan !== 'free' && (
        <UpgradeAlreadyPaying
          workspaceName={load.workspace.name}
          plan={load.workspace.plan}
          renewsAt={
            load.workspace.subscription?.renewsAt
              ? new Date(load.workspace.subscription.renewsAt)
              : null
          }
          cancelAtPeriodEnd={load.workspace.subscription?.cancelAtPeriodEnd ?? false}
          backTo={backTo}
        />
      )}
      {load.kind === 'ready' && load.workspace.plan === 'free' && !failedAt && (
        <UpgradeChoose
          workspaceName={load.workspace.name}
          email={load.email}
          owner={load.workspace.role === 'owner'}
          members={load.workspace.members}
          backTo={backTo}
          plan={plan}
          cycle={cycle}
          seats={seats}
          busy={busy}
          error={error}
          onPlan={setPlan}
          onCycle={setCycle}
          onSeats={setSeats}
          onPay={() => void pay(load.workspace)}
        />
      )}
      {load.kind === 'ready' && load.workspace.plan === 'free' && failedAt && (
        <UpgradePaymentFailed
          workspaceName={load.workspace.name}
          reason="not-opened"
          plan={plan}
          cycle={cycle}
          amount={total}
          attemptedAt={failedAt}
          // No checkout was made, so the workspace is what support looks up.
          reference={load.workspace.id}
          busy={busy}
          onRetry={() => void pay(load.workspace)}
          onChangePlan={() => setFailedAt(null)}
        />
      )}
    </UpgradeFrame>
  );
}
