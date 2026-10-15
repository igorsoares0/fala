import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@fala/db";
import { isGoogleSignInEnabled } from "./auth-config";
import { sendEmail } from "./email";

const RESET_PASSWORD_TOKEN_TTL_SECONDS = 30 * 60;

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Your Fala sign-in link",
        text: `Use this link to choose a new password and sign in. It expires in 30 minutes.\n\n${url}`,
      });
    },
  },
  socialProviders: isGoogleSignInEnabled()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : undefined,
  // On by default in production (3 sign-in/sign-up attempts per 10s per IP).
  // E2E runs set AUTH_RATE_LIMIT=off because every test signs up from localhost.
  rateLimit: process.env.AUTH_RATE_LIMIT === "off" ? { enabled: false } : undefined,
  // Must stay last: lets Server Actions set auth cookies.
  plugins: [nextCookies()],
});
