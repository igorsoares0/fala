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

  await card.getByRole("link", { name: "Open Beach day" }).click();
  await expect(page.getByText("YOUR VIDEO · 720×1280")).toBeVisible();
  await expect(page.getByRole("img", { name: "First frame of your video" })).toBeVisible();
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
