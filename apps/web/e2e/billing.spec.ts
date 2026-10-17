import { expect, test } from "@playwright/test";
import { openReadyProject, signUp, uniqueEmail, videoFile } from "./helpers";

// The test database, for seeding usage the UI can't create quickly.
async function testDb() {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  return (await import("@fala/db")).db;
}

test("usage shows in the header and on Plan & usage, and Free exports stay at 720p", async ({ page }) => {
  await openReadyProject(page, "usage");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export video" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("radio", { name: /1080p/ })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /1080p/ })).toContainText("Creator and Pro");
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "← Projects" }).click();
  const meter = page.getByRole("link", { name: /of 10 minutes used\. Free plan/ });
  await expect(meter).toContainText("1 of 10 min");
  await expect(page.getByText("up to 3 min · 4 GB")).toBeVisible();

  await meter.click();
  await expect(page.getByRole("heading", { name: "Plan & usage" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Your plan" })).toContainText("up to 3 min");
  await expect(page.getByRole("article", { name: "Free" })).toContainText("YOUR PLAN");
  // Monthly / yearly prices; checkout stays unavailable without Paddle keys (as in tests).
  const creator = page.getByRole("article", { name: "Creator" });
  await expect(creator).toContainText("$12");
  await page.getByRole("radio", { name: /Yearly/ }).click();
  await expect(creator).toContainText("$9");
  await expect(creator).toContainText("billed $108 once a year");

  const row = page.getByTestId("usage-row").first();
  await expect(row).toContainText("usage clip");
  await expect(row).toContainText("confirmed");
});

test("with no minutes left, a new video is refused before uploading", async ({ page }) => {
  const email = uniqueEmail("nominutes");
  await signUp(page, { name: "Out of minutes", email });
  const db = await testDb();
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const periodKey = new Date().toISOString().slice(0, 7);
  await db.usageEntry.create({
    data: { userId: user.id, periodKey, usageType: "TRANSCRIPTION", seconds: 600, status: "CONFIRMED", idempotencyKey: `e2e:${user.id}` },
  });

  await page.reload();
  await expect(page.getByRole("link", { name: /10 of 10 minutes used/ })).toBeVisible();
  await page.getByTestId("new-video-input").setInputFiles(videoFile("One more.mp4"));
  await expect(page.getByRole("alert").filter({ hasText: "You've used all your minutes" })).toBeVisible();
  await expect(page.getByRole("article", { name: "One more" })).toHaveCount(0);

  await page.goto("/billing");
  await expect(page.getByRole("status")).toContainText("You've used this period's 10 minutes");
});
