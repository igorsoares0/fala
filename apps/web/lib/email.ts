import "server-only";
import { randomUUID } from "node:crypto";
import { db, enqueueEmail } from "@fala/db";
import type { EmailData, EmailTemplate } from "@fala/shared";

/**
 * Transactional email from the web app (spec FR-15): queued for the worker, which
 * renders and sends it. Returns as soon as it's queued; a slow or failing email
 * provider never delays or breaks the request.
 */
export async function queueEmail({
  template,
  to,
  data,
  dedupeKey = `${template}:${randomUUID()}`,
}: {
  template: EmailTemplate;
  to: string;
  data?: EmailData;
  /** Same key, one email. Defaults to a fresh key (every call sends). */
  dedupeKey?: string;
}): Promise<void> {
  await enqueueEmail(db, { template, to, data, dedupeKey });
}
