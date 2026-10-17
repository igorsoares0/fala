/**
 * Dev/sandbox tool: puts an account on a plan without going through Paddle.
 *
 *   npm run plan:set -- someone@example.com creator
 *
 * The period starts now and lasts one month; "free" removes the subscription.
 */
import { db } from "@fala/db";
import { planKeySchema } from "@fala/shared";

async function main() {
  // In production the plan comes from Paddle only.
  if (process.env.PADDLE_ENV === "production") throw new Error("plan:set is a sandbox/dev tool; plans come from Paddle in production.");
  const [email, planArg] = process.argv.slice(2);
  const plan = planKeySchema.safeParse(planArg);
  if (!email || !plan.success) throw new Error("Usage: npm run plan:set -- <email> <free|creator|pro>");

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No account with that email.`);

  if (plan.data === "free") {
    await db.subscription.deleteMany({ where: { userId: user.id } });
    console.log("Moved to Free.");
    return;
  }
  const start = new Date();
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const period = { planKey: plan.data, status: "ACTIVE" as const, currentPeriodStart: start, currentPeriodEnd: end };
  await db.subscription.upsert({ where: { userId: user.id }, create: { userId: user.id, ...period }, update: period });
  console.log(`Moved to ${plan.data} until ${end.toISOString().slice(0, 10)}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
