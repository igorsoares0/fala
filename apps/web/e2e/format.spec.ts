import { expect, test, type Page } from "@playwright/test";
import { openReadyProject } from "./helpers";

const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });

/** Width ÷ height of the preview frame on screen. */
async function frameRatio(page: Page) {
  const box = await page.getByTestId("preview-frame").boundingBox();
  return box!.width / box!.height;
}

const objectPosition = (page: Page) =>
  page.getByTestId("project-video").evaluate((video) => getComputedStyle(video).objectPosition);

/** The inline `bottom` of the caption block (set for the "bottom" position). */
const captionBottom = (page: Page) =>
  page.getByTestId("caption-overlay").locator("> div").evaluate((box: HTMLElement) => box.style.bottom);

// The fixture is a 640×360 landscape clip.
test("choose a format: the preview crops, captions clear the apps' interface, and the export follows", async ({ page }) => {
  test.setTimeout(180_000);
  await openReadyProject(page, "format");
  const label = page.getByTestId("frame-label");
  const format = page.getByRole("radiogroup", { name: "Format" });
  await expect(label).toHaveText("YOUR VIDEO · 640×360");
  await expect(format.getByRole("radio", { name: "Original" })).toHaveAttribute("aria-checked", "true");
  expect(await frameRatio(page)).toBeCloseTo(16 / 9, 1);
  await expect(page.getByRole("slider", { name: /Framing/ })).toBeHidden();

  // 9:16 crops the sides. The safe-zone guide stays out of the way until it's asked for.
  await format.getByRole("radio", { name: "9:16" }).click();
  await expect(label).toHaveText("9:16 · CROPPED FROM 640×360");
  await expect(page.getByTestId("format-hint")).toContainText("TikTok");
  await expect.poll(() => frameRatio(page)).toBeCloseTo(9 / 16, 1);
  await expect(page.getByTestId("safe-zones")).toBeHidden();
  expect(await objectPosition(page)).toBe("50% 50%");

  // One undo step, like any other edit.
  await page.keyboard.press("Control+z");
  await expect(label).toHaveText("YOUR VIDEO · 640×360");
  await page.keyboard.press("Control+Shift+z");
  await expect(label).toHaveText("9:16 · CROPPED FROM 640×360");

  await page.getByText("Safe zones").click();
  await expect(page.getByTestId("safe-zones")).toBeVisible();

  // Framing slides the crop along the axis it cuts.
  await page.getByRole("slider", { name: /Framing/ }).fill("80");
  await expect.poll(() => objectPosition(page)).toBe("80% 50%");
  // Undo works with the focus still on the slider, which has no undo of its own.
  await expect(page.getByRole("slider", { name: /Framing/ })).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect.poll(() => objectPosition(page)).toBe("50% 50%");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => objectPosition(page)).toBe("80% 50%");

  // In a full-screen vertical frame, "Bottom" sits above the apps' interface.
  await page.getByRole("radio", { name: "Bottom", exact: true }).click();
  await expect.poll(() => captionBottom(page)).toBe("27%");
  await format.getByRole("radio", { name: "1:1" }).click();
  await expect.poll(() => frameRatio(page)).toBeCloseTo(1, 1);
  await expect(page.getByTestId("safe-zones")).toBeHidden();
  await expect.poll(() => captionBottom(page)).toBe("14%");

  // Back to 9:16 (centered again): the guide is still on.
  await format.getByRole("radio", { name: "9:16" }).click();
  expect(await objectPosition(page)).toBe("50% 50%");
  await page.getByRole("slider", { name: /Framing/ }).fill("100");
  await expect(page.getByTestId("safe-zones")).toBeVisible();
  await saved(page);

  // The format is part of the project; showing the guide is remembered by the browser.
  await page.reload();
  await expect(format.getByRole("radio", { name: "9:16" })).toHaveAttribute("aria-checked", "true");
  await expect(label).toHaveText("9:16 · CROPPED FROM 640×360");
  expect(await objectPosition(page)).toBe("100% 50%");
  await expect(page.getByRole("slider", { name: /Framing/ })).toHaveValue("100");
  await expect(page.getByTestId("safe-zones")).toBeVisible();
  await page.getByText("Safe zones").click();
  await expect(page.getByTestId("safe-zones")).toBeHidden();

  // The export is rendered in that shape: 360 px tall, 202 px wide.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export video" });
  await expect(dialog.getByText("· 9:16")).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /720p/ })).toContainText("202×360");
  await dialog.getByRole("button", { name: "Render" }).click();
  const done = page.getByRole("dialog", { name: "Done." });
  await expect(done).toBeVisible({ timeout: 60_000 });
  await expect(done.getByText(/^format-clip_v1\.mp4 · 202×360 · /)).toBeVisible();
});
