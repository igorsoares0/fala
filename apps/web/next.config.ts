import path from "node:path";
import type { NextConfig } from "next";

// Environment variables come from the repo-root .env, loaded by the npm scripts (dotenv-cli).
const repoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@fala/shared", "@fala/db"],
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  turbopack: {
    root: repoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
