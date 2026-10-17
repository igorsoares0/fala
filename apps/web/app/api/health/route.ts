import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@fala/db";
import { log, safeError } from "@/lib/log";

const STALE_WORKER_MS = 3 * 60_000;
const noStore = { "Cache-Control": "no-store" };

function hasToken(request: Request) {
  const expected = process.env.HEALTH_TOKEN;
  const given = new URL(request.url).searchParams.get("token") ?? "";
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * GET → uptime check: the app answers and reaches its database (no details either way).
 * GET ?deep=1&token=… → also the queue and the workers, for monitoring (HEALTH_TOKEN).
 */
export async function GET(request: Request) {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    log.error("health.database_unreachable", { error: safeError(error) });
    return NextResponse.json({ ok: false }, { status: 503, headers: noStore });
  }
  if (new URL(request.url).searchParams.get("deep") !== "1") return NextResponse.json({ ok: true }, { headers: noStore });
  if (!hasToken(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: noStore });

  const now = Date.now();
  const [pending, oldest, workers] = await Promise.all([
    db.job.count({ where: { status: { in: ["PENDING", "RETRY_WAIT"] }, availableAt: { lte: new Date(now) } } }),
    db.job.findFirst({ where: { status: "PENDING", availableAt: { lte: new Date(now) } }, orderBy: { availableAt: "asc" }, select: { availableAt: true } }),
    db.workerHeartbeat.findMany({ select: { workerId: true, lastSeenAt: true, runningJobs: true } }),
  ]);
  const live = workers.filter((worker) => now - worker.lastSeenAt.getTime() < STALE_WORKER_MS);
  const oldestWaitSeconds = oldest ? Math.round((now - oldest.availableAt.getTime()) / 1000) : 0;
  const ok = live.length > 0;
  return NextResponse.json(
    {
      ok,
      queue: { due: pending, oldestWaitSeconds },
      workers: { live: live.length, stale: workers.length - live.length, running: live.reduce((sum, worker) => sum + worker.runningJobs, 0) },
    },
    { status: ok ? 200 : 503, headers: noStore },
  );
}
