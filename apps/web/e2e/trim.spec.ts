import { expect, test, type Page } from "@playwright/test";
import { openReadyProject } from "./helpers";

const blocks = (page: Page) => page.getByTestId("caption-block");
const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });

// The fixture is 2 s long, with three caption blocks starting at 0.0 s, 0.5 s and 1.2 s.
test("trim the start of the video: preview, captions, undo, persistence and export follow", async ({ page }) => {
  test.setTimeout(180_000);
  const url = await openReadyProject(page, "trim");
  const time = page.getByTestId("playback-time");
  await expect(time).toHaveText("00:00.0 / 00:02.0");

  // Trimming puts a handle at each end of the bar; the start one moves 0.1 s per arrow press.
  await page.getByRole("button", { name: "Trim", exact: true }).click();
  const summary = page.getByTestId("trim-summary");
  await expect(summary).toHaveText("00:00.0 → 00:02.0 · 00:02.0");
  const start = page.getByRole("slider", { name: "Trim start" });
  await start.focus();
  for (let press = 0; press < 6; press++) await start.press("ArrowRight");
  await expect(summary).toHaveText("00:00.6 → 00:02.0 · 00:01.4");
  await expect(start).toHaveAttribute("aria-valuenow", "600");

  // The first block ends before the cut: it's marked, not deleted. The second now opens the video.
  await expect(blocks(page)).toHaveCount(3);
  await expect(blocks(page).first()).toHaveAttribute("data-cut", "true");
  await expect(blocks(page).first()).toContainText("trimmed out");
  await expect(blocks(page).nth(1).getByRole("button", { name: /Play from/ })).toHaveText(/^00:00\.0 →/);

  // One undo step for the whole move of an edge.
  await page.keyboard.press("Control+z");
  await expect(summary).toHaveText("00:00.0 → 00:02.0 · 00:02.0");
  await expect(page.getByRole("button", { name: "Reset" })).toBeDisabled();
  await expect(blocks(page).first()).not.toHaveAttribute("data-cut", "true");
  await page.keyboard.press("Control+Shift+z");
  await expect(summary).toHaveText("00:00.6 → 00:02.0 · 00:01.4");
  await expect(page.getByText("Redone: trim")).toBeVisible();

  // The kept part can't get shorter than a second.
  const end = page.getByRole("slider", { name: "Trim end" });
  await end.focus();
  await end.press("Home");
  await expect(summary).toHaveText("00:00.6 → 00:01.6 · 00:01.0");
  await end.press("End");
  await expect(summary).toHaveText("00:00.6 → 00:02.0 · 00:01.4");

  // Outside trimming, the bar and the clock read like the finished video.
  await page.getByRole("button", { name: "Done" }).click();
  await expect(summary).toBeHidden();
  // The playhead is where the last edge moved: at the end of the kept part.
  await expect(time).toHaveText("00:01.4 / 00:01.4");
  await expect(page.getByRole("button", { name: "Trimmed", exact: true })).toBeVisible();
  await saved(page);

  await page.reload();
  await expect(page.getByRole("button", { name: "Trimmed", exact: true })).toBeVisible();
  await expect(time).toHaveText("00:00.0 / 00:01.4");
  await expect(blocks(page).first()).toHaveAttribute("data-cut", "true");
  // Playback starts on the first frame that's kept.
  await expect
    .poll(() => page.getByTestId("project-video").evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(0.6, 1);

  // The export freezes the trim and renders only the kept part.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export video" });
  await expect(dialog.getByText("Bold Highlight · 2 blocks · 00:01.4")).toBeVisible();
  await dialog.getByRole("button", { name: "Render" }).click();
  await expect(page.getByRole("dialog", { name: "Done." })).toBeVisible({ timeout: 60_000 });

  const projectId = new URL(url).pathname.split("/").at(-1);
  const response = await page.request.get(`/api/projects/${projectId}/exports`);
  const { exports } = (await response.json()) as { exports: { status: string; durationMs: number }[] };
  expect(exports[0].status).toBe("SUCCEEDED");
  expect(Math.abs(exports[0].durationMs - 1400)).toBeLessThanOrEqual(500);
});
