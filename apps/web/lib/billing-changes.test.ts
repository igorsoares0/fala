import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";

Object.assign(process.env, {
  PADDLE_ENV: "sandbox",
  PADDLE_API_KEY: "test_api_key",
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_client_token",
  PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test_secret",
  PADDLE_PRICE_CREATOR_MONTHLY: "pri_creator_month",
  PADDLE_PRICE_CREATOR_YEARLY: "pri_creator_year",
  PADDLE_PRICE_PRO_MONTHLY: "pri_pro_month",
  PADDLE_PRICE_PRO_YEARLY: "pri_pro_year",
});

const { cancelPlan, changePlan, keepPlan, portalUrl, previewPlanChange } = await import("./billing-changes");
type Api = Parameters<typeof changePlan>[3] & object;

const users: string[] = [];
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

const DAY = 86_400_000;

async function subscriber(planKey: "creator" | "pro", billingInterval: "month" | "year" = "month") {
  const userId = `test-change-${randomUUID()}`;
  users.push(userId);
  await db.user.create({ data: { id: userId, name: "Sub", email: `${userId}@test.local` } });
  const start = new Date(Date.now() - DAY);
  await db.subscription.create({
    data: {
      userId,
      planKey,
      billingInterval,
      currentPeriodStart: start,
      currentPeriodEnd: new Date(start.getTime() + 30 * DAY),
      paddleSubscriptionId: `sub_${randomUUID().slice(0, 12)}`,
      paddleCustomerId: `ctm_${randomUUID().slice(0, 12)}`,
      paddleUpdatedAt: new Date(Date.now() - DAY),
    },
  });
  return userId;
}

/** A Paddle that records calls and answers with the subscription the change would produce. */
function fakePaddle(userId: string) {
  const calls: { method: string; id: string; body: Record<string, unknown> }[] = [];
  const answer = async (id: string, body: Record<string, unknown>) => {
    const row = await db.subscription.findUniqueOrThrow({ where: { userId } });
    const items = body.items as { priceId: string }[] | undefined;
    const currentPrice = `pri_${row.planKey}_${row.billingInterval}`;
    return {
      id,
      customerId: row.paddleCustomerId!,
      status: "active",
      updatedAt: new Date().toISOString(),
      items: [{ price: { id: items?.[0].priceId ?? currentPrice } }],
      currentBillingPeriod: { startsAt: row.currentPeriodStart.toISOString(), endsAt: row.currentPeriodEnd.toISOString() },
      scheduledChange: body.effectiveFrom === "next_billing_period" ? { action: "cancel", effectiveAt: row.currentPeriodEnd.toISOString() } : null,
      customData: { userId },
    };
  };
  const api: Api = {
    subscriptions: {
      update: async (id, body) => (calls.push({ method: "update", id, body }), answer(id, body)),
      cancel: async (id, body) => (calls.push({ method: "cancel", id, body }), answer(id, body)),
      previewUpdate: async (id, body) => {
        calls.push({ method: "previewUpdate", id, body });
        return { updateSummary: { result: { action: "charge", amount: "1133", currencyCode: "USD" } } };
      },
    },
    customerPortalSessions: {
      create: async (customerId) => ({ urls: { general: { overview: `https://portal.test/${customerId}` } } }),
    },
  };
  return { api, calls };
}

const row = (userId: string) => db.subscription.findUniqueOrThrow({ where: { userId } });

describe("plan changes", () => {
  it("upgrades right away, billing the prorated difference", async () => {
    const userId = await subscriber("creator");
    const { api, calls } = fakePaddle(userId);
    expect(await previewPlanChange(userId, "pro", "month", api)).toEqual({ ok: true, kind: "upgrade", amount: "1133", currency: "USD" });
    expect(await changePlan(userId, "pro", "month", api)).toEqual({ ok: true, scheduled: false });
    expect(calls.at(-1)).toMatchObject({ method: "update", body: { items: [{ priceId: "pri_pro_month" }], prorationBillingMode: "prorated_immediately" } });
    expect(await row(userId)).toMatchObject({ planKey: "pro", pendingPlanKey: null });
  });

  it("schedules a downgrade for the end of the period, and can undo it", async () => {
    const userId = await subscriber("pro");
    const { api, calls } = fakePaddle(userId);
    expect(await changePlan(userId, "creator", "month", api)).toEqual({ ok: true, scheduled: true });
    expect(calls.at(-1)).toMatchObject({ body: { prorationBillingMode: "full_next_billing_period" } });
    expect(await row(userId)).toMatchObject({ planKey: "pro", pendingPlanKey: "creator" });

    expect(await keepPlan(userId, api)).toEqual({ ok: true, scheduled: false });
    expect(calls.at(-1)).toMatchObject({ body: { items: [{ priceId: "pri_pro_month" }], prorationBillingMode: "do_not_bill" } });
    expect(await row(userId)).toMatchObject({ planKey: "pro", pendingPlanKey: null });
  });

  it("treats monthly → yearly as an upgrade and refuses a change to the same plan", async () => {
    const userId = await subscriber("creator");
    const { api } = fakePaddle(userId);
    expect(await changePlan(userId, "creator", "month", api)).toMatchObject({ ok: false });
    expect(await changePlan(userId, "creator", "year", api)).toEqual({ ok: true, scheduled: false });
  });

  it("cancels at the period end and opens the portal", async () => {
    const userId = await subscriber("creator");
    const { api, calls } = fakePaddle(userId);
    expect(await cancelPlan(userId, api)).toEqual({ ok: true, scheduled: true });
    expect(calls.at(-1)).toMatchObject({ method: "cancel", body: { effectiveFrom: "next_billing_period" } });
    expect((await row(userId)).cancelAt).not.toBeNull();
    expect(await portalUrl(userId, api)).toMatch(/^https:\/\/portal\.test\/ctm_/);
  });

  it("sends users without a subscription to checkout", async () => {
    const userId = `test-change-${randomUUID()}`;
    users.push(userId);
    await db.user.create({ data: { id: userId, name: "Free", email: `${userId}@test.local` } });
    const { api } = fakePaddle(userId);
    expect(await changePlan(userId, "pro", "month", api)).toMatchObject({ ok: false, needsCheckout: true });
    expect(await portalUrl(userId, api)).toBeNull();
  });
});
