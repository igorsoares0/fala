import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db, enqueueJob } from "@fala/db";

Object.assign(process.env, {
  PADDLE_ENV: "sandbox",
  PADDLE_API_KEY: "test_api_key",
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_client_token",
  PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test_secret",
  PADDLE_PRICE_CREATOR_MONTHLY: "pri_creator_month",
  PADDLE_PRICE_CREATOR_YEARLY: "pri_creator_year",
  PADDLE_PRICE_PRO_MONTHLY: "pri_pro_month",
  PADDLE_PRICE_PRO_YEARLY: "pri_pro_year",
});

const { prepareAccountDeletion } = await import("./account-deletion");
const { syncSubscription } = await import("./billing-sync");
const { touchProject } = await import("./projects");

const users: string[] = [];
afterAll(async () => {
  await db.job.deleteMany({ where: { dedupeKey: { contains: "test-acct-" } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

async function newUser() {
  const id = `test-acct-${randomUUID()}`;
  await db.user.create({ data: { id, name: "Acct", email: `${id}@test.local` } });
  users.push(id);
  return { id, name: "Acct", email: `${id}@test.local` };
}

const emailsFor = (to: string) => db.job.findMany({ where: { type: "SEND_EMAIL", payload: { path: ["to"], equals: to } }, select: { payload: true } });

describe("account deletion", () => {
  it("cancels the subscription right away, then queues file removal and a goodbye email", async () => {
    const user = await newUser();
    await db.subscription.create({
      data: { userId: user.id, planKey: "pro", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 1e9), paddleSubscriptionId: `sub_${randomUUID()}` },
    });
    const project = await db.project.create({ data: { userId: user.id, name: "Clip", status: "UPLOADED" } });
    await enqueueJob(db, "VALIDATE_VIDEO", project.id, { projectId: project.id, sourceObjectKey: "users/x/projects/y/source/z.mp4" });

    const calls: unknown[] = [];
    await prepareAccountDeletion(user, () => ({ subscriptions: { cancel: async (...args) => void calls.push(args) } }));

    expect(calls).toEqual([[expect.stringMatching(/^sub_/), { effectiveFrom: "immediately" }]]);
    expect(await db.job.findMany({ where: { projectId: project.id }, select: { status: true } })).toEqual([{ status: "CANCELLED" }]);
    const cleanup = await db.job.findMany({ where: { type: "DELETE_ACCOUNT_ASSETS", dedupeKey: { startsWith: `delete-account:${user.id}` } } });
    expect(cleanup).toHaveLength(2);
    expect(cleanup.every((job) => job.availableAt > new Date())).toBe(true);
    expect((await emailsFor(user.email)).map((job) => (job.payload as { template: string }).template)).toContain("account-deleted");

    // Better Auth then deletes the user; the cleanup jobs outlive it.
    await db.user.delete({ where: { id: user.id } });
    expect(await db.job.count({ where: { type: "DELETE_ACCOUNT_ASSETS", dedupeKey: { startsWith: `delete-account:${user.id}` } } })).toBe(2);
  });

  it("refuses to delete when the subscription can't be canceled", async () => {
    const user = await newUser();
    await db.subscription.create({
      data: { userId: user.id, planKey: "creator", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 1e9), paddleSubscriptionId: `sub_${randomUUID()}` },
    });
    await expect(
      prepareAccountDeletion(user, () => ({ subscriptions: { cancel: async () => Promise.reject(new Error("Paddle down")) } })),
    ).rejects.toThrow(/couldn't cancel your subscription/);
    expect(await db.job.count({ where: { type: "DELETE_ACCOUNT_ASSETS", dedupeKey: { startsWith: `delete-account:${user.id}` } } })).toBe(0);
  });
});

describe("subscription emails", () => {
  it("emails once when a plan starts, changes, is canceled or a payment fails", async () => {
    const user = await newUser();
    const base = {
      subscriptionId: `sub_${randomUUID()}`,
      customerId: "ctm_x",
      status: "active",
      priceId: "pri_creator_month",
      periodStart: new Date(Date.now() - 1000).toISOString(),
      periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      cancelAt: null,
      userId: user.id,
    };
    let t = Date.now();
    const at = () => new Date((t += 1000)).toISOString();
    await syncSubscription({ ...base, updatedAt: at() });
    await syncSubscription({ ...base, updatedAt: at() }); // a repeat: no new email
    await syncSubscription({ ...base, priceId: "pri_pro_month", updatedAt: at() });
    await syncSubscription({ ...base, priceId: "pri_pro_month", status: "past_due", updatedAt: at() });
    await syncSubscription({ ...base, priceId: "pri_pro_month", status: "past_due", cancelAt: base.periodEnd, updatedAt: at() });

    const templates = (await emailsFor(user.email)).map((job) => (job.payload as { template: string }).template).sort();
    expect(templates).toEqual(["payment-failed", "subscription-canceled", "subscription-changed", "subscription-started"]);
  });
});

describe("project activity", () => {
  it("opening a project restarts its retention clock", async () => {
    const user = await newUser();
    const old = new Date(Date.now() - 85 * 86_400_000);
    const project = await db.project.create({ data: { userId: user.id, name: "Old", status: "READY", lastActiveAt: old, sourceExpiryWarnedAt: new Date() } });
    await touchProject(user.id, project.id);
    const touched = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(touched.lastActiveAt.getTime()).toBeGreaterThan(old.getTime());
    expect(touched.sourceExpiryWarnedAt).toBeNull();
  });
});
