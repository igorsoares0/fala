import { expect, test } from "@playwright/test";

test("the public website works signed out: landing, pricing and policies", async ({ page }) => {
  // Loaded the way the database helpers load it (ESM): mixing a static import of a
  // workspace package with their dynamic imports breaks module loading in one worker.
  const { PLANS } = await import("@fala/shared");
  const response = await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Captions that land on every word");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  const pricing = page.getByRole("region", { name: "Pricing" });
  for (const plan of Object.values(PLANS)) {
    const card = pricing.getByRole("article", { name: plan.name });
    await expect(card).toContainText(`$${plan.monthlyUsd}`);
    await expect(card).toContainText(`${plan.monthlyMinutes} minutes`);
  }

  // Security headers on every page.
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");

  for (const [link, title] of [
    ["Terms", "Terms of Service"],
    ["Privacy", "Privacy Policy"],
    ["Refunds", "Refund Policy"],
  ]) {
    await page.getByRole("contentinfo").getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  }
  await expect(page.getByText("Paddle.com").first()).toBeVisible();
});

test("the app itself still needs an account", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
});
