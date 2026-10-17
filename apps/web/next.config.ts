import path from "node:path";
import type { NextConfig } from "next";

// Environment variables come from the repo-root .env, loaded by the npm scripts (dotenv-cli).
const repoRoot = path.resolve(__dirname, "../..");

/** Where browsers fetch videos and thumbnails from, and upload parts to (signed URLs). */
function storageOrigin() {
  try {
    return process.env.R2_ENDPOINT ? new URL(process.env.R2_ENDPOINT).origin : "";
  } catch {
    return "";
  }
}

/**
 * Content-Security-Policy: only what the app loads. Inline scripts/styles stay allowed
 * (Next's bootstrap and the caption styles); Paddle's checkout is the only third party.
 */
function contentSecurityPolicy() {
  const storage = storageOrigin();
  const paddle = "https://cdn.paddle.com https://*.paddle.com";
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${paddle}${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' ${paddle}`,
    `img-src 'self' data: blob: ${storage} ${paddle}`,
    `media-src 'self' blob: ${storage}`,
    `connect-src 'self' ${storage} ${paddle}${dev ? " ws:" : ""}`,
    `frame-src ${paddle}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://buy.paddle.com\" \"https://sandbox-buy.paddle.com\")" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
