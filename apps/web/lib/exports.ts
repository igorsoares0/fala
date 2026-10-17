import "server-only";
import { accountPeriod, db, enqueueJob, lockAccount, Prisma } from "@fala/db";
import {
  captionTrackSchema,
  exportErrorFor,
  exportErrorRef,
  exportFileName,
  exportSnapshotSchema,
  type ExportResolution,
  type ExportStatus,
} from "@fala/shared";
import { getStorage } from "@fala/storage";
import { parseProjectStyle } from "./style";

/**
 * Exports (spec FR-11, FR-12): each one renders a frozen snapshot of the captions
 * and style into its own MP4, so editing never changes a render that's queued or
 * running, and a new render never overwrites an older version. Owner-scoped like
 * lib/projects.ts: someone else's export behaves exactly like a missing one.
 */

/** A failed render is retried once automatically before the user sees "Render failed". */
const RENDER_MAX_ATTEMPTS = 2;
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

const exportSelect = {
  id: true,
  version: true,
  status: true,
  progress: true,
  resolution: true,
  width: true,
  height: true,
  durationMs: true,
  fileSizeBytes: true,
  errorCode: true,
  createdAt: true,
  completedAt: true,
  project: { select: { name: true } },
} as const;

type ExportRow = Prisma.ExportGetPayload<{ select: typeof exportSelect }>;

/** What the editor shows about an export. Object keys stay on the server. */
export type ExportView = {
  id: string;
  version: number;
  status: ExportStatus;
  progress: number;
  resolution: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fileSizeBytes: number | null;
  fileName: string;
  /** For FAILED: what to tell the user, plus a reference for support. */
  error: { code: string; message: string; ref: string } | null;
  createdAt: string;
  completedAt: string | null;
};

function toView({ project, errorCode, createdAt, completedAt, ...row }: ExportRow): ExportView {
  return {
    ...row,
    fileName: exportFileName(project.name, row.version),
    error:
      row.status === "FAILED"
        ? { code: errorCode ?? "RENDER_FAILED", message: exportErrorFor(errorCode), ref: exportErrorRef(row.id) }
        : null,
    createdAt: createdAt.toISOString(),
    completedAt: completedAt?.toISOString() ?? null,
  };
}

const ownedExport = (userId: string, exportId: string) => ({ id: exportId, project: { userId, deletedAt: null } });

export type CreateExportResult =
  | { ok: true; export: ExportView }
  | { ok: false; status: 403 | 404 | 409; error: string; reason?: "not-ready" | "unsaved" | "plan" | "busy" };

/**
 * Freezes the project's current captions and style and queues the render.
 * `captionVersion` is the caption version the editor has saved: if the server has
 * a different one, the snapshot wouldn't be what the user is looking at.
 * While a render is queued or running, asking again returns that one.
 */
