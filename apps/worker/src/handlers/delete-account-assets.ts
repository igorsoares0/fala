import type { JobPayload } from "@fala/shared";
import { noChanges, type JobHandler } from "./types";

type Payload = JobPayload<"DELETE_ACCOUNT_ASSETS">;

/**
 * Removes every stored file of a deleted account (spec FR-16): unfinished uploads
 * first (their parts aren't objects yet), then everything under the user's prefix.
 * The account rows are already gone; this job outlives them. Safe to repeat.
 */
export const deleteAccountAssets: JobHandler<Payload> = {
  async run({ payload, storage }) {
    const prefix = `users/${payload.userId}/`;
    for (const upload of await storage.listMultipartUploads(prefix)) {
      await storage.abortMultipartUpload(upload.key, upload.uploadId);
    }
    await storage.deletePrefix(prefix);
    return noChanges;
  },

  // Left FAILED for support: the files stay private, and the job can be re-queued.
  async onPermanentFailure() {},
};
