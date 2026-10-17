import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@fala/db";
import { PLANS } from "@fala/shared";
import { isGoogleSignInEnabled } from "./auth-config";
import { prepareAccountDeletion } from "./account-deletion";
import { queueEmail } from "./email";

const RESET_PASSWORD_TOKEN_TTL_SECONDS = 30 * 60;

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await queueEmail({ template: "reset-password", to: user.email, data: { name: user.name, url } });
    },
  },
  // Used to confirm a new address when the email changes (Account → Profile).
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await queueEmail({ template: "verify-email", to: user.email, data: { name: user.name, url } });
    },
  },
  user: {
    // The current email stays active until the new one is confirmed.
    changeEmail: { enabled: true },
    deleteUser: {
      enabled: true,
      // Cancels billing and queues file removal; throws (and so stops the deletion) if billing can't be canceled.
      beforeDelete: async (user) => prepareAccountDeletion(user),
    },
    additionalFields: {
      emailOnExport: { type: "boolean", defaultValue: true, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await queueEmail({
            template: "welcome",
            to: user.email,
            data: { name: user.name, minutes: PLANS.free.monthlyMinutes },
            dedupeKey: `welcome:${user.id}`,
          });
        },
      },
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
  rateLimit:
    process.env.AUTH_RATE_LIMIT === "off"
      ? { enabled: false }
      : {
          // Emails cost money and can be used to pester someone: a few per hour is plenty.
          customRules: {
            "/request-password-reset": { window: 3600, max: 5 },
            "/change-email": { window: 3600, max: 5 },
          },
        },
  // Must stay last: lets Server Actions set auth cookies.
  plugins: [nextCookies()],
});
