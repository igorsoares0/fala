import { expect, test, type Page } from "@playwright/test";
import { bufferVideo, createProject, PROCESSING_TIMEOUT, signUp, uniqueEmail } from "./helpers";

// WEBM because Playwright's Chromium can't decode H.264. The worker uses scripted
// captions (fake transcription): 11 words, 3 words per block by default.
async function openReadyProject(page: Page, label: string) {
  await signUp(page, { name: "Editor", email: uniqueEmail(label) });
  const card = await createProject(page, `${label} clip.webm`, "landscape-2s.webm");
  await expect(card.getByText("Ready")).toBeVisible({ timeout: PROCESSING_TIMEOUT });
  await card.getByRole("link", { name: `Open ${label} clip` }).click();
  await expect(page.getByTestId("caption-overlay")).toBeVisible();
}

const overlayFont = (page: Page) =>
  page.getByTestId("caption-overlay").locator("span").first().evaluate((el) => getComputedStyle(el).fontFamily);

test("captions play over the video, word by word", async ({ page }) => {
  await openReadyProject(page, "playback");
  const overlay = page.getByTestId("caption-overlay");
  await expect(overlay).toContainText("It's");
  await expect(overlay.locator("[data-active]")).toHaveText("It's");

  const video = await bufferVideo(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  // The highlighted word moves on, and later the block changes too — timed by the video's clock.
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.6);
  await expect(overlay.locator("[data-active]")).not.toHaveText("It's", { timeout: 10_000 });
  await expect(page.getByTestId("caption-block").nth(1)).toHaveAttribute("aria-current", "true", { timeout: 10_000 });
  expect(Number(await page.getByRole("slider", { name: "Playback position" }).getAttribute("aria-valuenow"))).toBeGreaterThan(0);
});

test("a preset applies at once, persists, and shows on the dashboard card", async ({ page }) => {
  await openReadyProject(page, "preset");
  expect(await overlayFont(page)).toMatch(/Anton/i);

  await page.getByRole("radio", { name: /Word Highlight/ }).click();
  expect(await overlayFont(page)).toMatch(/Archivo/i);
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radio", { name: /Word Highlight/ })).toHaveAttribute("aria-checked", "true");
  expect(await overlayFont(page)).toMatch(/Archivo/i);

  await page.getByRole("link", { name: "← Projects" }).click();
  const sample = page.getByRole("article", { name: "preset clip" }).locator("[data-active]");
  await expect(sample).toBeVisible();
  expect(await sample.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Archivo/i);
});

test("words per block re-segments the captions and persists", async ({ page }) => {
  await openReadyProject(page, "segments");
  const blocks = page.getByTestId("caption-block");
  const before = await blocks.count();

  await page.getByRole("button", { name: "Fewer words per block" }).click();
  await page.getByRole("button", { name: "Fewer words per block" }).click();
  await expect(blocks).toHaveCount(11);
  expect(before).toBeLessThan(11);
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await page.reload();
  await expect(blocks).toHaveCount(11);
});

test("keyboard: space plays and pauses, arrows move between blocks", async ({ page }) => {
  await openReadyProject(page, "keys");
  await page.getByRole("heading", { name: "Captions" }).click();

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Play from 00:00.0" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("caption-block").nth(1)).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("caption-block").first()).toHaveAttribute("aria-current", "true");
});

test("restore default appears only after an adjustment", async ({ page }) => {
  await openReadyProject(page, "restore");
  const restore = page.getByRole("button", { name: "Restore default" });
  await expect(restore).toHaveCount(0);

  // The checkbox is visually hidden inside its label; people click the label.
  await page.locator("label", { hasText: "Shadow" }).click();
  await expect(page.getByRole("checkbox", { name: "Shadow" })).not.toBeChecked();
  await expect(restore).toBeVisible();
  await expect(page.getByText("edited", { exact: true })).toBeVisible();

  await restore.click();
  await expect(restore).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Shadow" })).toBeChecked();
});

test("the style panel becomes a drawer on medium screens and a tab on phones", async ({ page }) => {
  await openReadyProject(page, "responsive");
  const presets = page.getByRole("radiogroup", { name: "Preset" });

  await page.setViewportSize({ width: 900, height: 800 });
  await expect(presets).toBeHidden();
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await expect(presets).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(presets).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Style" }).click();
  await expect(presets).toBeVisible();
  await expect(page.getByTestId("caption-block").first()).toBeHidden();
  await page.getByRole("tab", { name: "Captions" }).click();
  await expect(page.getByTestId("caption-block").first()).toBeVisible();
});
