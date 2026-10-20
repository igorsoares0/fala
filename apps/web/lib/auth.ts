import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@fala/db";
import { PLANS } from "@fala/shared";
import { authIpAddressOptions, isGoogleSignInEnabled } from "./auth-config";
import { prepareAccountDeletion } from "./account-deletion";
import { queueEmail } from "./email";

const RESET_PASSWORD_TOKEN_TTL_SECONDS = 30 * 60;

/**
 * Emails to an address nobody has confirmed carry no user-supplied text (such as the
 * name): anyone can sign up with someone else's address, and must not be able to
 * send them a message of their choosing from our domain.
 */
const nameIfConfirmed = (user: { name: string; emailVerified: boolean }): { name?: string } =>
  user.emailVerified ? { name: user.name } : {};

async function queueWelcome(user: { id: string; email: string; name: string }) {
  await queueEmail({
    template: "welcome",
    to: user.email,
    data: { name: user.name, minutes: PLANS.free.monthlyMinutes },
    dedupeKey: `welcome:${user.id}`,
  });
}

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await queueEmail({ template: "reset-password", to: user.email, data: { ...nameIfConfirmed(user), url } });
    },
  },
  // Confirms the address after sign-up (uploads wait for it, see lib/uploads.ts) and
  // a new address when the email changes (Account → Profile).
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // An address other than the stored one is an email change waiting for confirmation.
      const stored = await db.user.findUnique({ where: { id: user.id }, select: { email: true } });
      const template = stored?.email === user.email ? "confirm-email" : "verify-email";
      await queueEmail({ template, to: user.email, data: { url } });
    },
    afterEmailVerification: async (user) => queueWelcome(user),
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
        // Google accounts arrive confirmed; email sign-ups get their welcome once they confirm.
        after: async (user) => {
          if (user.emailVerified) await queueWelcome(user);
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
            "/send-verification-email": { window: 3600, max: 5 },
          },
        },
  advanced: { ipAddress: authIpAddressOptions() },
  // Must stay last: lets Server Actions set auth cookies.
  plugins: [nextCookies()],
});
