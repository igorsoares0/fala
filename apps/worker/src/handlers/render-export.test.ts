import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, enqueueJob, type Prisma } from "@fala/db";
import { exportKey, PRESETS, segmentWords, sourceKey, type CaptionTrack, type ExportSnapshot } from "@fala/shared";
import { closeBrowser } from "../media/overlay";
import { probeFile } from "../media/probe";
import { createRunner } from "../runner";
import { createTestUser, testConfig, testStorage } from "../test-support";

const config = testConfig();
const storage = testStorage();
let userId: string;
let dir: string;
let sourcePath: string;

/** A plain dark-grey clip, so any yellow in the output can only be the caption highlight. */
const WIDTH = 360;
const HEIGHT = 640;
const DURATION_MS = 2000;

/** "ONE TWO" from 0.1 s to 1.3 s; the second word is spoken from 0.7 s; nothing after 1.3 s. */
const track: CaptionTrack = {
  language: "en",
  words: [
    { text: "one", startMs: 100, endMs: 600 },
    { text: "two", startMs: 700, endMs: 1200 },
  ],
  blocks: [{ id: "b1", wordStart: 0, wordEnd: 1, startMs: 100, endMs: 1300 }],
};

beforeAll(async () => {
  userId = await createTestUser();
  dir = await mkdtemp(path.join(os.tmpdir(), "fala-render-test-"));
  sourcePath = path.join(dir, "source.mp4");
  execFileSync(config.ffmpegPath, [
    "-v", "error",
    "-f", "lavfi", "-i", `color=c=0x202020:s=${WIDTH}x${HEIGHT}:r=30:d=2`,
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-y", sourcePath,
  ]);
});

beforeEach(async () => {
  await db.job.deleteMany({});
});

