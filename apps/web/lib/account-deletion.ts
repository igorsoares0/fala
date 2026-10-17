import "server-only";
import { APIError } from "better-auth/api";
import { db, enqueueEmail, enqueueJobOnce } from "@fala/db";
import { getPaddle } from "./paddle";

/**
 * Runs right before Better Auth deletes an account (spec FR-16). Billing is canceled
 * first — if Paddle can't confirm it, the deletion stops, so nobody keeps paying for
 * an account that's gone. Then file removal and a goodbye email are queued; they
 * outlive the account rows, which the database deletes in cascade.
 */

type PaddleCancel = { subscriptions: { cancel(id: string, body: { effectiveFrom: "immediately" }): Promise<unknown> } };

/** Cleanup runs twice: soon, then a day later, catching files from work that was still running. */
const CLEANUP_DELAYS_MS = [30 * 60_000, 24 * 60 * 60_000];

export async function prepareAccountDeletion(
  user: { id: string; email: string; name: string },
  paddle: () => PaddleCancel = () => getPaddle() as unknown as PaddleCancel,
) {
  const subscription = await db.subscription.findUnique({ where: { userId: user.id } });
  if (subscription?.paddleSubscriptionId && subscription.status !== "CANCELED") {
    try {
      await paddle().subscriptions.cancel(subscription.paddleSubscriptionId, { effectiveFrom: "immediately" });
    } catch {
      throw new APIError("SERVICE_UNAVAILABLE", {
        message: "We couldn't cancel your subscription just now, so your account wasn't deleted. Try again in a moment.",
      });
    }
  }

  await db.$transaction(async (tx) => {
    await tx.job.updateMany({
      where: { project: { userId: user.id }, status: { in: ["PENDING", "RETRY_WAIT"] } },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    for (const [index, delay] of CLEANUP_DELAYS_MS.entries()) {
      await enqueueJobOnce(tx, "DELETE_ACCOUNT_ASSETS", null, { userId: user.id }, `delete-account:${user.id}:${index}`, {
        maxAttempts: 5,
        availableAt: new Date(Date.now() + delay),
      });
    }
    await enqueueEmail(tx, { template: "account-deleted", to: user.email, data: { name: user.name }, dedupeKey: `account-deleted:${user.id}` });
  });
}
