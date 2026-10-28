import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PLAN_PRICES } from '@canvasflow/types';
import {
  BillingWebhookRejected,
  type CatalogueProduct,
  type ProviderSubscription,
} from './billing-provider.js';
import { advertisedPrice, pickProduct, snapshotOf, workspaceIdIn } from './billing-rules.js';
import { PolarBillingProvider } from './polar-billing-provider.js';
import { withCheckoutId } from './billing.service.js';

const WORKSPACE = '3ef72266-0242-48aa-a2ad-741a5fd16bf7';

/** The catalogue as it should be: one product per plan and cycle, at the listed price. */
function catalogue(): CatalogueProduct[] {
  return (['pro', 'team'] as const).flatMap((plan) =>
    (['monthly', 'yearly'] as const).map((cycle): CatalogueProduct => {
      const price = advertisedPrice(plan, cycle);
      return {
        id: `${plan}-${cycle}`,
        archived: false,
        plan,
        cycle,
        interval: cycle === 'monthly' ? 'month' : 'year',
        price:
          price.kind === 'fixed'
            ? { kind: 'fixed', cents: price.cents }
            : { kind: 'seats', centsPerSeat: price.cents },
      };
    }),
  );
}

describe('advertisedPrice', () => {
  it('charges a month at the monthly price and a year at twelve of the yearly one', () => {
    const pro = PLAN_PRICES.pro!;
    expect(advertisedPrice('pro', 'monthly')).toEqual({ kind: 'fixed', cents: pro.monthly * 100 });
    expect(advertisedPrice('pro', 'yearly')).toEqual({ kind: 'fixed', cents: pro.yearly * 1200 });
  });

  it('prices Team per seat', () => {
    expect(advertisedPrice('team', 'monthly').kind).toBe('seats');
  });
});

describe('pickProduct', () => {
  it('finds the product for each plan and cycle', () => {
    for (const product of catalogue()) {
      const pick = pickProduct(catalogue(), product.plan as 'pro', product.cycle as 'monthly');
      expect(pick).toEqual({ ok: true, product });
    }
  });

  it('ignores archived products and refuses when none is left', () => {
    const products = catalogue().map((p) =>
      p.id === 'pro-monthly' ? { ...p, archived: true } : p,
    );
    expect(pickProduct(products, 'pro', 'monthly').ok).toBe(false);
  });

  it('refuses two products for one plan and cycle rather than guess', () => {
    const products = [...catalogue(), { ...catalogue()[0]!, id: 'pro-monthly-copy' }];
    expect(pickProduct(products, 'pro', 'monthly').ok).toBe(false);
  });

  it('refuses a yearly product that charges every month', () => {
    const products = catalogue().map((p) =>
      p.id === 'team-yearly' ? { ...p, interval: 'month' } : p,
    );
    const pick = pickProduct(products, 'team', 'yearly');
    expect(pick.ok).toBe(false);
  });

  it('refuses a price other than the advertised one', () => {
    const products = catalogue().map((p) =>
      p.id === 'pro-monthly' ? { ...p, price: { kind: 'fixed' as const, cents: 1 } } : p,
    );
    expect(pickProduct(products, 'pro', 'monthly').ok).toBe(false);
  });

  it('refuses Team as a fixed price, since it is charged per member', () => {
    const cents = advertisedPrice('team', 'monthly').cents;
    const products = catalogue().map((p) =>
      p.id === 'team-monthly' ? { ...p, price: { kind: 'fixed' as const, cents } } : p,
    );
    expect(pickProduct(products, 'team', 'monthly').ok).toBe(false);
  });
});

function subscription(overrides: Partial<ProviderSubscription> = {}): ProviderSubscription {
  return {
    id: 'sub_1',
    customerId: 'cus_1',
    status: 'active',
    seats: null,
    currentPeriodEnd: new Date('2026-11-28T00:00:00Z'),
    cancelAtPeriodEnd: false,
    endedAt: null,
    modifiedAt: new Date('2026-10-28T00:00:00Z'),
    checkoutId: 'chk_1',
    workspaceId: WORKSPACE,
    plan: 'pro',
    cycle: 'monthly',
    ...overrides,
  };
}

