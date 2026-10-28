import type { SubscriptionSnapshot } from '@canvasflow/db';
import {
  PLAN_PRICES,
  isBillingCycle,
  isPurchasablePlan,
  type BillingCycle,
  type PurchasablePlan,
} from '@canvasflow/types';
import type { CatalogueProduct, ProviderSubscription } from './billing-provider.js';

/**
 * The rules between our plans and the provider's catalogue, kept free of the
 * provider and the database so they can be tested as plain functions.
 */

/** What the catalogue must charge for a plan, in cents: the advertised price. */
export function advertisedPrice(
  plan: PurchasablePlan,
  cycle: BillingCycle,
): { kind: 'fixed' | 'seats'; cents: number } {
  const price = PLAN_PRICES[plan];
  if (!price) throw new Error(`No listed price for ${plan}`);
  const monthly = cycle === 'monthly' ? price.monthly : price.yearly * 12;
  return { kind: price.per === 'member' ? 'seats' : 'fixed', cents: Math.round(monthly * 100) };
}

export type ProductPick = { ok: true; product: CatalogueProduct } | { ok: false; problem: string };

/**
 * The one product on sale for this plan and cycle, provided it charges exactly
 * what the pricing page says. A mismatch is refused rather than sold: somebody
 * shown one price must never be charged another.
 */
export function pickProduct(
  products: readonly CatalogueProduct[],
  plan: PurchasablePlan,
  cycle: BillingCycle,
): ProductPick {
  const matches = products.filter(
    (product) => !product.archived && product.plan === plan && product.cycle === cycle,
  );
  if (matches.length === 0) return { ok: false, problem: `no product for ${plan}/${cycle}` };
  if (matches.length > 1)
    return { ok: false, problem: `${matches.length} products for ${plan}/${cycle}` };

  const product = matches[0]!;
  const interval = cycle === 'monthly' ? 'month' : 'year';
  if (product.interval !== interval) {
    return { ok: false, problem: `${plan}/${cycle} charges every ${product.interval ?? 'once'}` };
  }
  const expected = advertisedPrice(plan, cycle);
  const actual =
    product.price.kind === 'fixed'
      ? { kind: 'fixed', cents: product.price.cents }
      : product.price.kind === 'seats'
        ? { kind: 'seats', cents: product.price.centsPerSeat }
        : null;
  if (!actual || actual.kind !== expected.kind || actual.cents !== expected.cents) {
    return {
      ok: false,
      problem: `${plan}/${cycle} is priced ${actual ? `${actual.kind} ${actual.cents}` : 'oddly'}, expected ${expected.kind} ${expected.cents}`,
    };
  }
  return { ok: true, product };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The workspace id a subscription carries in its metadata, if it is one. */
export function workspaceIdIn(subscription: ProviderSubscription): string | null {
  const value = subscription.workspaceId;
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

/**
 * What to keep of a subscription for a workspace, or why it cannot be kept:
 * a product without our `plan` and `cycle` metadata is not one of ours.
 */
export function snapshotOf(
  subscription: ProviderSubscription,
  workspaceId: string,
): { ok: true; snapshot: SubscriptionSnapshot } | { ok: false; problem: string } {
  const { plan, cycle } = subscription;
  if (!isPurchasablePlan(plan) || !isBillingCycle(cycle)) {
    return {
      ok: false,
      problem: `subscription ${subscription.id} is for a product without plan/cycle metadata`,
    };
  }
  return {
    ok: true,
    snapshot: {
      id: subscription.id,
      workspaceId,
      customerId: subscription.customerId,
      plan,
      cycle,
      status: subscription.status,
      seats: subscription.seats,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      endedAt: subscription.endedAt,
      sourceModifiedAt: subscription.modifiedAt,
    },
  };
}
