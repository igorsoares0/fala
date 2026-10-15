import { projectPrefix, type JobPayload } from "@fala/shared";
import type { JobHandler } from "./types";

type Payload = JobPayload<"DELETE_PROJECT_ASSETS">;

/** Removes every stored object of a deleted project (source, thumbnails…). Safe to repeat. */
export const deleteProjectAssets: JobHandler<Payload> = {
  async run({ payload, storage }) {
    await storage.deletePrefix(projectPrefix(payload.userId, payload.projectId));
    return async (tx) => {
      await tx.project.updateMany({
        where: { id: payload.projectId, status: "DELETION_PENDING" },
        data: { status: "DELETED" },
      });
    };
  },

  // The project stays DELETION_PENDING (hidden from the user); the failed job is the record for support.
  async onPermanentFailure() {},
};
