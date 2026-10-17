import { z } from "zod";
import { legalPlaceholders } from "./legal";

/**
 * Production settings, checked once at startup (instrumentation.ts) so a missing or
 * wrong variable stops the deploy instead of failing on a user's first click.
 * Errors name the variables, never their values.
 */
const url = z.url();
const nonEmpty = z.string().min(1);

const productionSchema = z.object({
  DATABASE_URL: nonEmpty,
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: url.refine((value) => value.startsWith("https://"), "must be https"),
  APP_URL: url.refine((value) => value.startsWith("https://"), "must be https"),
  R2_ENDPOINT: url,
  R2_ACCESS_KEY_ID: nonEmpty,
  R2_SECRET_ACCESS_KEY: nonEmpty,
  R2_BUCKET_NAME: nonEmpty,
  PADDLE_ENV: z.literal("production"),
  PADDLE_API_KEY: nonEmpty,
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: nonEmpty,
  PADDLE_WEBHOOK_SECRET: nonEmpty,
  PADDLE_PRICE_CREATOR_MONTHLY: z.string().startsWith("pri_"),
  PADDLE_PRICE_CREATOR_YEARLY: z.string().startsWith("pri_"),
  PADDLE_PRICE_PRO_MONTHLY: z.string().startsWith("pri_"),
  PADDLE_PRICE_PRO_YEARLY: z.string().startsWith("pri_"),
});

/** Problems with the production environment, as "NAME: reason" lines; empty when ready. */
export function productionEnvProblems(env: Record<string, string | undefined> = process.env): string[] {
  const result = productionSchema.safeParse(env);
  const problems = result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  for (const field of legalPlaceholders()) problems.push(`lib/legal.ts LEGAL.${field}: still a placeholder`);
  if (env.UPLOAD_PART_SIZE_BYTES) problems.push("UPLOAD_PART_SIZE_BYTES: test-only, remove it");
  return problems;
}
