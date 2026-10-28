import type { WorkspacePlan } from './plans.js';

/**
 * Buying a plan: which plans can be bought, and how often they are paid for.
 *
 * Each pair of plan and cycle is one product in the payment provider's
 * catalogue, found there by the `plan` and `cycle` metadata on the product.
 */

/** The plans a workspace owner can buy themselves. Enterprise is agreed with us. */
export const PURCHASABLE_PLANS = ['pro', 'team'] as const;

export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

export const BILLING_CYCLES = ['monthly', 'yearly'] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number];

export function isPurchasablePlan(value: unknown): value is PurchasablePlan {
  return typeof value === 'string' && (PURCHASABLE_PLANS as readonly string[]).includes(value);
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === 'string' && (BILLING_CYCLES as readonly string[]).includes(value);
}

/** Team before Pro: when a workspace somehow pays for both, it gets the larger. */
export function largerPlan(a: WorkspacePlan, b: WorkspacePlan): WorkspacePlan {
  const rank: Record<WorkspacePlan, number> = { free: 0, pro: 1, team: 2, enterprise: 3 };
  return rank[a] >= rank[b] ? a : b;
}
