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
  /** For a per-member price: the seats to start with. */
  seats?: number;
  /** The fewest seats the buyer may choose: the workspace's members. */
  minSeats?: number;
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

/** The card a customer pays with. Only what may be shown: never the full number. */
export interface SavedCard {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

/** One charge on a subscription, as the invoice list shows it. */
export interface ProviderInvoice {
  id: string;
  createdAt: Date;
  /** In cents, tax included. */
  totalCents: number;
  currency: string;
  /** `paid`, `refunded`, `partially_refunded`, `pending` or `void`. */
  status: string;
}

/**
 * How a per-member subscription's seats are brought to the member count:
 * more seats at once, charged for the rest of the period on the next invoice;
 * fewer from the next period, never refunded; or a waiting change dropped.
 */
export type SeatChange =
  | { kind: 'add-now'; seats: number }
  | { kind: 'reduce-at-renewal'; seats: number }
  | { kind: 'drop-pending' };

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
  /**
   * A short-lived link into the provider's own billing portal for a customer,
   * where they change their card, download invoices and cancel.
   */
  portalUrl(customerId: string, returnUrl: string): Promise<string>;
  /** The customer's default card, or null when none is saved. */
  savedCard(customerId: string): Promise<SavedCard | null>;
  /** Every charge on these subscriptions, newest first. */
  invoices(subscriptionIds: string[]): Promise<ProviderInvoice[]>;
  /**
   * Every subscription the provider holds for a workspace, by the
   * `workspace_id` its checkout copied onto it. How a missed webhook is made
   * up for: asked directly instead of waiting to be told.
   */
  workspaceSubscriptions(workspaceId: string): Promise<ProviderSubscription[]>;
  /** The subscription an order was for, or null for an order that is not ours. */
  orderSubscription(orderId: string): Promise<string | null>;
  /** A short-lived link to the order's invoice PDF, or null while there is none. */
  invoiceUrl(orderId: string): Promise<string | null>;
  /** Takes back a cancellation at the end of the period. */
  resume(subscriptionId: string): Promise<ProviderSubscription>;
  /** Stops it renewing: it runs to the end of the paid period, then ends. */
  cancelAtPeriodEnd(subscriptionId: string): Promise<ProviderSubscription>;
  /** The seats paid for now, and any change waiting for the next period. */
  seatsOf(subscriptionId: string): Promise<{ seats: number | null; pendingSeats: number | null }>;
  /** Carries out a seat change worked out by `seatChange`. */
  changeSeats(subscriptionId: string, change: SeatChange): Promise<ProviderSubscription>;
  /** Checks the signature, then reads the event. Throws `BillingWebhookRejected`. */
  readWebhook(body: Buffer, headers: Record<string, string>): Promise<BillingWebhook>;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
