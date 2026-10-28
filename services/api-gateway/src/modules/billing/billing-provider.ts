/**
 * Whatever takes the payments.
 *
 * An interface so the billing rules can be run against a stand-in: which
 * product a plan is, whether its price is the one we advertise, and what a
 * subscription's state means for a workspace are what need testing, and none
 * of them should cost a request to the provider.
 */

/** A product in the provider's catalogue, reduced to what the rules read. */
export interface CatalogueProduct {
  id: string;
  archived: boolean;
  /** The product's `plan` and `cycle` metadata, as set in the provider's dashboard. */
  plan: unknown;
  cycle: unknown;
  /** How often it charges: `month`, `year`, or null for a one-time product. */
  interval: string | null;
  /** In cents. A seat price is per seat. */
  price:
    | { kind: 'fixed'; cents: number }
    | { kind: 'seats'; centsPerSeat: number }
    | { kind: 'other' };
}

export interface CheckoutRequest {
  productId: string;
  workspaceId: string;
  userId: string;
  email: string;
  name?: string;
  /** For a per-member price: the members the workspace has now, and the fewest it may buy. */
  seats?: number;
  requireBillingAddress: boolean;
  successUrl: string;
  returnUrl: string;
}

/** A subscription as the provider describes it in a webhook. */
export interface ProviderSubscription {
  id: string;
  customerId: string;
  status: string;
  seats: number | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
  /** When the provider last changed it; orders snapshots that arrive out of turn. */
  modifiedAt: Date;
  checkoutId: string | null;
  /** The subscription's own metadata, copied from the checkout that started it. */
  workspaceId: unknown;
  /** The product's `plan` and `cycle` metadata. */
  plan: unknown;
  cycle: unknown;
}

export type BillingWebhook =
  | { kind: 'subscription'; type: string; subscription: ProviderSubscription }
  | { kind: 'ignored'; type: string };

/** Why a webhook was turned away: not from the provider, or not readable. */
export class BillingWebhookRejected extends Error {
  constructor(readonly reason: 'signature' | 'payload') {
    super(`Billing webhook rejected: ${reason}`);
  }
}

export interface BillingProvider {
  /** Every product that is still on sale. */
  products(): Promise<CatalogueProduct[]>;
  createCheckout(request: CheckoutRequest): Promise<{ id: string; url: string }>;
  /** Checks the signature, then reads the event. Throws `BillingWebhookRejected`. */
  readWebhook(body: Buffer, headers: Record<string, string>): Promise<BillingWebhook>;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
