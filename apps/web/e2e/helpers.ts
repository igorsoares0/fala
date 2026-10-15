import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const TEST_PASSWORD = "correct-horse-battery";

const FIXTURES = path.resolve(__dirname, "../../../fixtures/media");

export function uniqueEmail(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}@e2e.test`;
}

export async function signUp(page: Page, { name, email }: { name: string; email: string }) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
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
