import { db, enqueueEmail } from "@fala/db";
import { DAY_MS, EXPORT_RETENTION_DAYS, SOURCE_RETENTION_DAYS, SOURCE_WARNING_DAYS, type JobPayload } from "@fala/shared";
import { log } from "../log";
import { noChanges, type JobHandler } from "./types";

type Payload = JobPayload<"RETENTION_SWEEP">;

/** Rows handled per kind and run; the sweep runs every hour, so a backlog drains over a few runs. */
const BATCH = 200;

const day = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

/**
 * Retention (spec FR-16, §8.2): removes exports 30 days after they finish, and the
 * original video of a project untouched for 90 days, after warning its owner 7 days
 * before. Projects and captions are never removed here. Each step re-checks its
 * condition when writing, so a project opened meanwhile is left alone.
 */
export const retentionSweep: JobHandler<Payload> = {
  async run({ storage, signal }) {
    const now = Date.now();
    const ago = (days: number) => new Date(now - days * DAY_MS);

    // 1. Exports past retention: the file goes, the version shows "Expired · render again".
    const exports = await db.export.findMany({
      where: { status: "SUCCEEDED", completedAt: { lt: ago(EXPORT_RETENTION_DAYS) } },
      select: { id: true, objectKey: true },
      take: BATCH,
    });
    for (const item of exports) {
      signal.throwIfAborted();
      if (item.objectKey) await storage.deleteObject(item.objectKey);
      await db.export.updateMany({ where: { id: item.id, status: "SUCCEEDED" }, data: { status: "EXPIRED", objectKey: null } });
    }

    // 2. Originals about to go: one warning per period of inactivity.
    const live = { deletedAt: null, sourceObjectKey: { not: null }, sourceDeletedAt: null };
    const warnAt = SOURCE_RETENTION_DAYS - SOURCE_WARNING_DAYS;
    const toWarn = await db.project.findMany({
      where: { ...live, sourceExpiryWarnedAt: null, lastActiveAt: { lt: ago(warnAt) } },
      select: { id: true, name: true, lastActiveAt: true, user: { select: { email: true, name: true } } },
      take: BATCH,
    });
    for (const project of toWarn) {
      signal.throwIfAborted();
      await db.$transaction(async (tx) => {
        const { count } = await tx.project.updateMany({
          where: { id: project.id, sourceExpiryWarnedAt: null, lastActiveAt: project.lastActiveAt },
          data: { sourceExpiryWarnedAt: new Date(now) },
        });
        if (count !== 1) return;
        await enqueueEmail(tx, {
          template: "source-expiring",
          to: project.user.email,
          data: { name: project.user.name, projectName: project.name, projectId: project.id, removeOn: day.format(now + SOURCE_WARNING_DAYS * DAY_MS) },
          dedupeKey: `source-expiring:${project.id}:${project.lastActiveAt.toISOString()}`,
        });
      });
    }

    // 3. Originals past retention, whose owner was warned at least the warning period ago.
    const toRemove = await db.project.findMany({
      where: { ...live, lastActiveAt: { lt: ago(SOURCE_RETENTION_DAYS) }, sourceExpiryWarnedAt: { lt: ago(SOURCE_WARNING_DAYS) } },
      select: { id: true, sourceObjectKey: true, lastActiveAt: true },
      take: BATCH,
    });
    for (const project of toRemove) {
      signal.throwIfAborted();
      // Claim first (still untouched since we looked), then remove the file.
      const { count } = await db.project.updateMany({
        where: { id: project.id, sourceDeletedAt: null, lastActiveAt: project.lastActiveAt },
        data: { sourceDeletedAt: new Date(now) },
      });
      if (count === 1 && project.sourceObjectKey) await storage.deleteObject(project.sourceObjectKey);
    }

    log.info("retention.swept", { exportsExpired: exports.length, sourcesWarned: toWarn.length, sourcesRemoved: toRemove.length });
    return noChanges;
  },

  async onPermanentFailure() {},
};
