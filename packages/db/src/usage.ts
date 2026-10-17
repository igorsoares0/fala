import { planFromKey, uploadIdFromSourceKey, type Plan, type UsageSummary } from "@fala/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

/**
 * Plan resolution and usage metering (spec FR-13, FR-14), shared by the web app and
 * the worker. Usage is reserved before work that costs money, inside the same
 * transaction that queues it, then confirmed when the work succeeds or released when
 * it fails for good. Reservations lock the account row, so parallel requests for one
 * user are checked one after another and can't both pass a limit.
 */

type Client = Prisma.TransactionClient | PrismaClient;

export type AccountPeriod = {
  plan: Plan;
  periodStart: Date;
  periodEnd: Date;
  /** What usage entries of this period are stored under. */
  periodKey: string;
};

/** The user's plan and current billing period: the subscription's, or the calendar month (UTC) on Free. */
export async function accountPeriod(tx: Client, userId: string, now: Date = new Date()): Promise<AccountPeriod> {
  const subscription = await tx.subscription.findUnique({
    where: { userId },
    select: { planKey: true, status: true, currentPeriodStart: true, currentPeriodEnd: true },
  });
  if (
    subscription &&
    subscription.status !== "CANCELED" &&
    subscription.currentPeriodStart <= now &&
    now < subscription.currentPeriodEnd
  ) {
    return {
      plan: planFromKey(subscription.planKey),
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      periodKey: `sub:${subscription.currentPeriodStart.toISOString()}`,
    };
  }
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { plan: planFromKey(null), periodStart, periodEnd, periodKey: periodStart.toISOString().slice(0, 7) };
}

/** Serializes limit checks for one user until the transaction ends. */
export async function lockAccount(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
}

/** Seconds confirmed and reserved in a period. */
export async function usageInPeriod(tx: Client, userId: string, periodKey: string) {
  const groups = await tx.usageEntry.groupBy({
    by: ["status"],
    where: { userId, periodKey, status: { in: ["RESERVED", "CONFIRMED"] } },
    _sum: { seconds: true },
  });
  const sum = (status: "RESERVED" | "CONFIRMED") => groups.find((group) => group.status === status)?._sum.seconds ?? 0;
  return { confirmed: sum("CONFIRMED"), reserved: sum("RESERVED") };
}

/** Plan, period and usage, for the header meter, the Plan & usage page and upload checks. */
export async function usageSummary(tx: Client, userId: string, now: Date = new Date()): Promise<UsageSummary> {
  const period = await accountPeriod(tx, userId, now);
  const { confirmed, reserved } = await usageInPeriod(tx, userId, period.periodKey);
  const limitSeconds = period.plan.monthlyMinutes * 60;
  return {
    plan: period.plan,
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    confirmedSeconds: confirmed,
    reservedSeconds: reserved,
    limitSeconds,
    remainingSeconds: Math.max(0, limitSeconds - confirmed - reserved),
  };
}

/** One transcription of one uploaded file: retries and re-runs of the same file share it. */
export function transcriptionUsageKey(projectId: string, sourceObjectKey: string): string {
  return `transcription:${projectId}:${uploadIdFromSourceKey(sourceObjectKey) ?? sourceObjectKey}`;
}

export type ReserveResult = { ok: true } | { ok: false; reason: "USAGE_LIMIT" };

/**
 * Reserves the minutes for transcribing a file, if the plan has them. Idempotent:
 * an entry already reserved or confirmed for this file is reused (never charged
 * twice); one released after a failure is reserved again.
 */
export async function reserveTranscription(
  tx: Prisma.TransactionClient,
  { userId, projectId, sourceObjectKey, seconds }: { userId: string; projectId: string; sourceObjectKey: string; seconds: number },
): Promise<ReserveResult> {
  await lockAccount(tx, userId);
  const idempotencyKey = transcriptionUsageKey(projectId, sourceObjectKey);
  const existing = await tx.usageEntry.findUnique({ where: { idempotencyKey }, select: { status: true } });
  if (existing && existing.status !== "RELEASED") return { ok: true };

  const period = await accountPeriod(tx, userId);
  const { confirmed, reserved } = await usageInPeriod(tx, userId, period.periodKey);
  if (confirmed + reserved + seconds > period.plan.monthlyMinutes * 60) return { ok: false, reason: "USAGE_LIMIT" };

  const entry = { periodKey: period.periodKey, seconds, status: "RESERVED" as const };
  await tx.usageEntry.upsert({
    where: { idempotencyKey },
    create: { userId, projectId, usageType: "TRANSCRIPTION", idempotencyKey, ...entry },
    update: entry,
  });
  return { ok: true };
}

/** The work succeeded: the reserved minutes are spent. */
export async function confirmUsage(tx: Client, idempotencyKey: string) {
  await tx.usageEntry.updateMany({ where: { idempotencyKey, status: "RESERVED" }, data: { status: "CONFIRMED" } });
}

/** The work failed for good, or its project is gone: the reserved minutes come back. */
export async function releaseUsage(tx: Client, target: { idempotencyKey: string } | { projectId: string }) {
  await tx.usageEntry.updateMany({ where: { ...target, status: "RESERVED" }, data: { status: "RELEASED" } });
}
