import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const TEST_PASSWORD = "correct-horse-battery";

/**
 * How long a test waits for the worker to validate and transcribe an upload. Alone it
 * takes seconds; with the whole suite in parallel (renders included) the queue backs up.
 */
export const PROCESSING_TIMEOUT = 60_000;

const FIXTURES = path.resolve(__dirname, "../../../fixtures/media");

export function uniqueEmail(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}@e2e.test`;
}

/** Signs up and, unless `confirm` is false, opens the confirmation link like the user would (uploads wait for it). */
export async function signUp(page: Page, { name, email, confirm = true }: { name: string; email: string; confirm?: boolean }) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  if (!confirm) return;
  await page.goto(await confirmationLink(email));
  await expect(page).toHaveURL(/\/projects$/);
  await waitForDropZone(page);
  await expect(page.getByText("Confirm your email to upload videos")).toHaveCount(0);
}

/**
 * Waits until React has hydrated the dashboard's file input. After a full page load
 * (the confirmation link), a file set any earlier fires a change nobody listens to.
 */
export async function waitForDropZone(page: Page) {
  await page.waitForFunction(() => {
    const input = document.querySelector('[data-testid="new-video-input"]');
    return input !== null && Object.keys(input).some((key) => key.startsWith("__reactProps"));
  });
}

/** The link in the newest "confirm your email" message queued for `email` (the worker only prints emails in tests). */
export async function confirmationLink(email: string): Promise<string> {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  const { db } = await import("@fala/db");
  const job = await db.job.findFirst({
    where: { type: "SEND_EMAIL", payload: { path: ["to"], equals: email }, AND: { payload: { path: ["template"], equals: "confirm-email" } } },
    orderBy: { createdAt: "desc" },
    select: { payload: true },
  });
  const url = (job?.payload as { data?: { url?: string } } | undefined)?.data?.url;
  if (!url) throw new Error(`No confirmation email queued for ${email}`);
  return url;
}

/** A fixture video presented to the browser under another file name. */
export function videoFile(fileName: string, fixture = "vertical-2s.mp4") {
  const mimeType = fixture.endsWith(".webm") ? "video/webm" : "video/mp4";
  return { name: fileName, mimeType, buffer: readFileSync(path.join(FIXTURES, fixture)) };
}

/**
 * Drops a video on the dashboard's drop zone. The project is created and starts
 * uploading in place; resolves with its card.
 */
export async function createProject(page: Page, fileName: string, fixture?: string) {
  await page.getByTestId("new-video-input").setInputFiles(videoFile(fileName, fixture));
  const card = page.getByRole("article", { name: fileName.replace(/\.[^.]+$/, "").replaceAll("_", " ") });
  await expect(card).toBeVisible();
  return card;
}

/**
 * Signs up, uploads the WEBM fixture (fake transcription, 3 words per block:
 * "It's the rhythm" · "that keeps you watching." · "Every word lands right")
 * and opens the editor once it's ready. Returns the editor's URL.
 */
export async function openReadyProject(page: Page, label: string) {
  await signUp(page, { name: "Editor", email: uniqueEmail(label) });
  const card = await createProject(page, `${label} clip.webm`, "landscape-2s.webm");
  await expect(card.getByText("Ready")).toBeVisible({ timeout: PROCESSING_TIMEOUT });
  await card.getByRole("link", { name: `Open ${label} clip` }).click();
  await expect(page.getByTestId("caption-block").first()).toBeVisible();
  return page.url();
}

/**
 * Waits until the editor's video can actually play. The player only preloads metadata,
 * and under load (the full suite renders and transcribes in parallel) fetching and
 * decoding can take seconds: tests that time playback must start from a buffered video.
 */
export async function bufferVideo(page: Page) {
  const video = page.getByTestId("project-video");
  await video.evaluate((element: HTMLVideoElement) => {
    element.muted = true;
    element.preload = "auto";
    if (element.readyState < 3) element.load();
  });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  return video;
}
