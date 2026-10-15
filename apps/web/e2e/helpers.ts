import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const TEST_PASSWORD = "correct-horse-battery";

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

/** Creates a project by choosing a (fake) video file in the drop zone; resolves on the project page. */
export async function createProject(page: Page, fileName: string) {
  await page.getByTestId("new-video-input").setInputFiles({
    name: fileName,
    mimeType: "video/mp4",
    buffer: Buffer.from("not really a video"),
  });
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
}
