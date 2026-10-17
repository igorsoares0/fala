import { z } from "zod";
import type { ExportResolution } from "./export";

/**
 * Plans and their limits (spec §13): the only place plan values live. Payments
 * (Paddle) map onto these keys; the backend enforces every limit, the UI mirrors them.
 */
export const PLAN_KEYS = ["free", "creator", "pro"] as const;

export const planKeySchema = z.enum(PLAN_KEYS);

export type PlanKey = z.infer<typeof planKeySchema>;

export type Plan = {
  key: PlanKey;
  name: string;
  /** Minutes of video transcribed per billing period. */
  monthlyMinutes: number;
  /** Longest video the plan accepts. */
  maxVideoMs: number;
  /** Highest export resolution (short side). */
  maxResolution: ExportResolution;
  /** Exports rendering at the same time, across all projects. */
  simultaneousExports: number;
  /** Shown prices in USD; charging comes from the payment provider. */
  monthlyUsd: number;
  yearlyUsd: number;
};

const MINUTE = 60_000;

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free",
    name: "Free",
    monthlyMinutes: 10,
    maxVideoMs: 3 * MINUTE,
    maxResolution: 720,
    simultaneousExports: 1,
    monthlyUsd: 0,
    yearlyUsd: 0,
  },
  creator: {
    key: "creator",
    name: "Creator",
    monthlyMinutes: 120,
    maxVideoMs: 10 * MINUTE,
    maxResolution: 1080,
    simultaneousExports: 2,
    monthlyUsd: 12,
    yearlyUsd: 108,
  },
  pro: {
    key: "pro",
    name: "Pro",
    monthlyMinutes: 400,
    maxVideoMs: 30 * MINUTE,
    maxResolution: 1080,
    simultaneousExports: 3,
    monthlyUsd: 29,
    yearlyUsd: 288,
  },
};

export const DEFAULT_PLAN: PlanKey = "free";

export function planFromKey(key: string | null | undefined): Plan {
  const parsed = planKeySchema.safeParse(key);
  return PLANS[parsed.success ? parsed.data : DEFAULT_PLAN];
}

/** Usage is metered in whole seconds of video, rounded up. */
export function usageSeconds(durationMs: number): number {
  return Math.ceil(Math.max(0, durationMs) / 1000);
}

/** Seconds of usage as whole minutes for display, rounded up ("38", never "37.4"). */
export function usageMinutes(seconds: number): number {
  return Math.ceil(Math.max(0, seconds) / 60);
}

/** Usage summary for a period, shared by the header meter, the Plan & usage page and the upload checks. */
export type UsageSummary = {
  plan: Plan;
  periodStart: string;
  periodEnd: string;
  confirmedSeconds: number;
  reservedSeconds: number;
  limitSeconds: number;
  remainingSeconds: number;
};

/** Above this share of the period's minutes, the UI warns that the limit is near. */
export const NEAR_LIMIT_SHARE = 0.8;
