import { expect, test } from "@playwright/test";
import { createProject, signUp, uniqueEmail, videoFile } from "./helpers";

// The worker runs during E2E (see playwright.config.ts); validation takes a few seconds.
const PROCESSING_TIMEOUT = 30_000;

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

  const video = page.getByTestId("project-video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1);

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
  await expect(blocks.nth(1)).toHaveAttribute("aria-current", "true", { timeout: 5_000 });
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
