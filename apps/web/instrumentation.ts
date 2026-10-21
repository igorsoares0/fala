/**
 * Runs once when the server starts. In production, refuses to start with an
 * incomplete configuration (see lib/env.ts).
 */
export async function register() {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next start` in local tests and E2E uses development settings on purpose.
  if (process.env.FALA_SKIP_ENV_CHECK === "1") return;
  const { productionEnvProblems } = await import("./lib/env");
  const problems = productionEnvProblems();
  if (problems.length > 0) {
    throw new Error(`Supertitle can't start: the production configuration is incomplete.\n  ${problems.join("\n  ")}`);
  }
  if (process.env.PADDLE_ENV === "sandbox") {
    // Same JSON-line shape as lib/log.ts (which is server-only and can't load here).
    console.error(JSON.stringify({ time: new Date().toISOString(), level: "warn", event: "billing.paddle_sandbox", detail: "checkouts take test cards only" }));
  }
}
