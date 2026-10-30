import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PLAN_NAMES, PLAN_PRICES, SUPPORT_EMAIL } from '@canvasflow/types';
import { useT } from '../i18n';
import { forgetUsage } from '../diagrams/usage-cache';
import { fetchCurrentAccount } from '../profile/current-account';
import { announceWorkspaceChanged } from '../workspace/workspace-events';
import type { TicketDetail } from '@/components/ui/ticket-confirmation-card';
import { billingWorkspace, checkoutStatus, type CheckoutStatus } from './billing-api';
import { boardAddress, formatDay, formatMoney } from './format';
import { UpgradeBackLink, backLabel, type UpgradeBack } from './upgrade-back';
import {
  UpgradeConfirmed,
  UpgradeConfirming,
  UpgradeFrame,
  UpgradeNotice,
  upgradeButtons,
} from './UpgradeViews';

/** How often to ask, and for how long, before saying it is taking a while. */
const POLL_MS = 2000;
const GIVE_UP_MS = 60_000;

type Stage =
  | { kind: 'waiting' }
  | { kind: 'done'; status: CheckoutStatus; workspace: string }
  | { kind: 'slow' }
  | { kind: 'missing' };

/**
 * `/upgrade/complete`: where Polar sends someone back after paying.
 *
 * Polar returns them before its confirmation reaches the gateway, so the page
 * asks every couple of seconds until the workspace is on the plan, then shows
 * what was bought. The board's kept AI count is dropped on the way, so the
 * new limit is what the board shows when they go back to it.
 */
export function UpgradeCompletePage() {
  const t = useT();
  const [params] = useSearchParams();
  const checkoutId = params.get('checkout_id');
  const from = params.get('from');
  const [stage, setStage] = useState<Stage>(checkoutId ? { kind: 'waiting' } : { kind: 'missing' });
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void fetchCurrentAccount()
      .then((account) => setUserId(account.id))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.title = `${t('upgradeDone.waitingTitle')} — CanvasFlow`;
  }, [t]);

  useEffect(() => {
    if (!checkoutId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    const ask = async () => {
      try {
        const status = await checkoutStatus(checkoutId);
        if (stopped) return;
        if (status.done) {
          const workspace = await billingWorkspace(status.workspaceId)
            .then((one) => one.name)
            .catch(() => '');
          if (stopped) return;
          setStage({ kind: 'done', status, workspace });
          announceWorkspaceChanged(status.workspaceId);
          return;
        }
      } catch {
        // Asked again below; a checkout that never resolves ends as slow.
      }
      if (stopped) return;
      if (Date.now() - started >= GIVE_UP_MS) {
        setStage({ kind: 'slow' });
        return;
      }
      timer = setTimeout(() => void ask(), POLL_MS);
    };
    void ask();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkoutId]);

  // The board's kept AI count was read under the old plan.
  useEffect(() => {
    if (stage.kind === 'done' && userId && from) forgetUsage(userId, from);
  }, [stage.kind, userId, from]);

  // Paid, so back to work: the board it was bought from, or the editor's home.
  const backTo = boardAddress(from);

  return (
    <UpgradeFrame backTo={backTo}>
      {stage.kind === 'waiting' && <UpgradeConfirming />}

      {stage.kind === 'done' && checkoutId && (
        <Receipt stage={stage} checkoutId={checkoutId} backTo={backTo} />
      )}

      {stage.kind === 'slow' && (
        <UpgradeNotice
          title={t('upgradeDone.slowTitle')}
          lead={t('upgradeDone.slowLead', { email: SUPPORT_EMAIL })}
          action={
            <UpgradeBackLink to={backTo} className={upgradeButtons.primary}>
              {t(backLabel(backTo))}
            </UpgradeBackLink>
          }
        />
      )}

      {stage.kind === 'missing' && (
        <UpgradeNotice
          title={t('upgradeDone.missing')}
          action={
            <UpgradeBackLink to={backTo} className={upgradeButtons.quiet}>
              {t(backLabel(backTo))}
            </UpgradeBackLink>
          }
        />
      )}
    </UpgradeFrame>
  );
}

function Receipt({
  stage,
  checkoutId,
  backTo,
}: {
  stage: Extract<Stage, { kind: 'done' }>;
  checkoutId: string;
  backTo: UpgradeBack;
}) {
  const t = useT();
  const { status, workspace } = stage;
  const sub = status.subscription;
  const plan = PLAN_NAMES[status.plan];
  const price = PLAN_PRICES[status.plan];
  const cycle = sub?.cycle ?? 'monthly';
  const seats = price?.per === 'member' ? (sub?.seats ?? 1) : 1;
  const amount = price ? (cycle === 'monthly' ? price.monthly : price.yearly * 12) * seats : null;

  const details: TicketDetail[] = [
    {
      label: t('upgradeDone.plan'),
      value: t('upgradePage.lineItem', {
        plan,
        cycle: t(cycle === 'monthly' ? 'upgradePage.monthly' : 'upgradePage.yearly'),
      }),
    },
    ...(amount !== null
      ? [{ label: t('upgradeDone.paid'), value: formatMoney(amount), mono: true }]
      : []),
    ...(price?.per === 'member'
      ? [{ label: t('upgradePage.seats'), value: String(seats), mono: true }]
      : []),
    { label: t('upgradeDone.paidOn'), value: formatDay(new Date()) },
    ...(sub?.renewsAt
      ? [{ label: t('upgradeDone.renews'), value: formatDay(new Date(sub.renewsAt)) }]
      : []),
  ];

  return (
    <UpgradeConfirmed
      title={t('upgradeDone.ticketTitle', { plan })}
      subtitle={
        workspace
          ? t('upgradeDone.ticketLead', { workspace, plan })
          : t('upgradeDone.ticketLeadShort', { plan })
      }
      details={details}
      orderNumber={orderNumber(checkoutId)}
      backTo={backTo}
    />
  );
}

/** The checkout's id, cut to a short order number a person could read out. */
function orderNumber(checkoutId: string): string {
  return checkoutId.replace(/-/g, '').slice(0, 12).toUpperCase();
}
