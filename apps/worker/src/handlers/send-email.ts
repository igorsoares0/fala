import type { JobPayload } from "@fala/shared";
import { renderEmail } from "../email/templates";
import { JobError } from "../errors";
import { log } from "../log";
import { noChanges, type JobHandler } from "./types";

type Payload = JobPayload<"SEND_EMAIL">;

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 15_000;

/**
 * Sends one queued email (spec FR-15) through Resend, or prints it in development.
 * The job id is Resend's idempotency key, so a retry after a timeout never sends twice.
 * A rejected message (bad address) fails for good; provider or network errors retry.
 */
export const sendEmail: JobHandler<Payload> = {
  async run({ job, payload, config, signal }) {
    const email = renderEmail(payload.template, payload.data, config.appUrl);

    if (config.email.provider === "log") {
      log.info("email.logged", { jobId: job.id, template: payload.template });
      process.stdout.write(`[email] to=${payload.to} subject="${email.subject}"\n${email.text}\n`);
      return noChanges;
    }

    let response: Response;
    try {
      response = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.email.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": job.id,
        },
        body: JSON.stringify({ from: config.email.from, to: [payload.to], subject: email.subject, text: email.text, html: email.html }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(SEND_TIMEOUT_MS)]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new JobError("EMAIL_FAILED", "Email provider unreachable", { retryable: true });
    }

    if (response.status >= 500 || response.status === 429) {
      throw new JobError("EMAIL_FAILED", `Email provider returned ${response.status}`, { retryable: true });
    }
    if (!response.ok) {
      // The message itself was refused (address, sender, content): retrying can't help.
      const detail = await response.text().catch(() => "");
      throw new JobError("EMAIL_FAILED", `Email rejected (${response.status}): ${detail.slice(0, 200)}`, { retryable: false });
    }
    log.info("email.sent", { jobId: job.id, template: payload.template });
    return noChanges;
  },

  // Nothing to roll back: a lost email never undoes the change that triggered it.
  async onPermanentFailure() {},
};