describe('workspaceIdIn', () => {
  it('reads the workspace id from the metadata, and nothing that is not one', () => {
    expect(workspaceIdIn(subscription())).toBe(WORKSPACE);
    expect(workspaceIdIn(subscription({ workspaceId: 'not-an-id' }))).toBeNull();
    expect(workspaceIdIn(subscription({ workspaceId: undefined }))).toBeNull();
  });
});

describe('snapshotOf', () => {
  it('keeps the plan and cycle from the product', () => {
    const result = snapshotOf(subscription({ plan: 'team', cycle: 'yearly', seats: 4 }), WORKSPACE);
    expect(result.ok && result.snapshot).toMatchObject({
      id: 'sub_1',
      workspaceId: WORKSPACE,
      plan: 'team',
      cycle: 'yearly',
      seats: 4,
      status: 'active',
    });
  });

  it('refuses a product without our metadata', () => {
    expect(snapshotOf(subscription({ plan: undefined }), WORKSPACE).ok).toBe(false);
    expect(snapshotOf(subscription({ plan: 'enterprise' }), WORKSPACE).ok).toBe(false);
    expect(snapshotOf(subscription({ cycle: 'weekly' }), WORKSPACE).ok).toBe(false);
  });
});

describe('PolarBillingProvider.readWebhook', () => {
  const secret = 'whsec_test_secret_for_billing';
  const provider = new PolarBillingProvider('polar_oat_test', 'sandbox', secret);

  /** Signed the way Polar signs: Standard Webhooks, keyed with the secret's bytes. */
  function signed(body: string, key = secret): Record<string, string> {
    const id = 'msg_1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', Buffer.from(key, 'utf8'))
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64');
    return {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${signature}`,
    };
  }

  it('refuses a body signed with another secret', async () => {
    const body = JSON.stringify({ type: 'subscription.active', data: {} });
    await expect(
      provider.readWebhook(Buffer.from(body), signed(body, 'whsec_somebody_else')),
    ).rejects.toEqual(new BillingWebhookRejected('signature'));
  });

  it('refuses a body changed after it was signed', async () => {
    const body = JSON.stringify({ type: 'order.created', data: {} });
    const headers = signed(body);
    await expect(
      provider.readWebhook(Buffer.from(body.replace('order', 'refund')), headers),
    ).rejects.toEqual(new BillingWebhookRejected('signature'));
  });

  it('accepts a signed event it has no use for, and ignores it', async () => {
    const body = JSON.stringify({
      type: 'something.new',
      timestamp: '2026-10-28T00:00:00Z',
      data: {},
    });
    await expect(provider.readWebhook(Buffer.from(body), signed(body))).resolves.toEqual({
      kind: 'ignored',
      type: 'unknown',
    });
  });

  it('refuses every webhook when no secret is set', async () => {
    const unsigned = new PolarBillingProvider('polar_oat_test', 'sandbox', undefined);
    const body = JSON.stringify({ type: 'subscription.active', data: {} });
    await expect(unsigned.readWebhook(Buffer.from(body), signed(body))).rejects.toEqual(
      new BillingWebhookRejected('signature'),
    );
  });
});

describe('withCheckoutId', () => {
  it("adds Polar's placeholder as a query parameter, before any hash", () => {
    expect(withCheckoutId('http://localhost:3002/boards/b1')).toBe(
      'http://localhost:3002/boards/b1?checkout_id={CHECKOUT_ID}',
    );
    expect(withCheckoutId('http://localhost:3002/boards/b1?x=1#y')).toBe(
      'http://localhost:3002/boards/b1?x=1&checkout_id={CHECKOUT_ID}#y',
    );
  });
});
