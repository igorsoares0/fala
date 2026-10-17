import "server-only";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { PLAN_KEYS, type PlanKey } from "@fala/shared";

/**
 * Paddle Billing (spec FR-13): configuration, the price ↔ plan map and the shape the
 * rest of the app reads subscriptions in. Keys never leave the server, except the
 * client-side token, which Paddle designs to be public.
 */

export type BillingInterval = "month" | "year";

export type PaddleSettings = {
  environment: "sandbox" | "production";
  apiKey: string;
  clientToken: string;
  webhookSecret: string;
  /** Price id for each paid plan and interval. */
  prices: Record<Exclude<PlanKey, "free">, Record<BillingInterval, string>>;
};

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
};

export function paddleSettings(): PaddleSettings {
  const environment = process.env.PADDLE_ENV === "production" ? "production" : "sandbox";
  return {
    environment,
    apiKey: required("PADDLE_API_KEY"),
    clientToken: required("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN"),
    webhookSecret: required("PADDLE_WEBHOOK_SECRET"),
    prices: {
      creator: { month: required("PADDLE_PRICE_CREATOR_MONTHLY"), year: required("PADDLE_PRICE_CREATOR_YEARLY") },
      pro: { month: required("PADDLE_PRICE_PRO_MONTHLY"), year: required("PADDLE_PRICE_PRO_YEARLY") },
    },
  };
}

/** Whether checkout can be offered at all (keys configured). */
export function isBillingConfigured(): boolean {
  try {
    paddleSettings();
    return true;
  } catch {
    return false;
  }
}

const globalForPaddle = globalThis as unknown as { falaPaddle?: Paddle };

export function getPaddle(): Paddle {
  const settings = paddleSettings();
  globalForPaddle.falaPaddle ??= new Paddle(settings.apiKey, {
    environment: settings.environment === "production" ? Environment.production : Environment.sandbox,
  });
  return globalForPaddle.falaPaddle;
}

/** The plan and interval a price stands for; null for a price that isn't Fala's (never guessed). */
export function priceToPlan(priceId: string, settings = paddleSettings()): { planKey: PlanKey; interval: BillingInterval } | null {
  for (const planKey of PLAN_KEYS) {
    if (planKey === "free") continue;
    for (const interval of ["month", "year"] as const) {
      if (settings.prices[planKey][interval] === priceId) return { planKey, interval };
    }
  }
  return null;
}

export function planPrice(planKey: Exclude<PlanKey, "free">, interval: BillingInterval, settings = paddleSettings()): string {
  return settings.prices[planKey][interval];
}

/** Plans in order of what they include, for telling upgrades from downgrades. */
export const PLAN_RANK: Record<PlanKey, number> = { free: 0, creator: 1, pro: 2 };

/**
 * A Paddle subscription as the app needs it, from an API response or a webhook
 * (both arrive in the SDK's camelCase shape).
 */
export type SubscriptionState = {
  subscriptionId: string;
  customerId: string;
  status: string;
  priceId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** When a scheduled cancellation takes effect. */
  cancelAt: string | null;
  /** The Fala user id the checkout was opened for. */
  userId: string | null;
  updatedAt: string;
};

type PaddleSubscriptionLike = {
  id: string;
  customerId: string;
  status: string;
  updatedAt: string;
  items: { price?: { id: string } | null }[];
  currentBillingPeriod: { startsAt: string; endsAt: string } | null;
  scheduledChange: { action: string; effectiveAt: string } | null;
  customData: Record<string, unknown> | null;
};

export function toSubscriptionState(subscription: PaddleSubscriptionLike): SubscriptionState {
  const userId = subscription.customData?.userId;
  return {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    status: subscription.status,
    priceId: subscription.items[0]?.price?.id ?? null,
    periodStart: subscription.currentBillingPeriod?.startsAt ?? null,
    periodEnd: subscription.currentBillingPeriod?.endsAt ?? null,
    cancelAt: subscription.scheduledChange?.action === "cancel" ? subscription.scheduledChange.effectiveAt : null,
    userId: typeof userId === "string" ? userId : null,
    updatedAt: subscription.updatedAt,
  };
}
