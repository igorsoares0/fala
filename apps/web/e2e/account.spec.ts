import { expect, test } from "@playwright/test";
import { signUp, TEST_PASSWORD, uniqueEmail } from "./helpers";

// The test database, to read queued emails (the worker only prints them in tests).
async function testDb() {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  return (await import("@fala/db")).db;
}

test("profile, preferences and password link", async ({ page }) => {
  const email = uniqueEmail("account");
  await signUp(page, { name: "Account Person", email });
  await page.goto("/account");

  await page.getByLabel("Name").fill("Renamed Person");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved" })).toBeVisible();

  const exportEmails = page.getByRole("switch", { name: "Email me when an export finishes" });
  await expect(exportEmails).toHaveAttribute("aria-checked", "true");
  await exportEmails.click();
  await expect(exportEmails).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Email me when an export finishes" })).toHaveAttribute("aria-checked", "false");

  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(`Link sent to ${email}. It expires in 30 minutes.`)).toBeVisible();

  const db = await testDb();
  const templates = (await db.job.findMany({ where: { type: "SEND_EMAIL", payload: { path: ["to"], equals: email } }, select: { payload: true } })).map(
    (job) => (job.payload as { template: string }).template,
  );
  expect(templates).toEqual(expect.arrayContaining(["welcome", "reset-password"]));
});

test("changing the email asks the new address to confirm it", async ({ page }) => {
  const email = uniqueEmail("oldaddr");
  await signUp(page, { name: "Mover", email });
  await page.goto("/account");
  const next = uniqueEmail("newaddr");
  await page.getByLabel("Email", { exact: true }).fill(next);
  await expect(page.getByText("Until you click it, your current email stays active.")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved" })).toBeVisible();

  const db = await testDb();
  await expect
    .poll(async () => db.job.count({ where: { type: "SEND_EMAIL", payload: { path: ["to"], equals: next } } }))
    .toBe(1);
  // Still the old address until confirmed.
  expect(await db.user.count({ where: { email } })).toBe(1);
});

test("deleting the account needs the email typed, then signs out for good", async ({ page }) => {
  const email = uniqueEmail("leaving");
  await signUp(page, { name: "Leaving", email });
  await page.goto("/account");
  await page.getByRole("button", { name: "Delete account" }).click();

  const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
  const forever = dialog.getByRole("button", { name: "Delete forever" });
  await expect(forever).toBeDisabled();
  await dialog.getByLabel("Account email").fill(email);
  await forever.click();

  await expect(page).toHaveURL(/\/sign-in\?deleted=1/);
  await expect(page.getByText("Account deleted. Your files will be removed within 7 days.")).toBeVisible();

  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});
