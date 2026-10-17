"use server";

import { z } from "zod";
import { db } from "@fala/db";
import { cancelPlan, changePlan, keepPlan, portalUrl, previewPlanChange, type ChangeResult } from "@/lib/billing-changes";
import { requireUser } from "@/lib/dal";

/** Plan changes from the Plan & usage page. Paddle errors become a calm message; details go to the server log. */

const paidPlan = z.enum(["creator", "pro"]);
const interval = z.enum(["month", "year"]);
const PADDLE_DOWN = "Couldn't reach the payment provider. Nothing was changed — try again in a moment.";

async function guarded<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    console.error(JSON.stringify({ event: "billing.action_failed", error: error instanceof Error ? error.message.slice(0, 300) : String(error) }));
    return fallback;
  }
}

export async function previewPlanChangeAction(plan: unknown, every: unknown) {
  const user = await requireUser();
  const planKey = paidPlan.safeParse(plan);
  const billing = interval.safeParse(every);
  if (!planKey.success || !billing.success) return { ok: false as const, error: "Choose a plan." };
  return guarded(() => previewPlanChange(user.id, planKey.data, billing.data), { ok: false as const, error: PADDLE_DOWN });
}

export async function changePlanAction(plan: unknown, every: unknown): Promise<ChangeResult> {
  const user = await requireUser();
  const planKey = paidPlan.safeParse(plan);
  const billing = interval.safeParse(every);
  if (!planKey.success || !billing.success) return { ok: false, error: "Choose a plan." };
  return guarded(() => changePlan(user.id, planKey.data, billing.data), { ok: false, error: PADDLE_DOWN });
}

export async function cancelPlanAction(): Promise<ChangeResult> {
  const user = await requireUser();
  return guarded(() => cancelPlan(user.id), { ok: false, error: PADDLE_DOWN });
}

export async function keepPlanAction(): Promise<ChangeResult> {
  const user = await requireUser();
  return guarded(() => keepPlan(user.id), { ok: false, error: PADDLE_DOWN });
}

export async function portalUrlAction(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const url = await guarded(() => portalUrl(user.id), null);
  return url ? { ok: true, url } : { ok: false, error: PADDLE_DOWN };
}

/** For the "waiting for Paddle" step after checkout: the plan the webhook has applied so far. */
export async function currentPlanAction(): Promise<{ planKey: string; status: string } | null> {
  const user = await requireUser();
  const subscription = await db.subscription.findUnique({ where: { userId: user.id }, select: { planKey: true, status: true } });
  return subscription && subscription.status !== "CANCELED" ? subscription : null;
}
