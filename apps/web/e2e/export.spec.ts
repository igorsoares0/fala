import { expect, test } from "@playwright/test";
import { createProject, openReadyProject, signUp, uniqueEmail } from "./helpers";

// A real render: the test worker draws the captions with Chromium and encodes with FFmpeg.
test("export an MP4, download it, and keep earlier versions", async ({ page }) => {
  test.setTimeout(120_000);
  await openReadyProject(page, "export");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export video" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Bold Highlight · 3 blocks · 00:02.0")).toBeVisible();
  // The fixture is 640×360: 1080p would add nothing, so only 720p (its original size) is offered.
  await expect(dialog.getByRole("radio", { name: /1080p/ })).toBeDisabled();
  await expect(dialog.getByRole("radio", { name: /720p/ })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Render" }).click();

  // Rendering → Done. The header button mirrors the render while it runs.
  const done = page.getByRole("dialog", { name: "Done." });
  await expect(done).toBeVisible({ timeout: 60_000 });
  await expect(done.getByText(/^export-clip_v1\.mp4 · 640×360 · [\d.]+ (KB|MB)$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();

  // The download goes through a short-lived signed URL that saves the file under its friendly name.
  const href = await done.getByRole("link", { name: "Download MP4" }).getAttribute("href");
  expect(href).toMatch(/^\/api\/exports\/[^/]+\/download$/);
  const redirect = await page.request.get(href!, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  const file = await page.request.get(redirect.headers().location);
  expect(file.ok()).toBe(true);
  expect(file.headers()["content-disposition"]).toContain("export-clip_v1.mp4");
  expect((await file.body()).subarray(4, 8).toString("latin1")).toBe("ftyp");

  // A new version never replaces the old one.
  await done.getByRole("button", { name: "New version" }).click();
  await dialog.getByRole("button", { name: "Render" }).click();
  await expect(done).toBeVisible({ timeout: 60_000 });
  await expect(done.getByText(/^export-clip_v2\.mp4/)).toBeVisible();
  const versions = done.getByTestId("export-version");
  await expect(versions).toHaveCount(1);
  await expect(versions.first()).toContainText("v1");

  await page.keyboard.press("Escape");
  await expect(done).toBeHidden();
  await page.getByRole("link", { name: "← Projects" }).click();
  await expect(page.getByRole("article", { name: "export clip" }).getByText("Exported")).toBeVisible();
});

test("export stays unavailable until the project has captions", async ({ page }) => {
  await signUp(page, { name: "Editor", email: uniqueEmail("unavailable") });
  const card = await createProject(page, "broken.mp4", "not-a-video.mp4");
  await expect(card.getByText("Error")).toBeVisible({ timeout: 30_000 });
  await card.getByRole("link", { name: "Open broken" }).click();
  await expect(page.getByRole("button", { name: "Export" })).toBeDisabled();
});
