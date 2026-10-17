import "server-only";
import { db } from "@fala/db";

/**
 * Per-user limits on expensive actions (renders, uploads), so one account or a
 * runaway script can't flood the queue. Fixed windows counted in Postgres: shared by
 * every app instance, one atomic statement per check.
 */
export const RATE_LIMITS = {
  export: { limit: 20, windowMs: 60 * 60_000 },
  upload: { limit: 30, windowMs: 60 * 60_000 },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

export const RATE_LIMITED = "You're doing that a lot. Please wait a few minutes and try again.";

/** Counts one use; false once the window's limit is passed. */
export async function takeToken(action: RateLimitedAction, userId: string, now = Date.now()): Promise<boolean> {
  const { limit, windowMs } = RATE_LIMITS[action];
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${action}:${userId}:${windowStart}`;
  const expiresAt = new Date(windowStart + windowMs);
  const [row] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limit_bucket" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = "rate_limit_bucket"."count" + 1
    RETURNING "count"`;
  // Old windows are useless: clear them now and then, off the hot path.
  if (Math.random() < 0.01) void db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => {});
  return row.count <= limit;
}