export async function createExport(
  userId: string,
  projectId: string,
  { resolution, captionVersion }: { resolution: ExportResolution; captionVersion: number },
): Promise<CreateExportResult> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: {
      status: true,
      sourceObjectKey: true,
      width: true,
      height: true,
      durationMs: true,
      captionTrack: { select: { language: true, words: true, blocks: true, version: true } },
      style: { select: { presetKey: true, configuration: true } },
    },
  });
  if (!project) return { ok: false, status: 404, error: "This project doesn't exist anymore." };

  const { captionTrack, sourceObjectKey, width, height, durationMs } = project;
  const track = captionTrackSchema.safeParse(captionTrack);
  if (project.status !== "READY" || !track.success || !sourceObjectKey || !width || !height || !durationMs) {
    return { ok: false, status: 409, reason: "not-ready", error: "Export is available once transcription finishes." };
  }
  if (captionTrack!.version !== captionVersion) {
    return { ok: false, status: 409, reason: "unsaved", error: "Your latest changes are still saving. Try again in a moment." };
  }

  const active = await findActiveExport(projectId);
  if (active) return { ok: true, export: toView(active) };

  const { plan } = await accountPeriod(db, userId);
  if (resolution > plan.maxResolution) {
    return { ok: false, status: 403, reason: "plan", error: `Your plan exports up to ${plan.maxResolution}p. Creator and Pro export in 1080p.` };
  }

  const style = parseProjectStyle(project.style);
  const snapshot = exportSnapshotSchema.parse({
    sourceObjectKey,
    captionVersion,
    track: track.data,
    presetKey: style.presetKey,
    style: style.style,
    width,
    height,
    durationMs,
  });

  try {
    const created = await db.$transaction(async (tx) => {
      // Renders at once, across all of the user's projects: checked under the account lock.
      await lockAccount(tx, userId);
      const rendering = await tx.export.count({
        where: { status: { in: ["QUEUED", "RENDERING"] }, project: { userId, deletedAt: null } },
      });
      if (rendering >= plan.simultaneousExports) return null;

      const { _max } = await tx.export.aggregate({ where: { projectId }, _max: { version: true } });
      const row = await tx.export.create({
        data: {
          projectId,
          version: (_max.version ?? 0) + 1,
          resolution,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
        select: exportSelect,
      });
      await enqueueJob(tx, "RENDER_EXPORT", projectId, { projectId, exportId: row.id }, { maxAttempts: RENDER_MAX_ATTEMPTS, exportId: row.id });
      return row;
    });
    if (!created) {
      const renders = plan.simultaneousExports === 1 ? "1 render" : `${plan.simultaneousExports} renders`;
      return {
        ok: false,
        status: 409,
        reason: "busy",
        error: `Your plan runs ${renders} at a time. This one can start when another finishes.`,
      };
    }
    return { ok: true, export: toView(created) };
  } catch (error) {
    // Two clicks at once both took the same version number: the other one won.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await findActiveExport(projectId);
      if (winner) return { ok: true, export: toView(winner) };
    }
    throw error;
  }
}

function findActiveExport(projectId: string) {
  return db.export.findFirst({
    where: { projectId, status: { in: ["QUEUED", "RENDERING"] } },
    orderBy: { version: "desc" },
    select: exportSelect,
  });
}

/** Newest first. Null when the project doesn't exist for this user. */
export async function listExports(userId: string, projectId: string): Promise<ExportView[] | null> {
  const owned = await db.project.count({ where: { id: projectId, userId, deletedAt: null } });
  if (owned !== 1) return null;
  const rows = await db.export.findMany({ where: { projectId }, orderBy: { version: "desc" }, select: exportSelect });
  return rows.map(toView);
}

export async function getExport(userId: string, exportId: string): Promise<ExportView | null> {
  const row = await db.export.findFirst({ where: ownedExport(userId, exportId), select: exportSelect });
  return row ? toView(row) : null;
}

export type RetryExportResult = { ok: true; export: ExportView } | { ok: false; status: 404 | 409; error: string };

/** Renders a failed export again, from the same snapshot (handoff "Try again"). */
export async function retryExport(userId: string, exportId: string): Promise<RetryExportResult> {
  const row = await db.export.findFirst({ where: ownedExport(userId, exportId), select: { projectId: true, status: true } });
  if (!row) return { ok: false, status: 404, error: "This export doesn't exist anymore." };
  if (row.status !== "FAILED") return { ok: false, status: 409, error: "Only a failed render can be tried again." };

  const retried = await db.$transaction(async (tx) => {
    const { count } = await tx.export.updateMany({
      where: { id: exportId, status: "FAILED" },
      data: { status: "QUEUED", progress: 0, errorCode: null, startedAt: null, completedAt: null },
    });
    if (count !== 1) return false;
    await enqueueJob(tx, "RENDER_EXPORT", row.projectId, { projectId: row.projectId, exportId }, { maxAttempts: RENDER_MAX_ATTEMPTS, exportId });
    return true;
  });
  if (!retried) return { ok: false, status: 409, error: "This render is already running again." };
  return { ok: true, export: (await getExport(userId, exportId))! };
}

/** A short-lived URL that downloads the MP4 under its friendly name; null unless finished and owned. */
export async function exportDownloadUrl(userId: string, exportId: string): Promise<string | null> {
  const row = await db.export.findFirst({
    where: { ...ownedExport(userId, exportId), status: "SUCCEEDED", objectKey: { not: null } },
    select: { objectKey: true, version: true, project: { select: { name: true } } },
  });
  if (!row?.objectKey) return null;
  return getStorage().presignGet(row.objectKey, DOWNLOAD_URL_TTL_SECONDS, {
    downloadName: exportFileName(row.project.name, row.version),
  });
}
