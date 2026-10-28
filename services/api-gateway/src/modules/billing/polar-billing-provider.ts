import { createPolar, webhooks, type Polar, type models } from '@polar-sh/sdk/2026-10';
import {
  BillingWebhookRejected,
  type BillingProvider,
  type BillingWebhook,
  type CatalogueProduct,
  type CheckoutRequest,
  type ProviderSubscription,
} from './billing-provider.js';

/** The catalogue is a handful of products; one page holds them all. */
const PRODUCT_PAGE = 100;

/**
 * Billing through Polar, which sells the plans as merchant of record.
 *
 * Only this file knows Polar's shapes. Everything it hands back is in the
 * terms of `billing-provider.ts`, so the rules never read a Polar object.
 */
export class PolarBillingProvider implements BillingProvider {
  private readonly polar: Polar;

  constructor(
    accessToken: string,
    environment: 'sandbox' | 'production',
    private readonly webhookSecret: string | undefined,
  ) {
    this.polar = createPolar({ accessToken, environment, timeout: 20 });
  }

  async products(): Promise<CatalogueProduct[]> {
    const page = await this.polar.products.list({ is_archived: false, limit: PRODUCT_PAGE });
    return page.items.map(toCatalogueProduct);
  }

  async createCheckout(request: CheckoutRequest): Promise<{ id: string; url: string }> {
    const checkout = await this.polar.checkouts.create({
      products: [request.productId],
      external_customer_id: request.userId,
      customer_email: request.email,
      ...(request.name ? { customer_name: request.name } : {}),
      // Copied to the subscription, which is how its webhooks find the workspace.
      metadata: { workspace_id: request.workspaceId },
      ...(request.seats ? { seats: request.seats, min_seats: request.seats } : {}),
      allow_discount_codes: false,
      allow_trial: false,
      require_billing_address: request.requireBillingAddress,
      success_url: request.successUrl,
      return_url: request.returnUrl,
    });
    return { id: checkout.id, url: checkout.url };
  }

  async readWebhook(body: Buffer, headers: Record<string, string>): Promise<BillingWebhook> {
    if (!this.webhookSecret) throw new BillingWebhookRejected('signature');
    let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
    try {
      event = await webhooks.validateEvent(body, headers, this.webhookSecret);
    } catch (error) {
      if (error instanceof webhooks.PolarWebhookVerificationError) {
        throw new BillingWebhookRejected('signature');
      }
      // Signed by Polar but an event this API version does not describe:
      // nothing here listens for it, so it is acknowledged and dropped.
      if (error instanceof webhooks.PolarWebhookUnknownTypeError) {
        return { kind: 'ignored', type: 'unknown' };
      }
      if (error instanceof webhooks.PolarWebhookError) throw new BillingWebhookRejected('payload');
      throw error;
    }
    if (event.type.startsWith('subscription.') && 'data' in event && isSubscription(event.data)) {
      return { kind: 'subscription', type: event.type, subscription: toSubscription(event.data) };
    }
    return { kind: 'ignored', type: event.type };
  }
}

function isSubscription(data: unknown): data is models.Subscription {
  return typeof data === 'object' && data !== null && 'status' in data && 'product' in data;
}

function toCatalogueProduct(product: models.Product): CatalogueProduct {
  const prices = product.prices.filter((price) => !price.is_archived);
  return {
    id: product.id,
    archived: product.is_archived,
    plan: product.metadata['plan'],
    cycle: product.metadata['cycle'],
    interval: product.recurring_interval_count === 1 ? product.recurring_interval : null,
    price: prices.length === 1 ? toPrice(prices[0]!) : { kind: 'other' },
  };
}

function toPrice(price: models.Product['prices'][number]): CatalogueProduct['price'] {
  if (price.amount_type === 'fixed' && 'price_amount' in price) {
    return { kind: 'fixed', cents: price.price_amount };
  }
  if (price.amount_type === 'seat_based' && 'seat_tiers' in price) {
    const tiers = price.seat_tiers.tiers;
    // One flat price per seat from the first seat; tiered seat prices are not
    // something the pricing page could describe.
    if (tiers.length === 1 && tiers[0]!.min_seats <= 1) {
      return { kind: 'seats', centsPerSeat: tiers[0]!.price_per_seat };
    }
  }
  return { kind: 'other' };
}

function toSubscription(subscription: models.Subscription): ProviderSubscription {
  return {
    id: subscription.id,
    customerId: subscription.customer_id,
    status: subscription.status,
    seats: subscription.seats ?? null,
    currentPeriodEnd: dateOrNull(subscription.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    endedAt: dateOrNull(subscription.ended_at),
    modifiedAt: new Date(subscription.modified_at ?? subscription.created_at),
    checkoutId: subscription.checkout_id,
    workspaceId: subscription.metadata['workspace_id'],
    plan: subscription.product.metadata['plan'],
    cycle: subscription.product.metadata['cycle'],
  };
}

function dateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}
