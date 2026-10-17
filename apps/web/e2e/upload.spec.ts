import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { bufferVideo, createProject, PROCESSING_TIMEOUT, signUp, uniqueEmail, videoFile } from "./helpers";


test("an uploaded video is validated and shows its thumbnail and duration", async ({ page }) => {
  await signUp(page, { name: "Uploader", email: uniqueEmail("upload") });

  const card = await createProject(page, "Beach day.mp4");
  await expect(card.getByText("Ready")).toBeVisible({ timeout: PROCESSING_TIMEOUT });
  await expect(card.getByTestId("processing-overlay")).toHaveCount(0);
  await expect(card.getByText("0:02")).toBeVisible();

  const thumbnail = card.getByTestId("project-thumbnail");
  await expect(thumbnail).toBeVisible();
  await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // Transcribed: the card shows the first caption, in the default preset.
  await expect(card.getByText("rhythm", { exact: true })).toBeVisible();

  await card.getByRole("link", { name: "Open Beach day" }).click();
  await expect(page.getByText("YOUR VIDEO · 720×1280")).toBeVisible();
  await expect(page.getByTestId("caption-block").first()).toContainText("It's the rhythm");
});

test("captions follow the video: clicking a block seeks, playing moves the active block", async ({ page }) => {
  await signUp(page, { name: "Viewer", email: uniqueEmail("captions") });
  // WEBM, because Playwright's Chromium can't decode H.264.
  const card = await createProject(page, "Street interview.webm", "landscape-2s.webm");
  await expect(card.getByText("Ready")).toBeVisible({ timeout: PROCESSING_TIMEOUT });
  await card.getByRole("link", { name: "Open Street interview" }).click();

  const blocks = page.getByTestId("caption-block");
  await expect(page.getByRole("heading", { name: "Captions" })).toBeVisible();
  expect(await blocks.count()).toBeGreaterThan(2);
  await expect(blocks.first()).toContainText("00:00.0 →");

  const video = await bufferVideo(page);

  // Clicking a block jumps the video to its start.
  await blocks.nth(2).click();
  await expect(blocks.nth(2)).toHaveAttribute("aria-current", "true");
  const seekedTo = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(seekedTo).toBeGreaterThan(1);

  // Playing from the start, the highlight follows the video clock.
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 0;
    v.muted = true;
    return v.play();
  });
  // Wait on the video's own clock, not wall time: under load playback can start late.
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.6);
  await expect(blocks.nth(1)).toHaveAttribute("aria-current", "true", { timeout: 10_000 });
});

test("a video without sound fails with a clear message, and another file fixes it", async ({ page }) => {
  await signUp(page, { name: "Silent", email: uniqueEmail("silent") });

  const card = await createProject(page, "Silent take.mp4", "no-audio-2s.mp4");
  await expect(card.getByText("This video has no sound")).toBeVisible({ timeout: PROCESSING_TIMEOUT });
  await expect(card.getByText("Error", { exact: true })).toBeVisible();

  await expect(card.getByRole("button", { name: "Upload another file" })).toBeVisible();
  await card.locator('input[type="file"]').setInputFiles(videoFile("Silent take fixed.mp4"));
  await expect(card.getByText("Ready")).toBeVisible({ timeout: PROCESSING_TIMEOUT });
  await expect(card.getByText("This video has no sound")).toHaveCount(0);
});

test("files that aren't supported videos are refused before anything is created", async ({ page }) => {
  await signUp(page, { name: "Picky", email: uniqueEmail("picky") });

  await page.getByTestId("new-video-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a video"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "That file type isn't supported" })).toBeVisible();
  await expect(page.getByText("0 videos")).toBeVisible();
});

test("a large file goes up in parts and survives a dropped connection", async ({ page, context }) => {
  test.setTimeout(120_000);
  // Over 10 MB: several 5 MB parts (see UPLOAD_PART_SIZE_BYTES in playwright.config.ts).
  const dir = mkdtempSync(path.join(os.tmpdir(), "fala-e2e-large-"));
  const file = path.join(dir, "large.mp4");
  execFileSync("ffmpeg", [
    "-v", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=330:duration=4",
    "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv444p",
    "-c:a", "aac", "-shortest", "-y", file,
  ]);
  const buffer = readFileSync(file);
  rmSync(dir, { recursive: true, force: true });
  expect(buffer.length).toBeGreaterThan(10 * 1024 * 1024);

  // The connection drops while part 2 is on its way; it comes back a moment later.
  const putsPerPart = new Map<string, number>();
  let dropped = false;
  await context.route(/[?&]partNumber=\d+/, async (route) => {
    const part = new URL(route.request().url()).searchParams.get("partNumber")!;
    putsPerPart.set(part, (putsPerPart.get(part) ?? 0) + 1);
    if (part === "2" && !dropped) {
      dropped = true;
      await context.setOffline(true);
      setTimeout(() => void context.setOffline(false), 1_500);
      return route.abort("internetdisconnected");
    }
    return route.continue();
  });

  await signUp(page, { name: "Long form", email: uniqueEmail("large") });
  await page.getByTestId("new-video-input").setInputFiles({ name: "Long talk.mp4", mimeType: "video/mp4", buffer });
  const card = page.getByRole("article", { name: "Long talk" });
  await expect(card.getByText("Ready")).toBeVisible({ timeout: 90_000 });

  // Parts cut off by the drop (up to the 4 sent at once) were sent again, each once — never the whole file over and over.
  const parts = Math.ceil(buffer.length / (5 * 1024 * 1024));
  expect([...putsPerPart.keys()].sort()).toEqual(Array.from({ length: parts }, (_, index) => String(index + 1)));
  expect(putsPerPart.get("2")).toBe(2);
  expect(Math.max(...putsPerPart.values())).toBe(2);
});
