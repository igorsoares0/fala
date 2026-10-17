import { z } from "zod";

/**
 * Transactional emails (spec FR-15). The web app and the worker only queue them
 * (template + data); the worker renders and sends, so a slow or failing email
 * provider never blocks or undoes anything.
 */
export const EMAIL_TEMPLATES = [
  "reset-password",
  "verify-email",
  "welcome",
  "export-ready",
  "usage-near-limit",
  "subscription-started",
  "subscription-changed",
  "subscription-canceled",
  "payment-failed",
  "source-expiring",
  "account-deleted",
] as const;

export const emailTemplateSchema = z.enum(EMAIL_TEMPLATES);

export type EmailTemplate = z.infer<typeof emailTemplateSchema>;

/** Template data: flat strings and numbers only (names, dates, URLs inside the app). */
export const emailDataSchema = z.record(z.string(), z.union([z.string().max(2_000), z.number()]));

export type EmailData = z.infer<typeof emailDataSchema>;
