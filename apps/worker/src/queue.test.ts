import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, enqueueJob } from "@fala/db";
import { LeaseLostError } from "./errors";
import { backoffMs, claimJob, completeJob, releaseJob, retryJobLater } from "./queue";
import { createTestUser } from "./test-support";

let userId: string;
let projectId: string;

beforeAll(async () => {
  userId = await createTestUser();
  ({ id: projectId } = await db.project.create({ data: { userId, name: "Queue test" } }));
});

beforeEach(async () => {
  await db.job.deleteMany({});
});

afterAll(async () => {
  await db.job.deleteMany({});
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

const enqueue = () => enqueueJob(db, "DELETE_PROJECT_ASSETS", projectId, { projectId, userId });

describe("job queue", () => {
  it("never hands the same job to two workers claiming at once", async () => {
    for (let i = 0; i < 5; i++) await enqueue();

    const claims = await Promise.all(Array.from({ length: 8 }, (_, i) => claimJob(`worker-${i}`, 60_000)));
    const claimed = claims.filter((job) => job !== null);

    expect(claimed).toHaveLength(5);
    expect(new Set(claimed.map((job) => job.id)).size).toBe(5);
    expect(claimed.every((job) => job.attempts === 1)).toBe(true);
    expect(await claimJob("worker-late", 60_000)).toBeNull();
  });

  it("lets another worker recover a job whose lease expired, and fences out the old worker", async () => {
    const { id } = await enqueue();
    const first = await claimJob("crashed-worker", 1);
    expect(first?.id).toBe(id);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const recovered = await claimJob("healthy-worker", 60_000);
    expect(recovered).toMatchObject({ id, attempts: 2 });

    // The first worker comes back to life: its result must not be published.
    await expect(completeJob(first!, "crashed-worker", async () => {})).rejects.toBeInstanceOf(LeaseLostError);
    await completeJob(recovered!, "healthy-worker", async () => {});
    expect(await db.job.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "SUCCEEDED", lockedBy: null });
  });

  it("schedules retries with exponential backoff", async () => {
    expect([1, 2, 3, 10].map(backoffMs)).toEqual([5_000, 10_000, 20_000, 300_000]);

    const { id } = await enqueue();
    const job = await claimJob("worker", 60_000);
    await retryJobLater(job!, "worker", { code: "PROCESSING_FAILED", message: "boom" });

    const stored = await db.job.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ status: "RETRY_WAIT", lastErrorCode: "PROCESSING_FAILED", lockedBy: null });
    // Not due yet.
    expect(await claimJob("worker", 60_000)).toBeNull();
  });

  it("releases a job on shutdown without counting the attempt", async () => {
    const { id } = await enqueue();
    const job = await claimJob("worker", 60_000);
    await releaseJob(job!, "worker");
    expect(await db.job.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PENDING", attempts: 0 });
    expect((await claimJob("worker", 60_000))?.id).toBe(id);
  });
});
