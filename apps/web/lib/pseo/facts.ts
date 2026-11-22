import { PLAN_KEYS, PLANS, type PlanKey } from "@fala/shared";

/**
 * Product facts the pSEO copy takes from the codebase, so pages can't drift from the
 * real plans. Content files write plan numbers as tokens, e.g. `{plan.free.monthlyMinutes}`.
 */

const PLAN_FIELDS = {
  name: (key: PlanKey) => PLANS[key].name,
  monthlyMinutes: (key: PlanKey) => String(PLANS[key].monthlyMinutes),
  maxVideoMinutes: (key: PlanKey) => String(PLANS[key].maxVideoMs / 60_000),
  maxResolution: (key: PlanKey) => `${PLANS[key].maxResolution}p`,
  monthlyUsd: (key: PlanKey) => `$${PLANS[key].monthlyUsd}`,
  yearlyUsd: (key: PlanKey) => `$${PLANS[key].yearlyUsd}`,
} as const;

const TOKEN = /\{plan\.([a-z]+)\.([a-zA-Z]+)\}/g;

/** Replaces the plan tokens in a string; returns the unknown ones separately. */
export function fillPlanTokens(value: string): { text: string; unknown: string[] } {
  const unknown: string[] = [];
  const text = value.replace(TOKEN, (token, key: string, field: string) => {
    if (!(PLAN_KEYS as readonly string[]).includes(key) || !(field in PLAN_FIELDS)) {
      unknown.push(token);
      return token;
    }
    return PLAN_FIELDS[field as keyof typeof PLAN_FIELDS](key as PlanKey);
  });
  return { text, unknown };
}

export const COMPARISON_ROWS = [
  { key: "startingPaidPrice", label: "Starting paid price" },
  { key: "freeTierLimits", label: "Free plan limits" },
  { key: "freeWatermark", label: "Watermark on free exports" },
  { key: "limitsCountedBy", label: "How limits are counted" },
  { key: "platform", label: "Platform" },
  { key: "editingModel", label: "Editing model" },
] as const;

export type ComparisonKey = (typeof COMPARISON_ROWS)[number]["key"];

/** Supertitle's column of every comparison table. */
export function supertitleComparison(): Record<ComparisonKey, string> {
  const { free, creator } = PLANS;
  return {
    startingPaidPrice: `$${creator.monthlyUsd}/month (${creator.name}), or $${creator.yearlyUsd}/year`,
    freeTierLimits: `${free.monthlyMinutes} minutes of video a month, videos up to ${free.maxVideoMs / 60_000} minutes, ${free.maxResolution}p`,
    freeWatermark: "None",
    limitsCountedBy: "Minutes of video",
    platform: "Browser",
    editingModel: "Text document",
  };
}

/** The Free plan line under calls to action, as on the landing page. */
export function freePlanNote(): string {
  return `${PLANS.free.monthlyMinutes} minutes a month · no card · no watermark`;
}
