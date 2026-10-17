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
    throw new Error(`Fala can't start: the production configuration is incomplete.\n  ${problems.join("\n  ")}`);
  }
}
