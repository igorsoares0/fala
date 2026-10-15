import { Prisma } from "@fala/db";
import { projectPrefix, type JobPayload } from "@fala/shared";
import type { JobHandler } from "./types";

type Payload = JobPayload<"DELETE_PROJECT_ASSETS">;

/** Removes every stored object, the captions and the style of a deleted project (spec FR-16). Safe to repeat. */
export const deleteProjectAssets: JobHandler<Payload> = {
  async run({ payload, storage }) {
    await storage.deletePrefix(projectPrefix(payload.userId, payload.projectId));
    return async (tx) => {
      const { count } = await tx.project.updateMany({
        where: { id: payload.projectId, status: "DELETION_PENDING" },
        data: { status: "DELETED", captionSample: Prisma.DbNull },
      });
      if (count !== 1) return;
      await tx.transcript.deleteMany({ where: { projectId: payload.projectId } });
      await tx.captionTrack.deleteMany({ where: { projectId: payload.projectId } });
      await tx.projectStyle.deleteMany({ where: { projectId: payload.projectId } });
    };
  },

  // The project stays DELETION_PENDING (hidden from the user); the failed job is the record for support.
  async onPermanentFailure() {},
};
