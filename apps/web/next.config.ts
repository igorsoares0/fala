import path from "node:path";
import type { NextConfig } from "next";

// Environment variables come from the repo-root .env, loaded by the npm scripts (dotenv-cli).
const repoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
    // A full caption save of a 30-minute video (~12,000 words at most) is about 1–2 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@fala/shared", "@fala/db", "@fala/storage"],
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
