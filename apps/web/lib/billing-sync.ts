import "server-only";
import { db, enqueueEmail, Prisma, type SubscriptionStatus } from "@fala/db";
import { planFromKey } from "@fala/shared";
import { PLAN_RANK, priceToPlan, type SubscriptionState } from "./paddle";

/**
 * Applies Paddle's view of a subscription to the account (spec FR-13). Paddle is the
 * source of truth: this runs for every webhook and after every plan change we ask
 * Paddle for, and it's safe to run twice or out of order.
 */

const STATUS: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "ACTIVE",
  // Paddle keeps retrying the card: access stays meanwhile.
  past_due: "PAST_DUE",
  paused: "CANCELED",
  canceled: "CANCELED",
};

export type SyncResult = "applied" | "stale" | "unknown-user" | "unknown-price" | "other-subscription";

export async function syncSubscription(state: SubscriptionState, tx: Prisma.TransactionClient | typeof db = db): Promise<SyncResult> {
  const target = state.priceId ? priceToPlan(state.priceId) : null;
  if (!target) return "unknown-price";

  const bySubscription = await tx.subscription.findUnique({ where: { paddleSubscriptionId: state.subscriptionId } });
  const userId = bySubscription?.userId ?? state.userId;
  if (!userId) return "unknown-user";
  const owner = await tx.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!owner) return "unknown-user";

  const existing = bySubscription ?? (await tx.subscription.findUnique({ where: { userId } }));
  const updatedAt = new Date(state.updatedAt);
  const status = STATUS[state.status] ?? "CANCELED";

  if (existing?.paddleSubscriptionId && existing.paddleSubscriptionId !== state.subscriptionId) {
    // An event about an older subscription must not end the one the user has now.
    if (existing.status !== "CANCELED" && status === "CANCELED") return "other-subscription";
  } else if (existing?.paddleUpdatedAt && updatedAt <= existing.paddleUpdatedAt) {
    return "stale";
  }

  const periodStart = state.periodStart ? new Date(state.periodStart) : (existing?.currentPeriodStart ?? updatedAt);
  const periodEnd = state.periodEnd ? new Date(state.periodEnd) : (existing?.currentPeriodEnd ?? updatedAt);

  // A downgrade within the same period waits for the period to end; upgrades apply at once.
  const samePeriod =
    existing?.paddleSubscriptionId === state.subscriptionId && existing.currentPeriodStart.getTime() === periodStart.getTime();
  const waitsForRenewal =
    samePeriod && status !== "CANCELED" && PLAN_RANK[target.planKey] < PLAN_RANK[existing.planKey as keyof typeof PLAN_RANK];
  const planKey = waitsForRenewal ? existing.planKey : target.planKey;
  const pendingPlanKey = waitsForRenewal ? target.planKey : null;

  const data = {
    planKey,
    pendingPlanKey,
    billingInterval: target.interval,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAt: state.cancelAt ? new Date(state.cancelAt) : null,
    paddleCustomerId: state.customerId,
    paddleSubscriptionId: state.subscriptionId,
    paddleUpdatedAt: updatedAt,
  };
  await tx.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  await notifyChange(tx, owner, existing, data);
  return "applied";
}

type Row = { planKey: string; status: SubscriptionStatus; cancelAt: Date | null; paddleSubscriptionId: string | null };
const day = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

/** Emails for what changed (spec FR-15), one per occurrence even when Paddle repeats itself. */
async function notifyChange(
  tx: Prisma.TransactionClient | typeof db,
  owner: { email: string; name: string },
  before: Row | null,
  after: Row & { paddleSubscriptionId: string; currentPeriodStart: Date },
) {
  const plan = planFromKey(after.planKey);
  const send = (template: Parameters<typeof enqueueEmail>[1]["template"], dedupeKey: string, data: Record<string, string | number> = {}) =>
    enqueueEmail(tx, { template, to: owner.email, data: { name: owner.name, plan: plan.name, minutes: plan.monthlyMinutes, maxMinutes: plan.maxVideoMs / 60_000, ...data }, dedupeKey });
  const sub = after.paddleSubscriptionId;

  const isNew = !before || before.paddleSubscriptionId !== sub || before.status === "CANCELED";
  if (isNew && after.status !== "CANCELED") return send("subscription-started", `subscription-started:${sub}`);
  if (!before) return;
  if (after.status === "PAST_DUE" && before.status !== "PAST_DUE") {
    await send("payment-failed", `payment-failed:${sub}:${after.currentPeriodStart.toISOString()}`);
  }
  if (after.cancelAt && !before.cancelAt) {
    await send("subscription-canceled", `subscription-canceled:${sub}:${after.cancelAt.toISOString()}`, { endsOn: day.format(after.cancelAt) });
  }
  if (after.planKey !== before.planKey && after.status !== "CANCELED") {
    await send("subscription-changed", `subscription-changed:${sub}:${after.planKey}:${after.currentPeriodStart.toISOString()}`);
  }
}

export type PaddleWebhookEvent = { eventId: string; eventType: string; data: unknown };

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
]);

/**
 * One webhook event, exactly once: the event id is recorded in the same transaction
 * that applies it, so a replay (Paddle retries, or a manual resend) changes nothing.
 */
export async function handlePaddleEvent(
  event: PaddleWebhookEvent,
  toState: (data: unknown) => SubscriptionState,
): Promise<SyncResult | "duplicate" | "ignored"> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.paddleEvent.create({ data: { eventId: event.eventId, type: event.eventType } });
      if (!SUBSCRIPTION_EVENTS.has(event.eventType)) return "ignored";
      return syncSubscription(toState(event.data), tx);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    throw error;
  }
}
