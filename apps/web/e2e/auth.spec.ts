import { expect, test } from "@playwright/test";
import { TEST_PASSWORD, signUp, uniqueEmail } from "./helpers";

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("sign-in form validates before calling the server", async ({ page }) => {
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill("ana@example");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("That email doesn't look complete. Check it and try again.");

  // The error clears as soon as the offending field is edited.
  await page.getByLabel("Email").fill("ana@example.com");
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);

  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Enter your password.");

  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Use at least 8 characters.");
});

test("forgot password never reveals whether an account exists", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByRole("button", { name: "Forgot password" }).click();
  await expect(page.locator("form").getByRole("status")).toHaveText(
    "If there's an account for nobody@example.com, we sent a sign-in link. It expires in 30 minutes.",
  );
});

test("wrong password shows a generic error", async ({ page }) => {
  const email = uniqueEmail("wrong-pass");
  await signUp(page, { name: "Wrong Pass", email });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(`${TEST_PASSWORD}-nope`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("That email and password don't match. Check them and try again.");
});

test("sign up, sign out, sign back in", async ({ page }) => {
  const email = uniqueEmail("roundtrip");
  await signUp(page, { name: "Ana Lima", email });

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("0 videos")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveText("AL");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});
