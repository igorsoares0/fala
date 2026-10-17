import { createHmac, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { accountPeriod, db } from "@fala/db";

// Test configuration for the Paddle module (no network: the API client is never called here).
const PRICES = {
  PADDLE_PRICE_CREATOR_MONTHLY: "pri_creator_month",
  PADDLE_PRICE_CREATOR_YEARLY: "pri_creator_year",
  PADDLE_PRICE_PRO_MONTHLY: "pri_pro_month",
  PADDLE_PRICE_PRO_YEARLY: "pri_pro_year",
};
Object.assign(process.env, PRICES, {
  PADDLE_ENV: "sandbox",
  PADDLE_API_KEY: "test_api_key",
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_client_token",
  PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test_secret",
});

const { syncSubscription } = await import("./billing-sync");
const { POST } = await import("@/app/api/webhooks/paddle/route");

const users: string[] = [];
async function newUser() {
  const id = `test-billing-${randomUUID()}`;
  await db.user.create({ data: { id, name: "Billing", email: `${id}@test.local` } });
  users.push(id);
  return id;
}

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

const DAY = 86_400_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function state(overrides: Partial<Parameters<typeof syncSubscription>[0]> = {}) {
  return {
    subscriptionId: `sub_${randomUUID().slice(0, 12)}`,
    customerId: `ctm_${randomUUID().slice(0, 12)}`,
    status: "active",
    priceId: PRICES.PADDLE_PRICE_CREATOR_MONTHLY,
    periodStart: iso(now - DAY),
    periodEnd: iso(now + 29 * DAY),
    cancelAt: null,
    userId: null as string | null,
    updatedAt: iso(now),
    ...overrides,
  };
}

const row = (userId: string) => db.subscription.findUniqueOrThrow({ where: { userId } });

describe("syncSubscription", () => {
  it("links a new subscription to the user who opened checkout", async () => {
    const userId = await newUser();
    expect(await syncSubscription(state({ userId }))).toBe("applied");
    expect(await row(userId)).toMatchObject({ planKey: "creator", billingInterval: "month", status: "ACTIVE", pendingPlanKey: null });
    expect((await accountPeriod(db, userId)).plan.key).toBe("creator");
  });

  it("ignores unknown users, unknown prices and stale events", async () => {
    expect(await syncSubscription(state({ userId: "nobody" }))).toBe("unknown-user");
    const userId = await newUser();
    expect(await syncSubscription(state({ userId, priceId: "pri_someone_else" }))).toBe("unknown-price");

    const first = state({ userId, updatedAt: iso(now) });
    await syncSubscription(first);
    expect(await syncSubscription({ ...first, priceId: PRICES.PADDLE_PRICE_PRO_MONTHLY, updatedAt: iso(now - 60_000) })).toBe("stale");
    expect((await row(userId)).planKey).toBe("creator");
  });

  it("applies upgrades at once and keeps a downgrade until the period ends", async () => {
    const userId = await newUser();
    const base = state({ userId, priceId: PRICES.PADDLE_PRICE_PRO_MONTHLY, updatedAt: iso(now) });
    await syncSubscription(base);

    // Downgrade requested mid-period: Paddle already lists the Creator price.
    await syncSubscription({ ...base, priceId: PRICES.PADDLE_PRICE_CREATOR_MONTHLY, updatedAt: iso(now + 1000) });
    expect(await row(userId)).toMatchObject({ planKey: "pro", pendingPlanKey: "creator" });

    // Renewal: a new period starts on the lower plan, and its usage starts from zero.
    const before = (await accountPeriod(db, userId)).periodKey;
    await syncSubscription({
      ...base,
      priceId: PRICES.PADDLE_PRICE_CREATOR_MONTHLY,
      periodStart: iso(now + 29 * DAY - 1000),
      periodEnd: iso(now + 59 * DAY),
      updatedAt: iso(now + 2000),
    });
    expect(await row(userId)).toMatchObject({ planKey: "creator", pendingPlanKey: null });
    expect((await accountPeriod(db, userId, new Date(now + 30 * DAY))).periodKey).not.toBe(before);

    // Upgrade: immediate.
    await syncSubscription({ ...base, priceId: PRICES.PADDLE_PRICE_PRO_YEARLY, periodStart: iso(now + 29 * DAY - 1000), periodEnd: iso(now + 59 * DAY), updatedAt: iso(now + 3000) });
    expect(await row(userId)).toMatchObject({ planKey: "pro", billingInterval: "year", pendingPlanKey: null });
  });

  it("keeps access while a payment is retried, and falls back to Free once canceled", async () => {
    const userId = await newUser();
    const base = state({ userId, updatedAt: iso(now) });
    await syncSubscription(base);
    await syncSubscription({ ...base, status: "past_due", updatedAt: iso(now + 1000) });
    expect((await accountPeriod(db, userId)).plan.key).toBe("creator");

    await syncSubscription({ ...base, cancelAt: iso(now + 29 * DAY), updatedAt: iso(now + 2000) });
    expect((await row(userId)).cancelAt?.toISOString()).toBe(iso(now + 29 * DAY));

    await syncSubscription({ ...base, status: "canceled", updatedAt: iso(now + 3000) });
    expect((await accountPeriod(db, userId)).plan.key).toBe("free");
  });

  it("doesn't let an old subscription's cancellation end the current one", async () => {
    const userId = await newUser();
    const old = state({ userId, updatedAt: iso(now) });
    await syncSubscription(old);
    const current = state({ userId, priceId: PRICES.PADDLE_PRICE_PRO_MONTHLY, updatedAt: iso(now + 1000) });
    await syncSubscription(current);
    expect(await syncSubscription({ ...old, status: "canceled", updatedAt: iso(now + 2000) })).toBe("other-subscription");
    expect(await row(userId)).toMatchObject({ planKey: "pro", status: "ACTIVE" });
  });
});

describe("POST /api/webhooks/paddle", () => {
  function payload(userId: string, eventId = `evt_${randomUUID()}`) {
    const at = new Date().toISOString();
    return {
      event_id: eventId,
      event_type: "subscription.created",
      occurred_at: at,
      notification_id: `ntf_${randomUUID()}`,
      data: {
        id: `sub_${randomUUID().slice(0, 12)}`,
        status: "active",
        customer_id: `ctm_${randomUUID().slice(0, 12)}`,
        address_id: "add_test",
        business_id: null,
        currency_code: "USD",
        created_at: at,
        updated_at: at,
        started_at: at,
        first_billed_at: at,
        next_billed_at: iso(now + 30 * DAY),
        paused_at: null,
        canceled_at: null,
        discount: null,
        collection_mode: "automatic",
        billing_details: null,
        current_billing_period: { starts_at: at, ends_at: iso(now + 30 * DAY) },
        billing_cycle: { interval: "month", frequency: 1 },
        scheduled_change: null,
        items: [
          {
            status: "active",
            quantity: 1,
            recurring: true,
            created_at: at,
            updated_at: at,
            previously_billed_at: null,
            next_billed_at: null,
            trial_dates: null,
            price: {
              id: PRICES.PADDLE_PRICE_PRO_MONTHLY,
              product_id: "pro_test",
              description: "Fala Pro — monthly",
              type: "standard",
              name: "Monthly",
              billing_cycle: { interval: "month", frequency: 1 },
              trial_period: null,
              tax_mode: "account_setting",
              unit_price: { amount: "2900", currency_code: "USD" },
              unit_price_overrides: [],
              quantity: { minimum: 1, maximum: 1 },
              status: "active",
              custom_data: null,
              import_meta: null,
              created_at: at,
              updated_at: at,
            },
          },
        ],
        custom_data: { userId },
        import_meta: null,
      },
    };
  }

  function signed(body: string, secret = process.env.PADDLE_WEBHOOK_SECRET!) {
    const ts = Math.floor(Date.now() / 1000);
    const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
    return new Request("http://localhost/api/webhooks/paddle", {
      method: "POST",
      headers: { "content-type": "application/json", "paddle-signature": `ts=${ts};h1=${h1}` },
      body,
    });
  }

  it("applies a correctly signed event once, however often it arrives", async () => {
    const userId = await newUser();
    const body = JSON.stringify(payload(userId));
    expect((await POST(signed(body))).status).toBe(200);
    expect((await POST(signed(body))).status).toBe(200);
    expect(await row(userId)).toMatchObject({ planKey: "pro", status: "ACTIVE" });
    expect(await db.paddleEvent.count({ where: { eventId: JSON.parse(body).event_id } })).toBe(1);
  });

  it("refuses events with a wrong signature", async () => {
    const userId = await newUser();
    const response = await POST(signed(JSON.stringify(payload(userId)), "not-the-secret"));
    expect(response.status).toBe(401);
    expect(await db.subscription.findUnique({ where: { userId } })).toBeNull();
  });
});
