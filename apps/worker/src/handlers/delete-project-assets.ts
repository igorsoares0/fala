import { db, Prisma } from "@fala/db";
import { projectPrefix, type JobPayload } from "@fala/shared";
import type { JobHandler } from "./types";

type Payload = JobPayload<"DELETE_PROJECT_ASSETS">;

/** Removes every stored object, the captions, the style and the exports of a deleted project (spec FR-16). Safe to repeat. */
export const deleteProjectAssets: JobHandler<Payload> = {
  async run({ payload, storage }) {
    // Parts of an unfinished upload aren't objects yet: a prefix delete wouldn't see them.
    const project = await db.project.findUnique({
      where: { id: payload.projectId },
      select: { sourceObjectKey: true, sourceUploadId: true },
    });
    if (project?.sourceObjectKey && project.sourceUploadId) {
      await storage.abortMultipartUpload(project.sourceObjectKey, project.sourceUploadId);
    }
    await storage.deletePrefix(projectPrefix(payload.userId, payload.projectId));
    return async (tx) => {
      const { count } = await tx.project.updateMany({
        where: { id: payload.projectId, status: "DELETION_PENDING" },
        data: { status: "DELETED", captionSample: Prisma.DbNull, sourceUploadId: null },
      });
      if (count !== 1) return;
      await tx.transcript.deleteMany({ where: { projectId: payload.projectId } });
      await tx.captionTrack.deleteMany({ where: { projectId: payload.projectId } });
      await tx.projectStyle.deleteMany({ where: { projectId: payload.projectId } });
      await tx.export.deleteMany({ where: { projectId: payload.projectId } });
    };
  },

  // The project stays DELETION_PENDING (hidden from the user); the failed job is the record for support.
  async onPermanentFailure() {},
};
