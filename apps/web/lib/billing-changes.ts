import "server-only";
import { db } from "@fala/db";
import type { PlanKey } from "@fala/shared";
import { syncSubscription } from "./billing-sync";
import { getPaddle, PLAN_RANK, planPrice, toSubscriptionState, type BillingInterval } from "./paddle";

/**
 * Plan changes for a user who already pays (spec FR-13). Each asks Paddle to make the
 * change, then applies Paddle's answer like a webhook would; the webhook that follows
 * is then a no-op. A first subscription goes through Paddle Checkout in the browser.
 */

type Subscription = Parameters<typeof toSubscriptionState>[0];

/** The parts of the Paddle client used here, so tests can pass a fake. */
export type PaddleApi = {
  subscriptions: {
    update(id: string, body: Record<string, unknown>): Promise<Subscription>;
    previewUpdate(id: string, body: Record<string, unknown>): Promise<{
      updateSummary: { result: { action: "credit" | "charge"; amount: string; currencyCode: string } } | null;
    }>;
    cancel(id: string, body: Record<string, unknown>): Promise<Subscription>;
  };
  customerPortalSessions: { create(customerId: string, subscriptionIds: string[]): Promise<{ urls: { general: { overview: string } } }> };
};

const paddleApi = () => getPaddle() as unknown as PaddleApi;

export type ChangeResult = { ok: true; scheduled: boolean } | { ok: false; error: string; needsCheckout?: boolean };

async function liveSubscription(userId: string) {
  const subscription = await db.subscription.findUnique({ where: { userId } });
  if (!subscription?.paddleSubscriptionId || subscription.status === "CANCELED") return null;
  return subscription as typeof subscription & { paddleSubscriptionId: string };
}

/** Upgrades (and monthly → yearly) bill the difference now; downgrades (and yearly → monthly) wait for the period end. */
function changeKind(current: { planKey: string; billingInterval: string }, planKey: PlanKey, interval: BillingInterval) {
  const rank = PLAN_RANK[planKey] - PLAN_RANK[current.planKey as PlanKey];
  if (rank !== 0) return rank > 0 ? "upgrade" : "downgrade";
  if (interval === current.billingInterval) return "same";
  return interval === "year" ? "upgrade" : "downgrade";
}

const changeBody = (planKey: Exclude<PlanKey, "free">, interval: BillingInterval, kind: "upgrade" | "downgrade") => ({
  items: [{ priceId: planPrice(planKey, interval), quantity: 1 }],
  prorationBillingMode: kind === "upgrade" ? "prorated_immediately" : "full_next_billing_period",
});

/** What a change would charge (or credit) right now, for the review step. */
export async function previewPlanChange(
  userId: string,
  planKey: Exclude<PlanKey, "free">,
  interval: BillingInterval,
  api: PaddleApi = paddleApi(),
): Promise<{ ok: true; kind: "upgrade" | "downgrade"; amount: string | null; currency: string | null } | { ok: false; error: string; needsCheckout?: boolean }> {
  const current = await liveSubscription(userId);
  if (!current) return { ok: false, error: "No active subscription.", needsCheckout: true };
  const kind = changeKind(current, planKey, interval);
  if (kind === "same") return { ok: false, error: "That's your current plan." };
  const preview = await api.subscriptions.previewUpdate(current.paddleSubscriptionId, changeBody(planKey, interval, kind));
  const result = preview.updateSummary?.result ?? null;
  return { ok: true, kind, amount: result?.amount ?? null, currency: result?.currencyCode ?? null };
}

export async function changePlan(
  userId: string,
  planKey: Exclude<PlanKey, "free">,
  interval: BillingInterval,
  api: PaddleApi = paddleApi(),
): Promise<ChangeResult> {
  const current = await liveSubscription(userId);
  if (!current) return { ok: false, error: "No active subscription.", needsCheckout: true };
  const kind = changeKind(current, planKey, interval);
  if (kind === "same") return { ok: false, error: "That's your current plan." };
  if (current.status === "PAST_DUE") return { ok: false, error: "Update your card first: the last payment didn't go through." };

  const updated = await api.subscriptions.update(current.paddleSubscriptionId, changeBody(planKey, interval, kind));
  await syncSubscription(toSubscriptionState(updated));
  return { ok: true, scheduled: kind === "downgrade" };
}

/** Cancels at the end of the period: the plan stays until then. */
export async function cancelPlan(userId: string, api: PaddleApi = paddleApi()): Promise<ChangeResult> {
  const current = await liveSubscription(userId);
  if (!current) return { ok: false, error: "No active subscription." };
  const updated = await api.subscriptions.cancel(current.paddleSubscriptionId, { effectiveFrom: "next_billing_period" });
  await syncSubscription(toSubscriptionState(updated));
  return { ok: true, scheduled: true };
}

/** Undoes a scheduled cancellation or downgrade: the current plan simply continues. */
export async function keepPlan(userId: string, api: PaddleApi = paddleApi()): Promise<ChangeResult> {
  const current = await liveSubscription(userId);
  if (!current) return { ok: false, error: "No active subscription." };
  let updated: Subscription | null = null;
  if (current.cancelAt) updated = await api.subscriptions.update(current.paddleSubscriptionId, { scheduledChange: null });
  if (current.pendingPlanKey) {
    updated = await api.subscriptions.update(current.paddleSubscriptionId, {
      items: [{ priceId: planPrice(current.planKey as Exclude<PlanKey, "free">, current.billingInterval as BillingInterval), quantity: 1 }],
      prorationBillingMode: "do_not_bill",
    });
  }
  if (updated) await syncSubscription(toSubscriptionState(updated));
  return { ok: true, scheduled: false };
}

/** Paddle's customer portal: payment method, invoices and receipts. */
export async function portalUrl(userId: string, api: PaddleApi = paddleApi()): Promise<string | null> {
  const subscription = await db.subscription.findUnique({ where: { userId } });
  if (!subscription?.paddleCustomerId) return null;
  const session = await api.customerPortalSessions.create(
    subscription.paddleCustomerId,
    subscription.paddleSubscriptionId ? [subscription.paddleSubscriptionId] : [],
  );
  return session.urls.general.overview;
}