afterAll(async () => {
  await closeBrowser();
  await storage.deletePrefix(`users/${userId}/`);
  await db.job.deleteMany({});
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

async function queuedExport({
  upload = true,
  source = sourcePath,
  durationMs = DURATION_MS,
  width = WIDTH,
  height = HEIGHT,
  captions = track,
  presetKey = "bold" as ExportSnapshot["presetKey"],
} = {}) {
  const project = await db.project.create({
    data: { userId, name: "Render test", status: "READY", durationMs, width, height },
  });
  const key = sourceKey(userId, project.id, "src1", "mp4");
  if (upload) await storage.uploadFile(key, source, "video/mp4");
  const snapshot: ExportSnapshot = {
    sourceObjectKey: key,
    captionVersion: 1,
    track: captions,
    presetKey,
    style: PRESETS[presetKey].style,
    width,
    height,
    durationMs,
  };
  const created = await db.export.create({
    data: { projectId: project.id, version: 1, resolution: 720, snapshot: snapshot as unknown as Prisma.InputJsonValue },
  });
  const job = await enqueueJob(db, "RENDER_EXPORT", project.id, { projectId: project.id, exportId: created.id }, { maxAttempts: 1, exportId: created.id });
  return { projectId: project.id, exportId: created.id, jobId: job.id };
}

const run = () => createRunner({ config, storage }).processNextJob();

/** RGB pixels of the frame at `seconds`. */
function frameAt(file: string, seconds: number): Buffer {
  return execFileSync(config.ffmpegPath, ["-v", "error", "-ss", String(seconds), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], {
    maxBuffer: 50 * 1024 * 1024,
  });
}

/** Pixels close to the Bold preset's highlight (#ffd400). */
function highlightPixels(rgb: Buffer): number {
  let count = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    if (rgb[i] > 225 && Math.abs(rgb[i + 1] - 212) < 25 && rgb[i + 2] < 60) count++;
  }
  return count;
}

/** Bright, near-white pixels: caption text. */
function whitePixels(rgb: Buffer): number {
  let count = 0;
  for (let i = 0; i < rgb.length; i += 3) if (rgb[i] > 220 && rgb[i + 1] > 220 && rgb[i + 2] > 220) count++;
  return count;
}

describe("RENDER_EXPORT", () => {
  it("burns the captions into an MP4 that matches the snapshot, and stores it under the export's own key", { timeout: 120_000 }, async () => {
    const { projectId, exportId, jobId } = await queuedExport();
    await run();
    expect(await db.job.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status: "SUCCEEDED" });

    const done = await db.export.findUniqueOrThrow({ where: { id: exportId } });
    const key = exportKey(userId, projectId, exportId);
    // Never upscaled: a 360×640 source stays 360×640 even when 720p was asked for.
    expect(done).toMatchObject({ status: "SUCCEEDED", progress: 100, objectKey: key, width: WIDTH, height: HEIGHT });
    expect(done.fileSizeBytes).toBeGreaterThan(0);
    expect(Math.abs(done.durationMs! - DURATION_MS)).toBeLessThanOrEqual(500);

    const output = path.join(dir, `${exportId}.mp4`);
    await storage.downloadToFile(key, output);
    const probe = await probeFile(config.ffprobePath, output);
    expect(probe.streams).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({ codec_type: "video", codec_name: "h264", width: WIDTH, height: HEIGHT }),
        expect.objectContaining({ codec_type: "audio", codec_name: "aac" }),
      ]),
    );

    // Same rules as the preview: the spoken word is boxed in the highlight color…
    const speaking = frameAt(output, 0.95);
    expect(highlightPixels(speaking)).toBeGreaterThan(200);
    expect(whitePixels(speaking)).toBeGreaterThan(100);
    // …and between blocks there's no caption at all.
    const gap = frameAt(output, 1.6);
    expect(highlightPixels(gap)).toBe(0);
    expect(whitePixels(gap)).toBe(0);
  });

  it("renders a 20-minute video with thousands of caption words", { timeout: 300_000 }, async () => {
    const durationMs = 20 * 60_000;
    const longSource = path.join(dir, "long.mp4");
    execFileSync(config.ffmpegPath, [
      "-v", "error",
      "-f", "lavfi", "-i", "color=c=0x202020:s=180x320:r=15:d=1200",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1200",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-y", longSource,
    ]);
    // A natural pace: ~3,200 words.
    const words = Array.from({ length: Math.floor(durationMs / 370) }, (_, index) => ({
      text: ["every", "word", "lands"][index % 3],
      startMs: index * 370,
      endMs: index * 370 + 320,
    }));
    const captions: CaptionTrack = { language: "en", words, blocks: segmentWords(words, { maxWords: 7, durationMs, language: "en" }) };

    const { exportId, jobId } = await queuedExport({ source: longSource, durationMs, width: 180, height: 320, captions, presetKey: "classic" });
    await run();
    expect(await db.job.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status: "SUCCEEDED" });
    const done = await db.export.findUniqueOrThrow({ where: { id: exportId } });
    expect(done).toMatchObject({ status: "SUCCEEDED", width: 180, height: 320 });
    expect(Math.abs(done.durationMs! - durationMs)).toBeLessThanOrEqual(500);
  });

  it("fails for good, with SOURCE_MISSING, when the original video is gone", { timeout: 60_000 }, async () => {
    const { exportId, jobId } = await queuedExport({ upload: false });
    await run();
    expect(await db.job.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status: "FAILED" });
    expect(await db.export.findUniqueOrThrow({ where: { id: exportId } })).toMatchObject({ status: "FAILED", errorCode: "SOURCE_MISSING" });
  });

  it("does nothing when the export is no longer waiting for a render", async () => {
    const { exportId, jobId } = await queuedExport();
    await db.export.update({ where: { id: exportId }, data: { status: "SUCCEEDED" } });
    await run();
    expect(await db.job.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status: "SUCCEEDED" });
    expect(await db.export.findUniqueOrThrow({ where: { id: exportId } })).toMatchObject({ status: "SUCCEEDED", objectKey: null });
  });
});
